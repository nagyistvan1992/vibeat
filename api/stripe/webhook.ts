import Stripe from 'stripe';
import {
  upsertUserSubscription,
  updateSubscriptionByStripeCustomer,
} from '../../src/db/index.js';
import type { SubscriptionStatus } from '../../src/db/schema.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req: any): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'free';
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers?.['stripe-signature'];

  if (!stripeSecret || !webhookSecret) {
    return res.status(500).json({
      error: 'Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET on server.',
    });
  }

  if (!signature || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Missing stripe-signature header.' });
  }

  const stripe = new Stripe(stripeSecret);
  let event: Stripe.Event;

  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error('[Stripe Webhook] Signature verification failed:', err?.message);
    return res.status(400).json({ error: `Webhook Error: ${err?.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserId =
          session.client_reference_id || session.metadata?.clerkUserId || '';
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id || null;
        const email =
          session.customer_details?.email ||
          session.customer_email ||
          `${clerkUserId}@vebeat.ro`;

        let subscriptionEndDate: Date | null = null;
        if (session.subscription) {
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          try {
            const sub = await stripe.subscriptions.retrieve(subId);
            const periodEnd = (sub as any).current_period_end;
            if (typeof periodEnd === 'number') {
              subscriptionEndDate = new Date(periodEnd * 1000);
            }
          } catch {
            // fallback to +30 days if retrieve fails
            subscriptionEndDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
          }
        }

        if (clerkUserId) {
          await upsertUserSubscription({
            id: clerkUserId,
            email,
            subscription_status: 'active',
            stripe_customer_id: customerId,
            subscription_end_date: subscriptionEndDate,
          });
        } else if (customerId) {
          await updateSubscriptionByStripeCustomer({
            stripe_customer_id: customerId,
            subscription_status: 'active',
            subscription_end_date: subscriptionEndDate,
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;
        const clerkUserId = subscription.metadata?.clerkUserId || '';
        const mappedStatus = mapStripeStatus(subscription.status);
        const periodEnd = (subscription as any).current_period_end;
        const subscriptionEndDate =
          typeof periodEnd === 'number' ? new Date(periodEnd * 1000) : null;

        if (clerkUserId) {
          await upsertUserSubscription({
            id: clerkUserId,
            email: `${clerkUserId}@atelierculinary.hu`,
            subscription_status: mappedStatus,
            stripe_customer_id: customerId,
            subscription_end_date: subscriptionEndDate,
          });
        } else {
          await updateSubscriptionByStripeCustomer({
            stripe_customer_id: customerId,
            subscription_status: mappedStatus,
            subscription_end_date: subscriptionEndDate,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;
        const clerkUserId = subscription.metadata?.clerkUserId || '';

        if (clerkUserId) {
          await upsertUserSubscription({
            id: clerkUserId,
            email: `${clerkUserId}@atelierculinary.hu`,
            subscription_status: 'canceled',
            stripe_customer_id: customerId,
            subscription_end_date: new Date(),
          });
        } else {
          await updateSubscriptionByStripeCustomer({
            stripe_customer_id: customerId,
            subscription_status: 'canceled',
            subscription_end_date: new Date(),
          });
        }
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ received: true, type: event.type });
  } catch (err: any) {
    console.error('[Stripe Webhook] Handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed.' });
  }
}
