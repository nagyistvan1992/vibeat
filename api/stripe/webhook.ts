import Stripe from 'stripe';
import {
  upsertUserSubscription,
  updateSubscriptionByStripeCustomer,
} from '../../src/db/index.js';
import type { SubscriptionStatus } from '../../src/db/schema.js';

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

function extractPeriodEnd(sub: Stripe.Subscription | null | undefined): Date | null {
  if (!sub) return null;
  const raw =
    (sub as any).current_period_end ?? (sub.items?.data?.[0] as any)?.current_period_end;
  return typeof raw === 'number' ? new Date(raw * 1000) : null;
}

export async function POST(request: Request): Promise<Response> {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get('stripe-signature');

  if (!stripeSecret || !webhookSecret) {
    return Response.json(
      { error: 'Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET on server.' },
      { status: 500 }
    );
  }

  if (!signature) {
    return Response.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecret);
  let event: Stripe.Event;

  try {
    const rawBody = Buffer.from(await request.arrayBuffer());
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error('[Stripe Webhook] Signature verification failed:', err?.message);
    return Response.json({ error: `Webhook Error: ${err?.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        const isPaid =
          event.type === 'checkout.session.async_payment_succeeded' ||
          session.payment_status === 'paid' ||
          session.payment_status === 'no_payment_required';

        if (!isPaid) break;

        const clerkUserId =
          session.client_reference_id || session.metadata?.clerkUserId || '';
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id || null;
        const email =
          session.customer_details?.email ||
          session.customer_email ||
          (clerkUserId ? `${clerkUserId}@vebeat.ro` : undefined);

        let subscriptionEndDate: Date | null = null;
        if (session.subscription) {
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          try {
            const sub = await stripe.subscriptions.retrieve(subId);
            subscriptionEndDate = extractPeriodEnd(sub);
          } catch {
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

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;
        const clerkUserId = subscription.metadata?.clerkUserId || '';
        const mappedStatus = mapStripeStatus(subscription.status);
        const subscriptionEndDate = extractPeriodEnd(subscription);

        if (clerkUserId) {
          await upsertUserSubscription({
            id: clerkUserId,
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

    return Response.json({ received: true, type: event.type }, { status: 200 });
  } catch (err: any) {
    console.error('[Stripe Webhook] Handler error:', err);
    return Response.json({ error: 'Webhook handler failed.' }, { status: 500 });
  }
}

export async function GET(): Promise<Response> {
  return Response.json(
    { error: 'Method Not Allowed' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
