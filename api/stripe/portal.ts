import Stripe from 'stripe';
import { verifyClerkRequest, resolveAppOrigin } from '../_lib/auth.js';
import { getUserById, upsertUserSubscription } from '../../src/db/index.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authUser = await verifyClerkRequest(req);
    if (!authUser) {
      return res.status(401).json({
        error: 'Az előfizetés kezeléséhez kérlek jelentkezz be.',
      });
    }

    let dbUser = await getUserById(authUser.userId);
    const origin = resolveAppOrigin(req);

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret || stripeSecret.startsWith('sk_test_...')) {
      if (process.env.VERCEL_ENV !== 'production') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
        if (body.action === 'cancel') {
          await upsertUserSubscription({
            id: authUser.userId,
            email: authUser.email,
            subscription_status: 'canceled',
            subscription_end_date: null,
          });
          return res.status(200).json({
            url: `${origin}/#/profil?portal=canceled`,
            mode: 'dev_simulated_portal',
          });
        }
        return res.status(200).json({
          url: `${origin}/#/profil?portal=manage`,
          mode: 'dev_simulated_portal',
        });
      }
      return res.status(500).json({
        error: 'A STRIPE_SECRET_KEY környezeti változó nincs beállítva a szerveren.',
      });
    }

    const stripe = new Stripe(stripeSecret);
    let customerId =
      dbUser?.stripe_customer_id && !dbUser.stripe_customer_id.startsWith('cus_dev_')
        ? dbUser.stripe_customer_id
        : null;

    if (!customerId && authUser.email && !authUser.email.endsWith('@clerk.user')) {
      const found = await stripe.customers.list({ email: authUser.email, limit: 5 });
      const match = found.data.find(
        c =>
          !(c as any).deleted &&
          (!c.metadata?.clerkUserId || c.metadata.clerkUserId === authUser.userId)
      );
      if (match) {
        customerId = match.id;
        dbUser = await upsertUserSubscription({
          id: authUser.userId,
          email: authUser.email,
          stripe_customer_id: customerId,
        });
      }
    }

    if (!customerId) {
      return res.status(400).json({
        error: 'Nincs aktív Stripe ügyfél-azonosító ehhez a fiókhoz.',
      });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/#/profil`,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err: any) {
    console.error('[POST /api/stripe/portal] Error:', err);
    return res.status(500).json({
      error: err?.message || 'Nem sikerült megnyitni a Stripe ügyfélportált.',
    });
  }
}
