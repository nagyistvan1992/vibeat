import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../src/db/schema.js';
// @ts-ignore
import { SEED_RECIPES } from '../db/seed-data.mjs';

async function main() {
  const connStr = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connStr) {
    console.error(
      '❌ Missing POSTGRES_URL or DATABASE_URL environment variable. Set it in .env.local before running `npm run db:seed`.'
    );
    process.exit(1);
  }

  const sql = neon(connStr);
  const db = drizzle(sql, { schema });

  console.log('1️⃣ Running SQL migrations...');
  for (const migFile of ['0001_init.sql', '0002_i18n_ro.sql']) {
    const migrationPath = path.resolve(process.cwd(), 'db', 'migrations', migFile);
    if (!fs.existsSync(migrationPath)) continue;
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const statements = migrationSql
      .split(/;\s*\r?\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    for (const stmt of statements) {
      await sql(`${stmt};`);
    }
  }

  console.log(`2️⃣ Seeding ${SEED_RECIPES.length} recipes into Vercel Postgres...`);
  let inserted = 0;

  for (const r of SEED_RECIPES as any[]) {
    await db
      .insert(schema.recipes)
      .values({
        slug: r.slug,
        title: r.title,
        category: r.category,
        imageUrl: r.image_url,
        shortDescription: r.short_description,
        prepTime: r.prep_time,
        isFree: Boolean(r.is_free),
        shortTitle: r.short,
        subtitle: r.subtitle,
        author: r.author,
        rating: String(r.rating || 4.9),
        reviews: Number(r.reviews || 80),
        prepMinutes: Number(r.prep || 10),
        cookMinutes: Number(r.cook || 0),
        kcal: Number(r.kcal || 0),
        difficulty: r.difficulty || 'Könnyű',
        servings: Number(r.servings || 2),
        featured: Boolean(r.featured),
        tags: r.tags || [],
        nutrition: r.nutrition || [],
        wine: r.wine || null,
        comments: r.comments || [],
        ingredients: r.ingredients || [],
        instructions: r.instructions || '',
        stepsJson: r.steps || [],
        chefTips: r.chef_tips || null,
        tipJson: r.tip || null,
        translationsRo: r.ro || null,
      })
      .onConflictDoUpdate({
        target: schema.recipes.slug,
        set: {
          title: r.title,
          category: r.category,
          imageUrl: r.image_url,
          shortDescription: r.short_description,
          prepTime: r.prep_time,
          isFree: Boolean(r.is_free),
          ingredients: r.ingredients || [],
          instructions: r.instructions || '',
          stepsJson: r.steps || [],
          chefTips: r.chef_tips || null,
          tipJson: r.tip || null,
          translationsRo: r.ro || null,
        },
      });
    inserted++;
  }

  console.log(
    `✅ Successfully seeded ${inserted} recipes into Vercel Postgres! (${
      (SEED_RECIPES as any[]).filter(x => x.is_free).length
    } Free, ${(SEED_RECIPES as any[]).filter(x => !x.is_free).length} Premium)`
  );
}

main().catch(err => {
  console.error('❌ Seed error:', err);
  process.exit(1);
});
