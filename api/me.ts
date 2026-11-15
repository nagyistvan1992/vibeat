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
