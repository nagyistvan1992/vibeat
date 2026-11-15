import Stripe from 'stripe';
import { verifyClerkRequest } from '../_lib/auth.js';
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
        error: 'Az előfizetés indításához kérlek jelentkezz be.',
      });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const returnSlug = typeof body.returnSlug === 'string' ? body.returnSlug : '';
    const plan = body.plan === 'yearly' ? 'yearly' : 'monthly';
    const lang = body.lang === 'ro' ? 'ro' : 'hu';

    // Ensure user record exists in Vercel Postgres `users` table
    const existingUser = await getUserById(authUser.userId);
    const dbUser =
      existingUser ||
      (await upsertUserSubscription({
        id: authUser.userId,
        email: authUser.email,
        subscription_status: 'free',
      }));

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    const priceId =
      plan === 'yearly'
        ? process.env.STRIPE_PRICE_ID_YEARLY || process.env.STRIPE_PRICE_ID_MONTHLY
        : process.env.STRIPE_PRICE_ID_MONTHLY;

    const origin =
      process.env.APP_URL ||
      (req.headers?.origin ? String(req.headers.origin) : 'http://localhost:5173');

    if (!stripeSecret || stripeSecret.startsWith('sk_test_...')) {
      // Local dev preview when Stripe API keys are not yet filled in .env
      if (process.env.VERCEL_ENV !== 'production') {
        const endDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
        await upsertUserSubscription({
          id: authUser.userId,
          email: authUser.email,
          subscription_status: 'active',
          stripe_customer_id: dbUser.stripe_customer_id || `cus_dev_${authUser.userId}`,
          subscription_end_date: endDate,
        });
        const redirectHash =
          returnSlug && returnSlug !== 'elofizetes'
            ? `#/r/${encodeURIComponent(returnSlug)}?checkout=success`
            : '#/profil?checkout=success';
        return res.status(200).json({
          url: `${origin}/${redirectHash}`,
          mode: 'dev_simulated_checkout',
        });
      }
      return res.status(500).json({
        error: 'A STRIPE_SECRET_KEY környezeti változó nincs beállítva a szerveren.',
      });
    }

    const stripe = new Stripe(stripeSecret);

    const successHash =
      returnSlug && returnSlug !== 'elofizetes'
        ? `#/r/${encodeURIComponent(returnSlug)}?checkout=success&session_id={CHECKOUT_SESSION_ID}`
        : '#/profil?checkout=success&session_id={CHECKOUT_SESSION_ID}';
    const cancelHash =
      returnSlug && returnSlug !== 'elofizetes'
        ? `#/r/${encodeURIComponent(returnSlug)}?checkout=canceled`
        : '#/elofizetes?checkout=canceled';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      client_reference_id: authUser.userId,
      metadata: {
        clerkUserId: authUser.userId,
      },
      subscription_data: {
        metadata: {
          clerkUserId: authUser.userId,
        },
      },
      ...(dbUser.stripe_customer_id
        ? { customer: dbUser.stripe_customer_id }
        : { customer_email: authUser.email }),
      line_items: priceId && !priceId.startsWith('price_...')
        ? [{ price: priceId, quantity: 1 }]
        : [
            {
              price_data: {
                currency: lang === 'ro' ? 'ron' : 'huf',
                unit_amount:
                  lang === 'ro'
                    ? plan === 'yearly'
                      ? 23999
                      : 2999
                    : plan === 'yearly'
                      ? 1990000
                      : 249000,
                recurring: { interval: plan === 'yearly' ? 'year' : 'month' },
                product_data: {
                  name: lang === 'ro' ? 'Abonament Vebeat Premium' : 'Vebeat Prémium Előfizetés',
                  description:
                    lang === 'ro'
                      ? 'Acces nelimitat la toate rețetele premium Vebeat, cantități exacte și Modul Interactiv de Gătit (TVA inclus).'
                      : 'Korlátlan hozzáférés minden prémium Vebeat recepthez, pontos grammos hozzávalókhoz és az interaktív Főzési Módhoz (ÁFA-val).',
                },
              },
              quantity: 1,
            },
          ],
      success_url: `${origin}/${successHash}`,
      cancel_url: `${origin}/${cancelHash}`,
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error('[POST /api/stripe/checkout] Error:', err);
    return res.status(500).json({
      error: err?.message || 'Nem sikerült létrehozni a Stripe fizetési munkamenetet.',
    });
  }
}
