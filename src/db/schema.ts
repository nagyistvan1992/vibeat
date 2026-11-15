import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'free',
  'active',
  'past_due',
  'canceled',
]);

export type SubscriptionStatus = 'free' | 'active' | 'past_due' | 'canceled';

export interface IngredientItem {
  name: string;
  qty: number | null;
  unit: string;
}

export interface StepItem {
  title: string;
  tag?: string;
  text: string;
  timer?: number;
  image?: string;
  expected?: string;
}

export interface TipObject {
  lead: string;
  bold: string;
  rest: string;
}

export interface RecipeTranslationRO {
  title: string;
  short?: string;
  subtitle?: string;
  category?: string;
  short_description?: string;
  description?: string;
  difficulty?: string;
  tags?: string[];
  nutrition?: [string, string][];
  wine?: { name: string; temp: string; text: string } | null;
  ingredients?: IngredientItem[];
  instructions?: string;
  steps?: StepItem[];
  chef_tips?: string | null;
  tip?: TipObject | null;
}

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(), // Clerk user_id
    email: text('email').notNull().unique(),
    subscriptionStatus: subscriptionStatusEnum('subscription_status')
      .notNull()
      .default('free'),
    stripeCustomerId: text('stripe_customer_id').unique(),
    subscriptionEndDate: timestamp('subscription_end_date', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    stripeCustomerIdx: index('idx_users_stripe_customer_id').on(table.stripeCustomerId),
    statusIdx: index('idx_users_subscription_status').on(table.subscriptionStatus),
  })
);

export const recipes = pgTable(
  'recipes',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    category: text('category').notNull(),
    imageUrl: text('image_url').notNull(),
    shortDescription: text('short_description').notNull(),
    prepTime: integer('prep_time').notNull().default(10),
    isFree: boolean('is_free').notNull().default(false),

    // Extended public metadata
    shortTitle: text('short_title'),
    subtitle: text('subtitle'),
    author: text('author').default('Bogdan Tîrziu • BT Fit'),
    rating: numeric('rating', { precision: 2, scale: 1 }).default('4.9'),
    reviews: integer('reviews').default(80),
    prepMinutes: integer('prep_minutes').notNull().default(10),
    cookMinutes: integer('cook_minutes').notNull().default(0),
    kcal: integer('kcal').notNull().default(0),
    difficulty: text('difficulty').notNull().default('Könnyű'),
    servings: integer('servings').notNull().default(2),
    featured: boolean('featured').notNull().default(false),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    nutrition: jsonb('nutrition').$type<[string, string][]>().notNull().default([]),
    wine: jsonb('wine').$type<{ name: string; temp: string; text: string } | null>(),
    comments: jsonb('comments')
      .$type<{ name: string; stars: number; text: string }[]>()
      .notNull()
      .default([]),

    // Paywall-protected columns
    ingredients: jsonb('ingredients').$type<IngredientItem[]>().notNull().default([]),
    instructions: text('instructions').notNull(),
    stepsJson: jsonb('steps_json').$type<StepItem[]>().notNull().default([]),
    chefTips: text('chef_tips'),
    tipJson: jsonb('tip_json').$type<TipObject | null>(),
    translationsRo: jsonb('translations_ro').$type<RecipeTranslationRO | null>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    slugIdx: index('idx_recipes_slug').on(table.slug),
    categoryIdx: index('idx_recipes_category').on(table.category),
    isFreeIdx: index('idx_recipes_is_free').on(table.isFree),
  })
);
