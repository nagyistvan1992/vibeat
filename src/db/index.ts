import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema.js';
import type { SubscriptionStatus, IngredientItem, StepItem, TipObject } from './schema.js';
// @ts-ignore — server-only seed module
import { SEED_RECIPES, SEASONAL } from '../../db/seed-data.mjs';

export { SEASONAL };

export type LocaleLang = 'hu' | 'ro';

export function getSeasonal(lang: LocaleLang = 'hu') {
  return (SEASONAL as any[]).map(s =>
    lang === 'ro' && s.ro ? { ...s, ...s.ro } : s
  );
}

export interface PublicRecipeDTO {
  id: string; // matches slug for URL routing compatibility (#/r/:slug)
  numericId: number;
  slug: string;
  title: string;
  short: string;
  subtitle: string;
  category: string;
  canonical_category?: string;
  image_url: string;
  image: string;
  short_description: string;
  description: string;
  author: string;
  rating: number;
  reviews: number;
  prep: number;
  cook: number;
  prep_time: number;
  kcal: number;
  difficulty: string;
  servings: number;
  featured: boolean;
  is_free: boolean;
  tags: string[];
  canonical_tags?: string[];
  nutrition: [string, string][];
}

export interface FullOrLockedRecipeDTO extends PublicRecipeDTO {
  locked: boolean;
  teaser: string;
  ingredient_count: number;
  step_count: number;
  ingredients?: IngredientItem[];
  instructions?: string;
  steps?: StepItem[];
  chef_tips?: string | null;
  tip?: TipObject | null;
  wine?: { name: string; temp: string; text: string } | null;
  comments?: { name: string; stars: number; text: string }[];
}

export interface UserSubscriptionRecord {
  id: string;
  email: string;
  subscription_status: SubscriptionStatus;
  stripe_customer_id: string | null;
  subscription_end_date: string | null;
  created_at: string;
}

const getConnectionString = (): string | undefined => {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url || url.includes('user:password@ep-xyz')) return undefined;
  return url;
};

export function getDb() {
  const conn = getConnectionString();
  if (!conn) return null;
  const sql = neon(conn);
  return { db: drizzle(sql, { schema }), sql };
}

// Local dev user store fallback when POSTGRES_URL is not yet connected
const LOCAL_USERS_PATH = path.resolve(process.cwd(), 'db', '.local-users.json');

function readLocalUsers(): Record<string, UserSubscriptionRecord> {
  try {
    if (fs.existsSync(LOCAL_USERS_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_USERS_PATH, 'utf8'));
    }
  } catch {
    // ignore
  }
  return {};
}

