import Stripe from 'stripe';
import { verifyClerkRequest } from './_lib/auth.js';
import { getUserById, upsertUserSubscription } from '../src/db/index.js';

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

    // Immediate Stripe Checkout Session verification when returning before webhook completes
    const rawSessionId = req.query?.session_id;
    const sessionId = Array.isArray(rawSessionId)
      ? rawSessionId[0]
      : typeof rawSessionId === 'string'
        ? rawSessionId.trim()
        : '';
    const stripeSecret = process.env.STRIPE_SECRET_KEY;

    if (
      sessionId &&
      dbUser.subscription_status !== 'active' &&
      stripeSecret &&
      !stripeSecret.startsWith('sk_test_...')
    ) {
      try {
        const stripe = new Stripe(stripeSecret);
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const ownerMatch =
          session.client_reference_id === authUser.userId ||
          session.metadata?.clerkUserId === authUser.userId;
        const paid = session.status === 'complete' || session.payment_status === 'paid';
        if (ownerMatch && paid) {
          const customerId =
            typeof session.customer === 'string'
              ? session.customer
              : session.customer?.id || dbUser.stripe_customer_id;
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
              subscriptionEndDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
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
        console.warn('[GET /api/me] Stripe session fallback verify failed:', err);
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
