import { getRecipeForUser, getUserById, upsertUserSubscription } from '../../src/db/index.js';
import { verifyClerkRequest } from '../_lib/auth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const rawSlug = req.query?.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : String(rawSlug || '').trim();
  const lang = req.query?.lang === 'ro' ? 'ro' : 'hu';
  if (!slug) {
    return res.status(400).json({
      error: lang === 'ro' ? 'Lipsește identificatorul rețetei (slug).' : 'Hiányzó recept azonosító (slug).',
    });
  }

  try {
    // 1. Verify Clerk session token on the server and ensure user exists in Postgres
    const authUser = await verifyClerkRequest(req);
    let hasActiveSubscription = false;
    let userStatus: string = 'anonymous';

    if (authUser) {
      let dbUser = await getUserById(authUser.userId);
      if (!dbUser) {
        dbUser = await upsertUserSubscription({
          id: authUser.userId,
          email: authUser.email,
          subscription_status: 'free',
        });
      }
      userStatus = dbUser?.subscription_status || 'free';
      if (dbUser && dbUser.subscription_status === 'active') {
        hasActiveSubscription = true;
      }
    }

    // 2. Fetch recipe and enforce server-side paywall stripping
    const recipe = await getRecipeForUser(slug, hasActiveSubscription, lang);
    if (!recipe) {
      return res.status(404).json({
        error: lang === 'ro' ? 'Rețeta căutată nu a fost găsită.' : 'A keresett recept nem található.',
      });
    }

    // Never cache authenticated/paywalled responses across users
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(200).json({
      lang,
      recipe,
      viewer: {
        authenticated: Boolean(authUser),
        subscription_status: userStatus,
      },
    });
  } catch (err: any) {
    console.error(`[GET /api/recipes/${slug}] Error:`, err);
    return res.status(500).json({
      error:
        lang === 'ro'
          ? 'A apărut o eroare la încărcarea rețetei.'
          : 'Hiba történt a recept lekérésekor.',
    });
  }
}
