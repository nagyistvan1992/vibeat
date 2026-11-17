const GEO_TTL_MS = 10 * 60 * 1000;
const geoCache = new Map<string, { country: string | null; exp: number }>();

function extractClientIp(req: any): string | null {
  const xff = req.headers?.['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : typeof xff === 'string' ? xff.split(',')[0] : '';
  const cand =
    raw.trim() ||
    String(req.headers?.['x-real-ip'] || '').trim() ||
    String(req.socket?.remoteAddress || req.connection?.remoteAddress || '').trim();
  if (!cand) return null;
  return cand.replace(/^::ffff:/, '');
}

function isPrivateOrLocalIp(ip: string | null): boolean {
  if (!ip) return true;
  const v = ip.toLowerCase();
  if (v === '127.0.0.1' || v === '::1' || v === 'localhost') return true;
  if (v.startsWith('10.') || v.startsWith('192.168.') || v.startsWith('fc') || v.startsWith('fd')) {
    return true;
  }
  const m = /^172\.(\d+)\./.exec(v);
  if (m) {
    const oct = Number(m[1]);
    if (oct >= 16 && oct <= 31) return true;
  }
  return false;
}

function langFromAcceptHeader(headerVal: unknown): 'hu' | 'ro' | null {
  const al = String(headerVal || '').toLowerCase();
  if (!al) return null;
  const roIdx = al.search(/\bro\b/);
  const huIdx = al.search(/\bhu\b/);
  if (roIdx !== -1 && (huIdx === -1 || roIdx < huIdx)) return 'ro';
  if (huIdx !== -1) return 'hu';
  return null;
}

function countryToLang(country: string | null, acceptLangHeader: unknown): 'hu' | 'ro' {
  const cc = String(country || '').toUpperCase();
  if (cc === 'RO' || cc === 'MD') return 'ro';
  if (cc === 'HU') return 'hu';
  return langFromAcceptHeader(acceptLangHeader) || 'hu';
}

async function lookupCountryByIp(clientIp: string | null): Promise<string | null> {
  const isLocal = isPrivateOrLocalIp(clientIp);
  const cacheKey = isLocal ? '__self__' : String(clientIp);
  const cached = geoCache.get(cacheKey);
  if (cached && cached.exp > Date.now()) {
    return cached.country;
  }

  let country: string | null = null;
  const ipSegment = isLocal ? '' : encodeURIComponent(String(clientIp));

  try {
    const res = await fetch(`https://ipwho.is/${ipSegment}?fields=success,country_code`, {
      signal: AbortSignal.timeout(1200),
    });
    if (res.ok) {
      const data: any = await res.json();
      if (data && data.success !== false && typeof data.country_code === 'string') {
        country = data.country_code.toUpperCase();
      }
    }
  } catch {
    // Try secondary geo provider below
  }

  if (!country) {
    try {
      const res = await fetch(`https://api.country.is/${ipSegment}`, {
        signal: AbortSignal.timeout(1200),
      });
      if (res.ok) {
        const data: any = await res.json();
        if (data && typeof data.country === 'string') {
          country = data.country.toUpperCase();
        }
      }
    } catch {
      // Fall back cleanly to Accept-Language / default
    }
  }

  geoCache.set(cacheKey, { country, exp: Date.now() + GEO_TTL_MS });
  return country;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  const vercelCountry = String(req.headers?.['x-vercel-ip-country'] || '').trim().toUpperCase();
  const cfCountry = String(req.headers?.['cf-ipcountry'] || '').trim().toUpperCase();
  const headerCountry =
    vercelCountry && vercelCountry !== 'XX'
      ? vercelCountry
      : cfCountry && cfCountry !== 'XX'
        ? cfCountry
        : null;

  const acceptLang = req.headers?.['accept-language'];

  if (headerCountry) {
    return res.status(200).json({
      country: headerCountry,
      lang: countryToLang(headerCountry, acceptLang),
      source: vercelCountry ? 'vercel-ip-country' : 'cf-ipcountry',
    });
  }

  const clientIp = extractClientIp(req);
  const ipCountry = await lookupCountryByIp(clientIp);
  return res.status(200).json({
    country: ipCountry,
    lang: countryToLang(ipCountry, acceptLang),
    source: ipCountry ? 'geoip' : 'accept-language-fallback',
  });
}
