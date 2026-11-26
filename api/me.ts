import Stripe from 'stripe';
import { verifyClerkRequest } from './_lib/auth.js';
import { getUserById, upsertUserSubscription } from '../src/db/index.js';

function extractPeriodEnd(sub: Stripe.Subscription | null | undefined): Date | null {
  if (!sub) return null;
  const raw =
    (sub as any).current_period_end ?? (sub.items?.data?.[0] as any)?.current_period_end;
  return typeof raw === 'number' ? new Date(raw * 1000) : null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authUser = await verifyClerkRequest(req);
    if (!authUser) {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.status(200).json({
        authenticated: false,
        user: null,
      });
    }

    let dbUser = await getUserById(authUser.userId);
    if (!dbUser) {
      dbUser = await upsertUserSubscription({
        id: authUser.userId,
        email: authUser.email,
        subscription_status: 'free',
      });
    } else if (
      authUser.email &&
      !authUser.email.endsWith('@clerk.user') &&
      dbUser.email !== authUser.email
    ) {
      dbUser = await upsertUserSubscription({
        id: authUser.userId,
        email: authUser.email,
      });
    }

    const rawSessionId = req.query?.session_id;
    const sessionId = Array.isArray(rawSessionId)
      ? rawSessionId[0]
      : typeof rawSessionId === 'string'
        ? rawSessionId.trim()
        : '';
    const shouldReconcile = req.query?.reconcile === '1' || Boolean(sessionId);
    const stripeSecret = process.env.STRIPE_SECRET_KEY;

    if (
      dbUser.subscription_status !== 'active' &&
      stripeSecret &&
      !stripeSecret.startsWith('sk_test_...')
    ) {
      const stripe = new Stripe(stripeSecret);

      // 1. Direct Stripe Checkout Session verification when returning from Stripe redirect
      if (sessionId) {
        try {
          const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['subscription'],
          });
          const ownerMatch =
            session.client_reference_id === authUser.userId ||
            session.metadata?.clerkUserId === authUser.userId;
          const paid =
            session.status === 'complete' &&
            (session.payment_status === 'paid' ||
              session.payment_status === 'no_payment_required');

          if (ownerMatch && paid) {
            const customerId =
              typeof session.customer === 'string'
                ? session.customer
                : session.customer?.id || dbUser.stripe_customer_id;
            let subscriptionEndDate: Date | null = null;
            if (session.subscription) {
              if (typeof session.subscription === 'object') {
                subscriptionEndDate = extractPeriodEnd(session.subscription);
              } else {
                try {
                  const sub = await stripe.subscriptions.retrieve(session.subscription);
                  subscriptionEndDate = extractPeriodEnd(sub);
                } catch {
                  subscriptionEndDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
                }
              }
            }
            dbUser = await upsertUserSubscription({
              id: authUser.userId,
              email: authUser.email,
              subscription_status: 'active',
              stripe_customer_id: customerId ?? null,
              subscription_end_date: subscriptionEndDate,
            });
          }
        } catch (err) {
          console.warn('[GET /api/me] Stripe session verify failed:', err);
        }
      }

      // 2. Stripe subscription reconciliation (heals missed webhooks or reloads without session_id)
      if (dbUser.subscription_status !== 'active' && shouldReconcile) {
        try {
          let matchedSub: Stripe.Subscription | null = null;
          let matchedCustomerId: string | null = dbUser.stripe_customer_id;

          if (matchedCustomerId && !matchedCustomerId.startsWith('cus_dev_')) {
            const subs = await stripe.subscriptions.list({
              customer: matchedCustomerId,
              status: 'all',
              limit: 5,
            });
            matchedSub =
              subs.data.find(s => s.status === 'active' || s.status === 'trialing') || null;
          }

          if (
            !matchedSub &&
            authUser.email &&
            !authUser.email.endsWith('@clerk.user')
          ) {
            const customers = await stripe.customers.list({
              email: authUser.email,
              limit: 5,
              expand: ['data.subscriptions'],
            });
            for (const cust of customers.data) {
              if ((cust as any).deleted) continue;
              const subs = cust.subscriptions?.data || [];
              const activeSub = subs.find(s => {
                if (s.status !== 'active' && s.status !== 'trialing') return false;
                const subClerkId = s.metadata?.clerkUserId;
                const custClerkId = cust.metadata?.clerkUserId;
                if (subClerkId) return subClerkId === authUser.userId;
                if (custClerkId) return custClerkId === authUser.userId;
                return cust.email?.toLowerCase() === authUser.email.toLowerCase();
              });
              if (activeSub) {
                matchedSub = activeSub;
                matchedCustomerId = cust.id;
                break;
              }
            }
          }

          if (matchedSub) {
            dbUser = await upsertUserSubscription({
              id: authUser.userId,
              email: authUser.email,
              subscription_status: 'active',
              stripe_customer_id: matchedCustomerId,
              subscription_end_date: extractPeriodEnd(matchedSub),
            });
          }
        } catch (err) {
          console.warn('[GET /api/me] Stripe subscription reconcile failed:', err);
        }
      }
    }

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(200).json({
      authenticated: true,
      user: dbUser,
    });
  } catch (err: any) {
    console.error('[GET /api/me] Error:', err);
    return res.status(500).json({ error: 'Nem sikerült lekérdezni a profil adatokat.' });
  }
}