function writeLocalUsers(data: Record<string, UserSubscriptionRecord>): void {
  try {
    fs.mkdirSync(path.dirname(LOCAL_USERS_PATH), { recursive: true });
    fs.writeFileSync(LOCAL_USERS_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // ignore on read-only serverless fs when DB is not configured
  }
}

function toPublicDTO(r: any, lang: LocaleLang = 'hu'): PublicRecipeDTO {
  const ro = lang === 'ro' ? r.translationsRo || r.ro || null : null;
  const slug = r.slug || String(r.id);
  const imageUrl = r.imageUrl || r.image_url || r.image || '';
  const baseShortDesc = r.shortDescription || r.short_description || r.description || '';
  const shortDesc = ro?.short_description || ro?.description || baseShortDesc;
  const prep = Number(r.prepMinutes ?? r.prep ?? r.prep_time ?? 10);
  const cook = Number(r.cookMinutes ?? r.cook ?? 0);
  const baseCategory = r.category || (Array.isArray(r.tags) && r.tags[0]) || 'Általános';
  const baseTags = Array.isArray(r.tags) ? r.tags : [];
  const baseTitle = r.title;
  const baseShort = r.shortTitle || r.short_title || r.short || r.title;
  return {
    id: slug,
    numericId: Number(r.id) || 0,
    slug,
    title: ro?.title || baseTitle,
    short: ro?.short || ro?.title || baseShort,
    subtitle: ro?.subtitle ?? (r.subtitle || ''),
    category: ro?.category || baseCategory,
    canonical_category: baseCategory,
    image_url: imageUrl,
    image: imageUrl,
    short_description: shortDesc,
    description: shortDesc,
    author: r.author || 'Bogdan Tîrziu • BT Fit',
    rating: Number(r.rating) || 4.9,
    reviews: Number(r.reviews) || 80,
    prep,
    cook,
    prep_time: Number(r.prepTime ?? r.prep_time ?? prep + cook),
    kcal: Number(r.kcal) || 0,
    difficulty: ro?.difficulty || r.difficulty || (lang === 'ro' ? 'Ușor' : 'Könnyű'),
    servings: Number(r.servings) || 2,
    featured: Boolean(r.featured),
    is_free: Boolean(r.isFree ?? r.is_free),
    tags: Array.isArray(ro?.tags) ? ro.tags : baseTags,
    canonical_tags: baseTags,
    nutrition: Array.isArray(ro?.nutrition) ? ro.nutrition : Array.isArray(r.nutrition) ? r.nutrition : [],
  };
}

/**
 * Returns ONLY public metadata for all recipes (never ingredients, instructions, or chef_tips).
 */
export async function getPublicRecipes(lang: LocaleLang = 'hu'): Promise<PublicRecipeDTO[]> {
  const conn = getDb();
  if (conn) {
    try {
      const rows = await conn.db
        .select({
          id: schema.recipes.id,
          slug: schema.recipes.slug,
          title: schema.recipes.title,
          shortTitle: schema.recipes.shortTitle,
          subtitle: schema.recipes.subtitle,
          category: schema.recipes.category,
          imageUrl: schema.recipes.imageUrl,
          shortDescription: schema.recipes.shortDescription,
          prepTime: schema.recipes.prepTime,
          prepMinutes: schema.recipes.prepMinutes,
          cookMinutes: schema.recipes.cookMinutes,
          kcal: schema.recipes.kcal,
          difficulty: schema.recipes.difficulty,
          servings: schema.recipes.servings,
          featured: schema.recipes.featured,
          isFree: schema.recipes.isFree,
          tags: schema.recipes.tags,
          nutrition: schema.recipes.nutrition,
          author: schema.recipes.author,
          rating: schema.recipes.rating,
          reviews: schema.recipes.reviews,
          translationsRo: schema.recipes.translationsRo,
        })
        .from(schema.recipes);
      if (rows.length > 0) {
        return rows.map(row => toPublicDTO(row, lang));
      }
    } catch (err) {
      console.error('[Vercel Postgres] Fallback to seed metadata:', err);
    }
  }
  return (SEED_RECIPES as any[]).map(row => toPublicDTO(row, lang));
}

/**
 * Fetches full recipe on the server and enforces paywall stripping when locked === true.
 */
export async function getRecipeForUser(
  slug: string,
  hasActiveSubscription: boolean,
  lang: LocaleLang = 'hu'
): Promise<FullOrLockedRecipeDTO | null> {
  let raw: any = null;
  const conn = getDb();
  if (conn) {
    try {
      const rows = await conn.db
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.slug, slug))
        .limit(1);
      if (rows[0]) raw = rows[0];
    } catch (err) {
      console.error('[Vercel Postgres] getRecipeForUser fallback:', err);
    }
  }
  if (!raw) {
    raw = (SEED_RECIPES as any[]).find(r => r.slug === slug || String(r.id) === slug) || null;
  }
  if (!raw) return null;

  const ro = lang === 'ro' ? raw.translationsRo || raw.ro || null : null;
  const pub = toPublicDTO(raw, lang);
  const ingredients: IngredientItem[] =
    (ro?.ingredients && ro.ingredients.length ? ro.ingredients : null) || raw.ingredients || [];
  const steps: StepItem[] =
    (ro?.steps && ro.steps.length ? ro.steps : null) || raw.stepsJson || raw.steps_json || raw.steps || [];
  const instructions: string =
    ro?.instructions ||
    raw.instructions ||
    steps.map((s, i) => `${i + 1}. ${s.title ? s.title + ': ' : ''}${s.text}`).join('\n\n');
  const tip: TipObject | null = ro?.tip ?? raw.tipJson ?? raw.tip_json ?? raw.tip ?? null;
  const chefTips: string | null =
    ro?.chef_tips ??
    raw.chefTips ??
    raw.chef_tips ??
    (tip ? `${[tip.lead, tip.bold].filter(Boolean).join(' ')}${tip.rest || ''}` : null);

  const unlocked = pub.is_free || hasActiveSubscription;
  const firstStepPreview = steps[0]?.title
    ? `${steps[0].title} – ${(steps[0].text || '').slice(0, 75)}…`
    : `${pub.short_description.slice(0, 110)}…`;

  if (!unlocked) {
    // STRICT PAYWALL: Do NOT return ingredients, instructions, steps, or chef_tips!
    return {
      ...pub,
      locked: true,
      teaser: firstStepPreview,
      ingredient_count: ingredients.length,
      step_count: steps.length,
    };
  }

  return {
    ...pub,
    locked: false,
    teaser: firstStepPreview,
    ingredient_count: ingredients.length,
    step_count: steps.length,
    ingredients,
    instructions,
    steps,
    chef_tips: chefTips,
    tip,
    wine: ro?.wine !== undefined ? ro.wine : raw.wine || null,
    comments: raw.comments || [],
  };
}

const isFallbackEmail = (email?: string | null, id?: string): boolean => {
  if (!email) return true;
  if (email.endsWith('@clerk.user')) return true;
  if (id && (email === `${id}@atelierculinary.hu` || email === `${id}@vebeat.ro`)) return true;
  return false;
};

