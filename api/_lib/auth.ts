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

/**
 * Resolves the exact origin the browser is currently using so Stripe redirects
 * return to the same host where Clerk session cookies and localStorage live.
 */
export function resolveAppOrigin(req: any): string {
  const configured = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  let configuredHost = '';
  if (configured) {
    try {
      configuredHost = new URL(configured).hostname.toLowerCase();
    } catch {
      // ignore malformed APP_URL
    }
  }

  const isTrustedOrigin = (candidate: string): string | null => {
    try {
      const u = new URL(candidate);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      const host = u.hostname.toLowerCase();
      const isLocal = host === 'localhost' || host === '127.0.0.1';
      const isVercel = host.endsWith('.vercel.app');
      const matchesConfigured =
        Boolean(configuredHost) &&
        (host === configuredHost ||
          host === `www.${configuredHost}` ||
          `www.${host}` === configuredHost);
      if (isLocal || isVercel || matchesConfigured) {
        return u.origin;
      }
    } catch {
      // ignore invalid URL
    }
    return null;
  };

  const rawOrigin = req.headers?.origin || req.headers?.Origin;
  if (typeof rawOrigin === 'string' && rawOrigin) {
    const valid = isTrustedOrigin(rawOrigin);
    if (valid) return valid;
  }

  const rawReferer = req.headers?.referer || req.headers?.Referer;
  if (typeof rawReferer === 'string' && rawReferer) {
    const valid = isTrustedOrigin(rawReferer);
    if (valid) return valid;
  }

  const fwdHost = req.headers?.['x-forwarded-host'] || req.headers?.host;
  if (typeof fwdHost === 'string' && fwdHost) {
    const hostPart = fwdHost.split(',')[0].trim();
    const protoHeader = req.headers?.['x-forwarded-proto'];
    const proto =
      typeof protoHeader === 'string' && protoHeader
        ? protoHeader.split(',')[0].trim()
        : hostPart.startsWith('localhost') || hostPart.startsWith('127.0.0.1')
          ? 'http'
          : 'https';
    const valid = isTrustedOrigin(`${proto}://${hostPart}`);
    if (valid) return valid;
  }

  return configured || 'http://localhost:5173';
}

export async function verifyClerkRequest(req: any): Promise<VerifiedAuthUser | null> {
  const authHeader: string = req.headers?.authorization || req.headers?.Authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const cookies = parseCookies(req.headers?.cookie);
  const cookieToken = cookies['__session'] || '';

  const candidateTokens = Array.from(new Set([bearerToken, cookieToken].filter(Boolean)));

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (secretKey && !secretKey.startsWith('sk_test_...')) {
    if (!candidateTokens.length) return null;

    let lastErr: unknown = null;
    for (const token of candidateTokens) {
      try {
        const payload = await verifyToken(token, {
          secretKey,
          clockSkewInMs: 15_000,
        });
        const userId = payload.sub;
        if (!userId) continue;

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
        lastErr = err;
      }
    }

    if (lastErr) {
      console.warn('[Clerk Auth] Token verification failed:', (lastErr as any)?.reason || lastErr);
    }
    return null;
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
