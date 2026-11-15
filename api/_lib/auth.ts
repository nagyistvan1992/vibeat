import { verifyToken, createClerkClient } from '@clerk/backend';

export interface VerifiedAuthUser {
  userId: string;
  email: string;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map(part => {
      const idx = part.indexOf('=');
      if (idx === -1) return [part.trim(), ''];
      return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())];
    })
  );
}

export async function verifyClerkRequest(req: any): Promise<VerifiedAuthUser | null> {
  const authHeader: string = req.headers?.authorization || req.headers?.Authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const cookies = parseCookies(req.headers?.cookie);
  const sessionToken = bearerToken || cookies['__session'] || '';

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (secretKey && !secretKey.startsWith('sk_test_...')) {
    if (!sessionToken) return null;
    try {
      const payload = await verifyToken(sessionToken, { secretKey });
      const userId = payload.sub;
      if (!userId) return null;

      let email = (payload as any).email || `${userId}@clerk.user`;
      try {
        const clerk = createClerkClient({ secretKey });
        const user = await clerk.users.getUser(userId);
        const primary = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId);
        if (primary?.emailAddress) {
          email = primary.emailAddress;
        } else if (user.emailAddresses[0]?.emailAddress) {
          email = user.emailAddresses[0].emailAddress;
        }
      } catch {
        // Use email from token claim or fallback
      }
      return { userId, email };
    } catch (err) {
      console.warn('[Clerk Auth] Token verification failed:', err);
      return null;
    }
  }

  // Local development preview fallback ONLY when CLERK_SECRET_KEY is not configured and not on production Vercel
  if (process.env.VERCEL_ENV !== 'production') {
    const devUserId = req.headers?.['x-dev-user-id'];
    const devEmail = req.headers?.['x-dev-user-email'];
    if (typeof devUserId === 'string' && devUserId.trim()) {
      return {
        userId: devUserId.trim(),
        email:
          typeof devEmail === 'string' && devEmail.trim()
            ? devEmail.trim()
            : `${devUserId.trim()}@atelierculinary.hu`,
      };
    }
  }

  return null;
}