export async function getUserById(userId: string): Promise<UserSubscriptionRecord | null> {
  if (!userId) return null;
  const conn = getDb();
  if (conn) {
    try {
      const rows = await conn.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (rows[0]) {
        return {
          id: rows[0].id,
          email: rows[0].email,
          subscription_status: rows[0].subscriptionStatus as SubscriptionStatus,
          stripe_customer_id: rows[0].stripeCustomerId ?? null,
          subscription_end_date: rows[0].subscriptionEndDate
            ? rows[0].subscriptionEndDate.toISOString()
            : null,
          created_at: rows[0].createdAt.toISOString(),
        };
      }
      return null;
    } catch (err) {
      console.error('[Vercel Postgres] getUserById error:', err);
      throw err;
    }
  }
  const local = readLocalUsers();
  return local[userId] || null;
}

export async function upsertUserSubscription(params: {
  id: string;
  email?: string;
  subscription_status?: SubscriptionStatus;
  stripe_customer_id?: string | null;
  subscription_end_date?: Date | null;
}): Promise<UserSubscriptionRecord> {
  const conn = getDb();
  const status: SubscriptionStatus = params.subscription_status || 'free';
  if (conn) {
    try {
      const existing = await getUserById(params.id);
      if (!existing) {
        const insertEmail = params.email || `${params.id}@clerk.user`;
        const byEmail = await conn.db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, insertEmail))
          .limit(1);

        if (byEmail[0] && !byEmail[0].stripeCustomerId && byEmail[0].subscriptionStatus === 'free') {
          await conn.db
            .update(schema.users)
            .set({
              id: params.id,
              subscriptionStatus: status,
              stripeCustomerId: params.stripe_customer_id ?? null,
              subscriptionEndDate: params.subscription_end_date ?? null,
            })
            .where(eq(schema.users.email, insertEmail));
        } else {
          await conn.db.insert(schema.users).values({
            id: params.id,
            email: insertEmail,
            subscriptionStatus: status,
            stripeCustomerId: params.stripe_customer_id ?? null,
            subscriptionEndDate: params.subscription_end_date ?? null,
          });
        }
      } else {
        const nextEmail =
          params.email &&
          (!isFallbackEmail(params.email, params.id) || isFallbackEmail(existing.email, params.id))
            ? params.email
            : existing.email;

        await conn.db
          .update(schema.users)
          .set({
            email: nextEmail,
            subscriptionStatus: params.subscription_status ?? existing.subscription_status,
            stripeCustomerId:
              params.stripe_customer_id !== undefined
                ? params.stripe_customer_id
                : existing.stripe_customer_id,
            subscriptionEndDate:
              params.subscription_end_date !== undefined
                ? params.subscription_end_date
                : existing.subscription_end_date
                  ? new Date(existing.subscription_end_date)
                  : null,
          })
          .where(eq(schema.users.id, params.id));
      }
      const updated = await getUserById(params.id);
      if (updated) return updated;
      throw new Error(`User ${params.id} could not be read back after upsert`);
    } catch (err) {
      console.error('[Vercel Postgres] upsertUserSubscription error:', err);
      throw err;
    }
  }

  const local = readLocalUsers();
  const prev = local[params.id];
  const nextLocalEmail =
    params.email &&
    (!prev || !isFallbackEmail(params.email, params.id) || isFallbackEmail(prev.email, params.id))
      ? params.email
      : prev?.email || `${params.id}@vebeat.ro`;

  const record: UserSubscriptionRecord = {
    id: params.id,
    email: nextLocalEmail,
    subscription_status: params.subscription_status ?? prev?.subscription_status ?? 'free',
    stripe_customer_id:
      params.stripe_customer_id !== undefined
        ? params.stripe_customer_id
        : (prev?.stripe_customer_id ?? null),
    subscription_end_date:
      params.subscription_end_date !== undefined
        ? (params.subscription_end_date ? params.subscription_end_date.toISOString() : null)
        : (prev?.subscription_end_date ?? null),
    created_at: prev?.created_at || new Date().toISOString(),
  };
  local[params.id] = record;
  writeLocalUsers(local);
  return record;
}

export async function updateSubscriptionByStripeCustomer(params: {
  stripe_customer_id: string;
  subscription_status: SubscriptionStatus;
  subscription_end_date?: Date | null;
}): Promise<boolean> {
  const conn = getDb();
  if (conn) {
    try {
      const updatedRows = await conn.db
        .update(schema.users)
        .set({
          subscriptionStatus: params.subscription_status,
          ...(params.subscription_end_date !== undefined
            ? { subscriptionEndDate: params.subscription_end_date }
            : {}),
        })
        .where(eq(schema.users.stripeCustomerId, params.stripe_customer_id))
        .returning({ id: schema.users.id });
      return updatedRows.length > 0;
    } catch (err) {
      console.error('[Vercel Postgres] updateSubscriptionByStripeCustomer error:', err);
      throw err;
    }
  }
  const local = readLocalUsers();
  const entry = Object.values(local).find(
    u => u.stripe_customer_id === params.stripe_customer_id
  );
  if (!entry) return false;
  entry.subscription_status = params.subscription_status;
  if (params.subscription_end_date !== undefined) {
    entry.subscription_end_date = params.subscription_end_date
      ? params.subscription_end_date.toISOString()
      : null;
  }
  writeLocalUsers(local);
  return true;
}
