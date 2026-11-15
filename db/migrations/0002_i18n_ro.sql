-- ============================================================================
-- Étlap Atelier – Romanian Localization Migration
-- Adds paywall-protected + public Romanian translation payload column
-- ============================================================================

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS translations_ro JSONB;
