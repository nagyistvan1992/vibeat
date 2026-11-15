-- ============================================================================
-- Étlap Atelier – Vercel Postgres (Neon) Database Schema & Migration
-- ============================================================================

-- 1. Subscription status enum
DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('free', 'active', 'past_due', 'canceled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. USERS TABLE (Clerk user_id as primary key + Stripe subscription state)
CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE,
  subscription_status   subscription_status NOT NULL DEFAULT 'free',
  stripe_customer_id    TEXT UNIQUE,
  subscription_end_date TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users (subscription_status);

-- 3. RECIPES TABLE (Public metadata + Paywall-protected columns)
CREATE TABLE IF NOT EXISTS recipes (
  id                SERIAL PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  category          TEXT NOT NULL,
  image_url         TEXT NOT NULL,
  short_description TEXT NOT NULL,
  prep_time         INTEGER NOT NULL DEFAULT 10,
  is_free           BOOLEAN NOT NULL DEFAULT FALSE,

  -- Extended public metadata for Étlap Atelier cards & nutrition preview
  short_title       TEXT,
  subtitle          TEXT,
  author            TEXT DEFAULT 'Bogdan Tîrziu • BT Fit',
  rating            NUMERIC(2,1) DEFAULT 4.9,
  reviews           INTEGER DEFAULT 80,
  prep_minutes      INTEGER NOT NULL DEFAULT 10,
  cook_minutes      INTEGER NOT NULL DEFAULT 0,
  kcal              INTEGER NOT NULL DEFAULT 0,
  difficulty        TEXT NOT NULL DEFAULT 'Könnyű',
  servings          INTEGER NOT NULL DEFAULT 2,
  featured          BOOLEAN NOT NULL DEFAULT FALSE,
  tags              JSONB NOT NULL DEFAULT '[]'::jsonb,
  nutrition         JSONB NOT NULL DEFAULT '[]'::jsonb,
  wine              JSONB,
  comments          JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- PAYWALL-PROTECTED COLUMNS (Never returned by /api/recipes or locked /api/recipes/[slug])
  ingredients       JSONB NOT NULL DEFAULT '[]'::jsonb,
  instructions      TEXT NOT NULL,
  steps_json        JSONB NOT NULL DEFAULT '[]'::jsonb,
  chef_tips         TEXT,
  tip_json          JSONB,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipes_slug ON recipes (slug);
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes (category);
CREATE INDEX IF NOT EXISTS idx_recipes_is_free ON recipes (is_free);
