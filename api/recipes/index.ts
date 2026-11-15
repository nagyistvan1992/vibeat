import { getPublicRecipes, getSeasonal } from '../../src/db/index.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const lang = req.query?.lang === 'ro' ? 'ro' : 'hu';

  try {
    const recipes = await getPublicRecipes(lang);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      lang,
      count: recipes.length,
      free_count: recipes.filter(r => r.is_free).length,
      premium_count: recipes.filter(r => !r.is_free).length,
      recipes,
      seasonal: getSeasonal(lang),
    });
  } catch (err: any) {
    console.error('[GET /api/recipes] Error:', err);
    return res.status(500).json({
      error:
        lang === 'ro'
          ? 'A apărut o eroare la încărcarea rețetelor.'
          : 'Hiba történt a receptek betöltésekor.',
    });
  }
}
