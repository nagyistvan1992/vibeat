import { count, eq } from 'drizzle-orm';
import { getDb } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const clerkPub =
    process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
  const clerkSecret = process.env.CLERK_SECRET_KEY || '';
  const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
  const stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET || '';

  const clerk = {
    publishableKeyConfigured:
      Boolean(clerkPub) && clerkPub.startsWith('pk_') && !clerkPub.startsWith('pk_test_...'),
    secretKeyConfigured:
      Boolean(clerkSecret) && !clerkSecret.startsWith('sk_test_...'),
  };

  const stripe = {
    secretKeyConfigured:
      Boolean(stripeSecret) && !stripeSecret.startsWith('sk_test_...'),
    webhookSecretConfigured:
      Boolean(stripeWebhook) && !stripeWebhook.startsWith('whsec_...'),
  };

  const conn = getDb();
  const neon = {
    connectionConfigured: Boolean(conn),
    connected: false,
    schemaReady: false,
    recipeCount: 0,
    freeRecipeCount: 0,
    premiumRecipeCount: 0,
    userCount: 0,
    error: null as string | null,
  };

  if (conn) {
    try {
      await conn.sql`SELECT 1`;
      neon.connected = true;

      const [totalRow] = await conn.db.select({ value: count() }).from(schema.recipes);
      const [freeRow] = await conn.db
        .select({ value: count() })
        .from(schema.recipes)
        .where(eq(schema.recipes.isFree, true));
      const [usersRow] = await conn.db.select({ value: count() }).from(schema.users);

      neon.schemaReady = true;
      neon.recipeCount = Number(totalRow?.value || 0);
      neon.freeRecipeCount = Number(freeRow?.value || 0);
      neon.premiumRecipeCount = neon.recipeCount - neon.freeRecipeCount;
      neon.userCount = Number(usersRow?.value || 0);
    } catch (err: any) {
      neon.error = err?.message || 'Database connection or schema error';
    }
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json({
    ok: neon.connected ? neon.schemaReady : true,
    mode:
      clerk.secretKeyConfigured && clerk.publishableKeyConfigured && neon.connected && neon.schemaReady
        ? 'production_ready'
        : 'local_fallback_or_partial',
    clerk,
    neon,
    stripe,
  });
}
