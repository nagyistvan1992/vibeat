import React, { useEffect, useRef, useState, useContext, createContext } from 'react';
import {
  PLANS,
  siteFooterHtml,
  cookieBannerHtml,
  viewLegalContent,
  type LegalSection,
} from './legal';
import {
  applySymmetricQtyStep,
  formatShoppingChecklist,
  formatShoppingQty,
  getSymmetricStep,
  mergeRecipeIngredientsIntoList,
  normalizeStoredShoppingList,
  shoppingStore,
  type ChecklistExportMode,
  type ShoppingItem,
} from './shoppingList';
import { ShoppingDrawerAndToast } from './components/ShoppingDrawer';

export interface ClerkBridgeValue {
  enabled: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  email: string | null;
  fullName: string | null;
  getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>;
  signOut: () => Promise<void>;
  renderSignIn: () => React.ReactNode;
  renderSignUp: () => React.ReactNode;
  renderUserButton: () => React.ReactNode;
}

export const ClerkBridgeContext = createContext<ClerkBridgeValue>({
  enabled: false,
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  email: null,
  fullName: null,
  getToken: async () => null,
  signOut: async () => {},
  renderSignIn: () => null,
  renderSignUp: () => null,
  renderUserButton: () => null,
});

const KEY = 'etlap-atelier-v1';
const DEF = {
  favs: [] as string[],
  checked: {} as Record<string, number[]>,
  servings: {} as Record<string, number>,
  cooked: [] as { id: string; at: number }[],
  mine: [] as any[],
  shopping: [] as ShoppingItem[],
  notes: {} as Record<string, string>,
  progress: {} as Record<string, { step: number; at: number }>,
  timers: {} as Record<string, { left: number; total: number; run: boolean; endAt: number }>,
  user: null as { id?: string; name: string; email: string; bio: string } | null,
  prefs: ['Mediterrán', 'Gyors ételek'] as string[],
  wake: true,
  unit: 'metric' as 'metric' | 'dkg',
  notif: true,
  lang: 'hu' as 'hu' | 'ro',
  langSelected: false as boolean,
  cookieConsent: null as 'all' | 'essential' | null,
};

function loadState() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.has('clear')) {
      localStorage.removeItem(KEY);
    }
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const urlLang = params.get('lang');
    const forceRedetect = params.has('clear');
    const hasUrlLang = !forceRedetect && (urlLang === 'ro' || urlLang === 'hu');
    const navHint: 'hu' | 'ro' =
      typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ro')
        ? 'ro'
        : 'hu';
    const lang: 'hu' | 'ro' = hasUrlLang
      ? (urlLang as 'hu' | 'ro')
      : forceRedetect
        ? navHint
        : raw.lang === 'ro'
          ? 'ro'
          : raw.lang === 'hu'
            ? 'hu'
            : navHint;
    const langSelected = !forceRedetect && (hasUrlLang || raw.langSelected === true);
    const cookieConsent: 'all' | 'essential' | null =
      raw.cookieConsent === 'all' || raw.cookieConsent === 'essential' ? raw.cookieConsent : null;
    return {
      ...DEF,
      favs: Array.isArray(raw.favs) ? raw.favs : [],
      checked: raw.checked && typeof raw.checked === 'object' ? raw.checked : {},
      servings: raw.servings && typeof raw.servings === 'object' ? raw.servings : {},
      cooked: Array.isArray(raw.cooked) ? raw.cooked : [],
      mine: Array.isArray(raw.mine) ? raw.mine : [],
      shopping: normalizeStoredShoppingList(
        Array.isArray(raw.shopping) ? raw.shopping : [],
        raw.unit === 'dkg' ? 'dkg' : 'metric'
      ),
      notes: raw.notes && typeof raw.notes === 'object' ? raw.notes : {},
      progress: raw.progress && typeof raw.progress === 'object' ? raw.progress : {},
      timers: raw.timers && typeof raw.timers === 'object' ? raw.timers : {},
      user: raw.user && typeof raw.user.name === 'string' ? raw.user : null,
      prefs: Array.isArray(raw.prefs) ? raw.prefs : DEF.prefs,
      wake: raw.wake !== false,
      unit: raw.unit === 'dkg' ? ('dkg' as const) : ('metric' as const),
      notif: raw.notif !== false,
      lang,
      langSelected,
      cookieConsent,
    };
  } catch {
    return { ...DEF };
  }
}

const esc = (v: any) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)
  );
const icon = (name: string, cls = '') =>
  `<span class="material-symbols-outlined ${cls}" aria-hidden="true">${name}</span>`;
const norm = (s: any) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
const fmtNum = (n: number) =>
  (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toString().replace('.', ',');
const PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#ebe8e3"/></svg>'
  );
const img = (url: any) =>
  /^(https?:\/\/|data:image\/|\/?assets\/)/.test(url || '') ? esc(url) : PLACEHOLDER;
const uid = (title: string) =>
  (norm(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'recept') +
  '-' +
  Date.now().toString(36);
const relDays = (at: number, lang: 'hu' | 'ro' = 'hu') => {
  const d = Math.floor((Date.now() - at) / 864e5);
  if (lang === 'ro') return d <= 0 ? 'Azi' : d === 1 ? 'Ieri' : `Acum ${d} zile`;
  return d <= 0 ? 'Ma' : d === 1 ? 'Tegnap' : `${d} napja`;
};

const TAG_RO: Record<string, string> = {
  Ingyenes: 'Gratuit',
  Prémium: 'Premium',
  '10 perces': '10 minute',
  '30 perces': '30 minute',
  'Főétel & Sültek': 'Feluri principale & Fripturi',
  'Protein Bowl & Tálak': 'Boluri proteice',
  Reggeli: 'Mic dejun',
  Saláta: 'Salate',
  'Wrap & Omlett': 'Wrap & Omlete',
  'Sós snack': 'Gustări sărate',
  'Sütemény & Torták': 'Prăjituri & Torturi',
  'Palacsinta & Muffin': 'Clătite & Brioșe',
  'Chia puding': 'Budincă de chia',
  'Zabpuding & Kása': 'Terci & Budincă de ovăz',
  'Fehérje shake': 'Shake proteic',
  Smoothie: 'Smoothie',
  'Édes snack': 'Gustări dulci',
  'Házi fagylalt': 'Înghețată de casă',
  'Főzés nélkül': 'Fără gătire',
  Desszert: 'Deserturi',
  'Leves & Csorba': 'Supe & Ciorbe',
  'Hal & Tenger gyümölcsei': 'Pește & Fructe de mare',
  'Köretek & Krémek': 'Garnituri & Creme tartinabile',
  'Pékáru & Piték': 'Pâine & Patiserie',
  'Szószok & Öntetek': 'Sosuri & Dressinguri',
  'Vegán / Böjti': 'Vegan / De post',
  Vegetáriánus: 'Vegetarian',
  Gluténmentes: 'Fără gluten',
  'Magas fehérje': 'Proteine ridicate',
  'Alacsony kalória': 'Calorii reduse',
  Mediterrán: 'Mediteranean',
  'Olasz klasszikus': 'Clasic italian',
  'Lassú főzés': 'Gătire lentă',
  Tradicionális: 'Tradițional',
  Előétel: 'Aperitiv',
  'Gyors & Egyszerű': 'Rapid & Simplu',
  'Saját receptjeim': 'Rețetele mele',
};

const CAT_SUB_RO: Record<string, string> = {
  'Főétel & Sültek': 'Carne suculentă, pește și paste',
  'Protein Bowl & Tálak': 'Boluri complete bogate în proteine',
  Reggeli: 'Idei rapide dulci și sărate',
  Saláta: 'Salate proaspete și boluri calde',
  'Wrap & Omlett': 'Rulouri, tortilla și omlete',
  'Sós snack': 'Aperitive, creme și gustări',
  'Sütemény & Torták': 'Cheesecake, brownies și tarte',
  'Palacsinta & Muffin': 'Clătite și brioșe cu ovăz',
  'Chia puding': 'Budinci cremoase bogate în fibre',
  'Zabpuding & Kása': 'Terci cremos și overnight oats',
  'Fehérje shake': 'Shake-uri sățioase cu proteine',
  Smoothie: 'Smoothie-uri răcoritoare cu fructe',
  'Édes snack': 'Deserturi rapide fără regrete',
  'Házi fagylalt': 'Înghețată cremoasă fără aparat',
  'Főzés nélkül': 'Gata în 10 min fără foc',
  Desszert: 'Deserturi fără zahăr adăugat',
  'Leves & Csorba': 'Supe creme și ciorbe tradiționale',
  'Hal & Tenger gyümölcsei': 'Rețete cu pește de Dunăre și mare',
  'Köretek & Krémek': 'Zacuscă, vinete, humus și garnituri',
  'Pékáru & Piték': 'Pâine de casă, plăcinte și turte',
  'Szószok & Öntetek': 'Sosuri de post, pesto și dressinguri',
};

const TAG_TO_CANONICAL: Record<string, string> = Object.fromEntries(
  Object.entries(TAG_RO).flatMap(([hu, ro]) => [
    [hu, hu],
    [ro, hu],
  ])
);

const trTag = (t: string, lang: 'hu' | 'ro') => {
  const canon = TAG_TO_CANONICAL[t] || t;
  return lang === 'ro' ? TAG_RO[canon] || t : canon;
};

const hasTag = (r: any, canonTag: string) => {
  const list = [...(r.canonical_tags || []), ...(r.tags || [])];
  const roTag = TAG_RO[canonTag];
  return list.includes(canonTag) || (roTag ? list.includes(roTag) : false);
};

const TAG_STYLE: Record<string, string> = {
  Vegetáriánus: 'bg-primary-fixed text-on-primary-fixed-variant',
  'Magas fehérje': 'bg-secondary-fixed text-on-secondary-fixed-variant',
  'Lassú főzés': 'bg-tertiary-fixed text-on-tertiary-fixed',
  'Főétel & Sültek': 'bg-secondary-fixed text-on-secondary-fixed-variant',
  'Protein Bowl & Tálak': 'bg-primary-fixed text-on-primary-fixed-variant',
  'Fehérje shake': 'bg-secondary-fixed text-on-secondary-fixed-variant',
  'Chia puding': 'bg-primary-fixed text-on-primary-fixed-variant',
  'Zabpuding & Kása': 'bg-tertiary-fixed text-on-tertiary-fixed',
  Smoothie: 'bg-primary-fixed text-on-primary-fixed-variant',
  Reggeli: 'bg-secondary-fixed text-on-secondary-fixed-variant',
  Saláta: 'bg-primary-fixed text-on-primary-fixed-variant',
  'Wrap & Omlett': 'bg-secondary-fixed text-on-secondary-fixed-variant',
  'Sós snack': 'bg-tertiary-fixed text-on-tertiary-fixed',
  'Édes snack': 'bg-secondary-fixed text-on-secondary-fixed-variant',
  'Sütemény & Torták': 'bg-tertiary-fixed text-on-tertiary-fixed',
  'Palacsinta & Muffin': 'bg-secondary-fixed text-on-secondary-fixed-variant',
  'Házi fagylalt': 'bg-primary-fixed text-on-primary-fixed-variant',
  'Főzés nélkül': 'bg-primary-fixed text-on-primary-fixed-variant',
  Desszert: 'bg-tertiary-fixed text-on-tertiary-fixed',
  Mediterrán: 'bg-primary-fixed text-on-primary-fixed-variant',
  '10 perces': 'bg-secondary-fixed text-on-secondary-fixed-variant',
  'Leves & Csorba': 'bg-tertiary-fixed text-on-tertiary-fixed',
  'Hal & Tenger gyümölcsei': 'bg-primary-fixed text-on-primary-fixed-variant',
  'Köretek & Krémek': 'bg-secondary-fixed text-on-secondary-fixed-variant',
  'Pékáru & Piték': 'bg-tertiary-fixed text-on-tertiary-fixed',
  'Szószok & Öntetek': 'bg-primary-fixed text-on-primary-fixed-variant',
  'Vegán / Böjti': 'bg-primary-fixed text-on-primary-fixed-variant',
  Tradicionális: 'bg-secondary-fixed text-on-secondary-fixed-variant',
};
const tagPill = (t: string, lang: 'hu' | 'ro' = 'hu') => {
  const canon = TAG_TO_CANONICAL[t] || t;
  const label = lang === 'ro' ? TAG_RO[canon] || t : t;
  return `<span class="inline-block px-2 py-0.5 rounded-full ${
    TAG_STYLE[canon] || TAG_STYLE[t] || 'bg-surface-container text-on-surface-variant'
  } text-label-sm shadow-sm">${esc(label)}</span>`;
};
const tagLinkPill = (t: string, lang: 'hu' | 'ro' = 'hu') => {
  const canon = TAG_TO_CANONICAL[t] || t;
  const label = lang === 'ro' ? TAG_RO[canon] || t : t;
  const href = FILTERS[canon]
    ? `#/kereses?f=${encodeURIComponent(canon)}`
    : `#/kereses?q=${encodeURIComponent(label)}`;
  return `<a href="${href}" class="inline-block px-2 py-0.5 rounded-full ${
    TAG_STYLE[canon] || TAG_STYLE[t] || 'bg-surface-container text-on-surface-variant'
  } text-label-sm shadow-sm hover:opacity-85 transition">${esc(label)}</a>`;
};

const accessBadge = (isFree: boolean, hasSub = false, lang: 'hu' | 'ro' = 'hu') =>
  isFree
    ? `<span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed-variant text-label-sm shadow-sm">${icon(
        'check_circle',
        'fill text-[12px]'
      )}${lang === 'ro' ? 'Gratuit' : 'Ingyenes'}</span>`
    : `<span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full ${
        hasSub
          ? 'bg-tertiary-fixed text-on-tertiary-fixed'
          : 'bg-secondary text-on-secondary'
      } text-label-sm shadow-sm">${icon(
        hasSub ? 'workspace_premium' : 'lock',
        'fill text-[12px]'
      )}Prémium</span>`.replace('>Prémium<', `>${lang === 'ro' ? 'Premium' : 'Prémium'}<`);

const CATEGORIES = [
  { name: 'Főétel & Sültek', icon: 'dinner_dining', img: 'assets/pdf2/p78.jpg', sub: 'Szaftos húsok, halak & tészták' },
  { name: 'Protein Bowl & Tálak', icon: 'rice_bowl', img: 'assets/pdf2/p96.jpg', sub: 'Mindent-egyben fehérjetálak' },
  { name: 'Reggeli', icon: 'egg_alt', img: 'assets/pdf/p104.jpg', sub: 'Gyors sós & édes brunchok' },
  { name: 'Saláta', icon: 'eco', img: 'assets/pdf/p109.jpg', sub: 'Friss és meleg salátatálak' },
  { name: 'Wrap & Omlett', icon: 'lunch_dining', img: 'assets/pdf/p117.jpg', sub: 'Tekercsek, tortillák & omlettek' },
  { name: 'Sós snack', icon: 'tapas', img: 'assets/pdf2/p52.jpg', sub: 'Előételek, krémek & falatkák' },
  { name: 'Sütemény & Torták', icon: 'cake', img: 'assets/pdf2/p126.jpg', sub: 'Sajttorták, brownie-k & piték' },
  { name: 'Palacsinta & Muffin', icon: 'bakery_dining', img: 'assets/pdf2/p172.jpg', sub: 'Puha zabmuffinok & palacsinták' },
  { name: 'Chia puding', icon: 'spa', img: 'assets/pdf/p81.jpg', sub: 'Rostdús krémpudingok' },
  { name: 'Zabpuding & Kása', icon: 'breakfast_dining', img: 'assets/pdf2/p143.jpg', sub: 'Krémes zabkásák & zabpudingok' },
  { name: 'Fehérje shake', icon: 'blender', img: 'assets/pdf/p74.jpg', sub: 'Laktató protein shake-ek' },
  { name: 'Smoothie', icon: 'local_cafe', img: 'assets/pdf/p98.jpg', sub: 'Frissítő gyümölcsturmixok' },
  { name: 'Édes snack', icon: 'cookie', img: 'assets/pdf/p130.jpg', sub: 'Bűntudatmentes nassolás' },
  { name: 'Házi fagylalt', icon: 'icecream', img: 'assets/pdf2/p178.jpg', sub: 'Fagyigép nélküli krémfagyik' },
  { name: 'Főzés nélkül', icon: 'bolt', img: 'assets/pdf/p136.jpg', sub: 'Tűzhely nélkül 10 perc alatt' },
  { name: 'Desszert', icon: 'celebration', img: 'assets/pdf/p143.jpg', sub: 'Cukormentes édességek' },
  { name: 'Leves & Csorba', icon: 'soup_kitchen', img: 'assets/pdf3/p65.jpg', sub: 'Hagyományos levesek és csorbák' },
  { name: 'Hal & Tenger gyümölcsei', icon: 'set_meal', img: 'assets/pdf3/p101.jpg', sub: 'Dunai és tengeri halételek' },
  { name: 'Köretek & Krémek', icon: 'tapas', img: 'assets/pdf3/p112.jpg', sub: 'Zakuszka, padlizsánkrém & köretek' },
  { name: 'Pékáru & Piték', icon: 'bakery_dining', img: 'assets/pdf3/p123.jpg', sub: 'Házi piték, lepények & kalácsok' },
  { name: 'Szószok & Öntetek', icon: 'blender', img: 'assets/pdf4/p138.jpg', sub: 'Böjti mártások, pestók & öntetek' },
];

const ALL_TAGS = [
  '10 perces',
  'Vegán / Böjti',
  'Főétel & Sültek',
  'Leves & Csorba',
  'Hal & Tenger gyümölcsei',
  'Köretek & Krémek',
  'Pékáru & Piték',
  'Szószok & Öntetek',
  'Protein Bowl & Tálak',
  'Reggeli',
  'Saláta',
  'Wrap & Omlett',
  'Sós snack',
  'Sütemény & Torták',
  'Palacsinta & Muffin',
  'Chia puding',
  'Zabpuding & Kása',
  'Fehérje shake',
  'Smoothie',
  'Édes snack',
  'Házi fagylalt',
  'Főzés nélkül',
  'Desszert',
  'Vegetáriánus',
  'Gluténmentes',
  'Magas fehérje',
  'Alacsony kalória',
  'Mediterrán',
  'Olasz klasszikus',
  'Lassú főzés',
  'Tradicionális',
];

const PREFS: [string, string, string][] = [
  ['10 perces ételek', 'bolt', '10 perces'],
  ['Mediterrán', 'eco', 'Mediterrán'],
  ['Gluténmentes', 'grain', 'Gluténmentes'],
  ['Gyors ételek', 'timer', '30 perces'],
  ['Magas fehérje', 'fitness_center', 'Magas fehérje'],
  ['Vegetáriánus', 'spa', 'Vegetáriánus'],
  ['Vegán / Böjti', 'eco', 'Vegán / Böjti'],
];

const FILTERS: Record<string, (r: any) => boolean> = {
  Ingyenes: r => Boolean(r.is_free || r.mine),
  Prémium: r => !r.is_free && !r.mine,
  '10 perces': r => r.prep + r.cook <= 10 || hasTag(r, '10 perces'),
  'Főétel & Sültek': r => hasTag(r, 'Főétel & Sültek') || r.canonical_category === 'Főétel & Sültek',
  'Protein Bowl & Tálak': r => hasTag(r, 'Protein Bowl & Tálak') || r.canonical_category === 'Protein Bowl & Tálak',
  Reggeli: r => hasTag(r, 'Reggeli') || r.canonical_category === 'Reggeli',
  Saláta: r => hasTag(r, 'Saláta') || r.canonical_category === 'Saláta',
  'Wrap & Omlett': r => hasTag(r, 'Wrap & Omlett') || r.canonical_category === 'Wrap & Omlett',
  'Sós snack': r => hasTag(r, 'Sós snack') || r.canonical_category === 'Sós snack',
  'Sütemény & Torták': r => hasTag(r, 'Sütemény & Torták') || r.canonical_category === 'Sütemény & Torták',
  'Palacsinta & Muffin': r => hasTag(r, 'Palacsinta & Muffin') || r.canonical_category === 'Palacsinta & Muffin',
  'Chia puding': r => hasTag(r, 'Chia puding') || r.canonical_category === 'Chia puding',
  'Zabpuding & Kása': r => hasTag(r, 'Zabpuding & Kása') || r.canonical_category === 'Zabpuding & Kása',
  'Fehérje shake': r => hasTag(r, 'Fehérje shake') || r.canonical_category === 'Fehérje shake',
  Smoothie: r => hasTag(r, 'Smoothie') || r.canonical_category === 'Smoothie',
  'Édes snack': r => hasTag(r, 'Édes snack') || r.canonical_category === 'Édes snack',
  'Házi fagylalt': r => hasTag(r, 'Házi fagylalt') || r.canonical_category === 'Házi fagylalt',
  'Főzés nélkül': r => hasTag(r, 'Főzés nélkül') || r.canonical_category === 'Főzés nélkül',
  Desszert: r => hasTag(r, 'Desszert') || r.canonical_category === 'Desszert',
  Vegetáriánus: r => hasTag(r, 'Vegetáriánus'),
  'Magas fehérje': r => hasTag(r, 'Magas fehérje'),
  Gluténmentes: r => hasTag(r, 'Gluténmentes'),
  'Alacsony kalória': r => r.kcal > 0 && r.kcal < 500,
  '30 perces': r => r.prep + r.cook <= 30,
  Mediterrán: r => hasTag(r, 'Mediterrán') || hasTag(r, 'Olasz klasszikus'),
  'Olasz klasszikus': r => hasTag(r, 'Olasz klasszikus'),
  'Lassú főzés': r => hasTag(r, 'Lassú főzés'),
  'Leves & Csorba': r => hasTag(r, 'Leves & Csorba') || r.canonical_category === 'Leves & Csorba' || r.category === 'Leves & Csorba',
  'Hal & Tenger gyümölcsei': r => hasTag(r, 'Hal & Tenger gyümölcsei') || r.canonical_category === 'Hal & Tenger gyümölcsei' || r.category === 'Hal & Tenger gyümölcsei',
  'Köretek & Krémek': r => hasTag(r, 'Köretek & Krémek') || r.canonical_category === 'Köretek & Krémek' || r.category === 'Köretek & Krémek',
  'Pékáru & Piték': r => hasTag(r, 'Pékáru & Piték') || r.canonical_category === 'Pékáru & Piték' || r.category === 'Pékáru & Piték',
  'Szószok & Öntetek': r => hasTag(r, 'Szószok & Öntetek') || r.canonical_category === 'Szószok & Öntetek' || r.category === 'Szószok & Öntetek',
  'Vegán / Böjti': r => hasTag(r, 'Vegán / Böjti'),
  Tradicionális: r => hasTag(r, 'Tradicionális'),
  'Saját receptjeim': r => !!r.mine,
};

export function App() {
  const clerk = useContext(ClerkBridgeContext);
  const clerkRef = useRef(clerk);
  clerkRef.current = clerk;
  // Preserve Stripe checkout session_id across React StrictMode remounts & Clerk async hydration
  const pendingCheckoutRef = useRef<{ sessionId: string; active: boolean } | null>(null);
  if (pendingCheckoutRef.current === null && typeof window !== 'undefined') {
    const [, initQs] = window.location.hash.slice(1).split('?');
    const initParams = new URLSearchParams(initQs || '');
    pendingCheckoutRef.current = {
      active: initParams.get('checkout') === 'success',
      sessionId: initParams.get('session_id') || '',
    };
  }
  const clerkMountRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<HTMLElement | null>(null);
  const [clerkAuthView, setClerkAuthView] = useState<{ open: boolean; reg: boolean }>({
    open: false,
    reg: false,
  });

  useEffect(() => {
    const $app = appRef.current!;
    if (!$app) return;

    let S = loadState();
    const tr = (hu: string, ro: string) => (S.lang === 'ro' ? ro : hu);
    const minLabel = () => (S.lang === 'ro' ? 'min' : 'p');
    const minsWord = () => (S.lang === 'ro' ? 'min' : 'perc');
    const srvWord = () => (S.lang === 'ro' ? 'porții' : 'adag');
    let publicRecipes: any[] = [];
    let seasonalItems: any[] = [];
    const recipeDetailsCache: Record<string, any> = {};
    let currentSubscriptionStatus: 'free' | 'active' | 'past_due' | 'canceled' = 'free';
    let currentSubscriptionEnd: string | null = null;
    let selectedPlan: 'monthly' | 'yearly' = 'monthly';
    let lastSubPlanRouteKey = '';
    let langMenuOpen = false;
    let cookiePrefsOpen = false;
    let subConsentTerms = false;
    let subConsentWaiver = false;
    let shopBtnResetTimer: ReturnType<typeof setTimeout> | null = null;

    shoppingStore.syncFromApp(S.shopping, S.lang, S.unit);
    shoppingStore.registerAppBridge(nextItems => {
      S.shopping = nextItems;
      const rt = route();
      if (rt.p[0] === 'profil' || rt.p[0] === 'r') {
        render(true);
      }
    });

    function save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(S));
        return true;
      } catch {
        toast(tr('Nem sikerült menteni – betelt a böngésző tárhelye', 'Nu s-a putut salva – spațiul browserului este plin'));
        return false;
      }
    }

    const getAuthHeaders = async (forceFreshToken = false): Promise<Record<string, string>> => {
      const headers: Record<string, string> = {};
      const liveClerk = clerkRef.current;
      if (liveClerk.enabled) {
        if (liveClerk.isSignedIn) {
          let tok = await liveClerk.getToken(forceFreshToken ? { skipCache: true } : undefined);
          if (!tok && !forceFreshToken) {
            tok = await liveClerk.getToken({ skipCache: true });
          }
          if (tok) headers['Authorization'] = `Bearer ${tok}`;
        }
      } else if (S.user) {
        const devId =
          S.user.id ||
          'user_' +
            norm(S.user.email || S.user.name)
              .replace(/[^a-z0-9]+/g, '_')
              .slice(0, 24);
        headers['x-dev-user-id'] = devId;
        headers['x-dev-user-email'] = S.user.email || `${devId}@vebeat.ro`;
      }
      return headers;
    };

    const all = () => [...S.mine, ...publicRecipes];
    const get = (id: string) => recipeDetailsCache[id] || all().find(r => r.id === id || r.slug === id);
    const isFav = (id: string) => S.favs.includes(id);
    const servingsOf = (r: any) => S.servings[r.id] || r.servings || 2;
    const hasSub = () => currentSubscriptionStatus === 'active';
    const isAuthReady = () => (!clerkRef.current.enabled ? true : clerkRef.current.isLoaded);
    const isUserSignedIn = () =>
      clerkRef.current.enabled ? clerkRef.current.isSignedIn : Boolean(S.user);

    function amountText(ing: any, r: any) {
      if (ing.qty == null) return ing.unit;
      let q = (ing.qty * servingsOf(r)) / (r.servings || 2);
      let u = ing.unit;
      if (S.unit === 'dkg') {
        if (u === 'g' && q >= 10) {
          q /= 10;
          u = 'dkg';
        } else if (u === 'ml' && q >= 100) {
          q /= 100;
          u = 'dl';
        }
      }
      return `${fmtNum(q)} ${u}`.trim();
    }
    const amount = (ing: any, r: any) => esc(amountText(ing, r));

    let toastTimer: any = null;
    function toast(msg: string) {
      const t = document.getElementById('toast');
      if (!t) return;
      t.textContent = msg;
      t.style.opacity = '1';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        t.style.opacity = '0';
      }, 2600);
    }

    function route() {
      const [path, qs] = location.hash.slice(1).split('?');
      const p = (path || '/')
        .split('/')
        .filter(Boolean)
        .map(s => {
          try {
            return decodeURIComponent(s);
          } catch {
            return s;
          }
        });
      return { p, q: new URLSearchParams(qs || '') };
    }

    /* ---------- Timers ---------- */
    const T: Record<string, any> = {};
    const tFmt = (s: number) => {
      const h = Math.floor(s / 3600),
        m = Math.floor((s % 3600) / 60),
        x = String(s % 60).padStart(2, '0');
      return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${String(m).padStart(2, '0')}:${x}`;
    };
    const tLabel = (t: any) =>
      t.run
        ? `${icon('pause', 'text-[20px]')}<span>${tr('Szünet', 'Pauză')}</span>`
        : `${icon('play_arrow', 'text-[20px]')}<span>${
            t.left > 0 && t.left < t.total ? tr('Folytatás', 'Continuă') : tr('Indítás', 'Start')
          }</span>`;

    function syncTimer(key: string) {
      const t = T[key];
      if (!t || (t.left === t.total && !t.run)) delete S.timers[key];
      else S.timers[key] = { left: t.left, total: t.total, run: t.run, endAt: t.endAt || 0 };
      save();
    }
    function startInterval(key: string) {
      const t = T[key];
      clearInterval(t.iv);
      t.run = true;
      t.iv = setInterval(() => {
        t.left = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
        if (t.left <= 0) {
          t.left = 0;
          clearInterval(t.iv);
          t.run = false;
          t.endAt = 0;
          delete S.timers[key];
          save();
          ding();
          toast(tr('Lejárt az időzítő!', 'Cronometrul a expirat!'));
        }
        paintTimers();
      }, 1000);
    }
    function timerOf(key: string, total: number) {
      if (!T[key]) {
        const st = S.timers[key];
        if (st) {
          const tot = st.total || total;
          if (st.run && st.endAt) {
            const rem = Math.max(0, Math.round((st.endAt - Date.now()) / 1000));
            T[key] = { left: rem || tot, total: tot, run: false, endAt: st.endAt };
            if (rem > 0) startInterval(key);
            else {
              delete S.timers[key];
              save();
            }
          } else {
            T[key] = { left: Math.max(0, st.left ?? tot), total: tot, run: false, endAt: 0 };
          }
        } else {
          T[key] = { left: total, total, run: false, endAt: 0 };
        }
      }
      return T[key];
    }
    function clearRecipeTimers(id: string) {
      Object.keys(T)
        .filter(k => k.startsWith(id + ':'))
        .forEach(k => {
          clearInterval(T[k].iv);
          delete T[k];
        });
      Object.keys(S.timers)
        .filter(k => k.startsWith(id + ':'))
        .forEach(k => delete S.timers[k]);
    }
    function tToggle(key: string, total: number) {
      const t = timerOf(key, total);
      if (t.run) {
        clearInterval(t.iv);
        t.run = false;
        t.endAt = 0;
      } else {
        if (t.left <= 0) t.left = t.total;
        t.endAt = Date.now() + t.left * 1000;
        startInterval(key);
      }
      syncTimer(key);
      paintTimers();
    }
    function paintTimers() {
      document.querySelectorAll<HTMLElement>('[data-timer]').forEach(el => {
        const t = T[el.dataset.timer!];
        if (t) el.textContent = tFmt(t.left);
      });
      document.querySelectorAll<HTMLElement>('[data-tbtn]').forEach(el => {
        const t = T[el.dataset.tbtn!];
        if (t) el.innerHTML = tLabel(t);
      });
      document.querySelectorAll<HTMLElement>('[data-tring]').forEach(el => {
        const t = T[el.dataset.tring!];
        if (t) el.style.strokeDashoffset = String(264 * (1 - t.left / Math.max(t.total, 1)));
      });
    }
    function ding() {
      navigator.vibrate?.([300, 120, 300]);
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        [0, 0.35, 0.7].forEach(at => {
          const o = ctx.createOscillator(),
            g = ctx.createGain();
          o.frequency.value = 880;
          o.connect(g);
          g.connect(ctx.destination);
          g.gain.setValueAtTime(0.2, ctx.currentTime + at);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.3);
          o.start(ctx.currentTime + at);
          o.stop(ctx.currentTime + at + 0.3);
        });
        setTimeout(() => ctx.close?.(), 1200);
      } catch {
        // ignore
      }
    }

    /* ---------- Wake Lock ---------- */
    let wl: any = null;
    async function wakeOn() {
      if (!S.wake) {
        wakeOff();
        paintWake();
        return;
      }
      if ('wakeLock' in navigator && !wl) {
        try {
          wl = await (navigator as any).wakeLock.request('screen');
          wl.addEventListener('release', () => {
            wl = null;
            paintWake();
          });
        } catch {
          wl = null;
        }
      }
      paintWake();
    }
    function wakeOff() {
      wl?.release();
      wl = null;
    }
    function paintWake() {
      const el = document.getElementById('wake');
      if (!el) return;
      const on = S.wake;
      el.setAttribute('aria-pressed', String(on));
      el.innerHTML = `<span class="w-2 h-2 rounded-full ${
        on ? 'bg-secondary animate-pulse' : 'bg-outline'
      }"></span>${icon('lock_clock', 'text-[15px] text-secondary')}<span>${
        on ? tr('Képernyő aktív marad', 'Ecran activ') : tr('Képernyőzár normál', 'Blocare normală')
      }</span>`;
    }

    /* ---------- Navigation Stack ---------- */
    const navHistory: string[] = [];
    function screenKey(hash: string) {
      const [path] = (hash || '#/').replace(/^#/, '').split('?');
      const [page, id] = (path || '/')
        .split('/')
        .filter(Boolean)
        .map(s => {
          try {
            return decodeURIComponent(s);
          } catch {
            return s;
          }
        });
      if (!page) return 'home';
      if (page === 'r') return 'r:' + (id || '');
      return page;
    }
    function recordNav(hash: string) {
      const key = screenKey(hash);
      if (['fozes', 'uj', 'szerk', 'belepes'].includes(key)) return;
      if (key === 'home') {
        navHistory.length = 0;
        navHistory.push('#/');
        return;
      }
      const cleanHash =
        key === 'profil'
          ? hash.replace(/([?&])(edit|checkout|portal)=[^&]*(&|$)/g, (_, p, _k, s) => (s ? p : ''))
          : hash;
      const idx = navHistory.findIndex(h => screenKey(h) === key);
      if (idx >= 0) {
        navHistory.length = idx + 1;
        navHistory[idx] = cleanHash;
      } else {
        navHistory.push(cleanHash);
        if (navHistory.length > 20) navHistory.shift();
      }
    }
    function goReplace(hash: string) {
      if (location.hash === hash) render();
      else location.replace(hash);
    }

    /* ---------- Backend API Sync (/api/recipes, /api/recipes/[slug], /api/me, /api/stripe/*) ---------- */
    async function syncMeAndRecipes(sessionId = '', reconcile = false) {
      try {
        const forceFresh = Boolean(sessionId || reconcile);
        const headers = await getAuthHeaders(forceFresh);
        const meParams = new URLSearchParams();
        if (sessionId) meParams.set('session_id', sessionId);
        if (reconcile) meParams.set('reconcile', '1');
        const meUrl = `/api/me${meParams.toString() ? '?' + meParams.toString() : ''}`;

        const [recipesRes, initialMeRes] = await Promise.all([
          fetch(`/api/recipes?lang=${S.lang}`),
          fetch(meUrl, { headers, credentials: 'same-origin' }),
        ]);
        if (recipesRes.ok) {
          const data = await recipesRes.json();
          publicRecipes = data.recipes || [];
          seasonalItems = data.seasonal || [];
        }

        let meData: any = initialMeRes.ok ? await initialMeRes.json() : null;

        // If Clerk reports signed-in on client but server saw an expired cached token, mint a fresh JWT and retry once
        if (
          meData &&
          !meData.authenticated &&
          clerkRef.current.enabled &&
          clerkRef.current.isSignedIn
        ) {
          const freshHeaders = await getAuthHeaders(true);
          if (freshHeaders['Authorization']) {
            const retryRes = await fetch(meUrl, {
              headers: freshHeaders,
              credentials: 'same-origin',
            });
            if (retryRes.ok) {
              meData = await retryRes.json();
            }
          }
        }

        if (meData) {
          if (meData.authenticated && meData.user) {
            currentSubscriptionStatus = meData.user.subscription_status || 'free';
            currentSubscriptionEnd = meData.user.subscription_end_date || null;
          } else if (isAuthReady()) {
            currentSubscriptionStatus = 'free';
            currentSubscriptionEnd = null;
          }
        }
      } catch (err) {
        console.error('Error syncing /api/recipes or /api/me:', err);
      }
    }

    async function fetchRecipeDetail(slug: string): Promise<any | null> {
      const mine = S.mine.find((x: any) => x.id === slug);
      if (mine) return { ...mine, is_free: true, locked: false };
      try {
        const headers = await getAuthHeaders();
        let res = await fetch(`/api/recipes/${encodeURIComponent(slug)}?lang=${S.lang}`, {
          headers,
          credentials: 'same-origin',
        });
        if (!res.ok) return null;
        let data = await res.json();
        if (
          data.viewer &&
          !data.viewer.authenticated &&
          clerkRef.current.enabled &&
          clerkRef.current.isSignedIn
        ) {
          const freshHeaders = await getAuthHeaders(true);
          if (freshHeaders['Authorization']) {
            const retryRes = await fetch(
              `/api/recipes/${encodeURIComponent(slug)}?lang=${S.lang}`,
              {
                headers: freshHeaders,
                credentials: 'same-origin',
              }
            );
            if (retryRes.ok) data = await retryRes.json();
          }
        }
        if (data.viewer?.subscription_status && data.viewer.subscription_status !== 'anonymous') {
          currentSubscriptionStatus = data.viewer.subscription_status;
        }
        if (data.recipe) {
          recipeDetailsCache[slug] = data.recipe;
          return data.recipe;
        }
      } catch (err) {
        console.error('Error fetching /api/recipes/' + slug, err);
      }
      return null;
    }

    async function startStripeCheckout(returnSlug = '', plan: 'monthly' | 'yearly' = selectedPlan) {
      const signedIn = isUserSignedIn();
      if (!signedIn) {
        toast(tr('Az előfizetés indításához kérlek jelentkezz be!', 'Conectează-te pentru a începe abonamentul!'));
        goReplace(`#/belepes?return=${encodeURIComponent(returnSlug || 'elofizetes')}`);
        return;
      }
      if (!subConsentTerms || !subConsentWaiver) {
        toast(
          tr(
            'Kérlek fogadd el az ÁSZF-et és az OUG 34/2014 szerinti digitális hozzáférési nyilatkozatot!',
            'Te rugăm să bifezi acordul cu Termenii și declarația de acces digital imediat (OUG 34/2014)!'
          )
        );
        return;
      }
      try {
        toast(tr('Stripe fizetési munkamenet indítása...', 'Se pornește sesiunea de plată Stripe...'));
        const headers = await getAuthHeaders(true);
        headers['Content-Type'] = 'application/json';
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers,
          credentials: 'same-origin',
          body: JSON.stringify({ returnSlug, plan, lang: S.lang }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast(data.error || tr('Hiba a fizetés indításakor', 'Eroare la inițierea plății'));
          return;
        }
        // Clear cached recipe details so unlocked state reloads fresh
        Object.keys(recipeDetailsCache).forEach(k => delete recipeDetailsCache[k]);
        if (data.url) {
          if (data.mode === 'dev_simulated_checkout') {
            await syncMeAndRecipes('', true);
            toast(tr('Vebeat Prémium előfizetés aktiválva!', 'Abonamentul Vebeat Premium a fost activat!'));
            const hashIdx = data.url.indexOf('#/');
            if (hashIdx !== -1) {
              goReplace(data.url.slice(hashIdx));
              return;
            }
          }
          window.location.href = data.url;
        }
      } catch {
        toast(tr('Nem sikerült elérni a fizetési szervert.', 'Nu s-a putut contacta serverul de plată.'));
      }
    }

    async function openStripePortal(action = 'manage') {
      try {
        toast(tr('Előfizetés-kezelő megnyitása...', 'Se deschide gestionarea abonamentului...'));
        const headers = await getAuthHeaders(true);
        headers['Content-Type'] = 'application/json';
        const res = await fetch('/api/stripe/portal', {
          method: 'POST',
          headers,
          credentials: 'same-origin',
          body: JSON.stringify({ action }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast(data.error || tr('Nem sikerült megnyitni az előfizetés-kezelőt.', 'Nu s-a putut deschide portalul de abonament.'));
          return;
        }
        Object.keys(recipeDetailsCache).forEach(k => delete recipeDetailsCache[k]);
        await syncMeAndRecipes();
        if (data.mode === 'dev_simulated_portal') {
          if (action === 'cancel') {
            toast(tr('Előfizetés lemondva (Ingyenes csomag).', 'Abonament anulat (Plan Gratuit).'));
          } else {
            toast(tr('Stripe Customer Portal szimuláció: aktív előfizetés.', 'Simulare Stripe Customer Portal: abonament activ.'));
          }
          render(true);
          return;
        }
        if (data.url) {
          window.location.href = data.url;
        }
      } catch {
        toast(tr('Hiba az előfizetés-kezelő megnyitásakor.', 'Eroare la deschiderea portalului de abonament.'));
      }
    }

    /* ---------- UI Components ---------- */
    const activeUserName = () => {
      const liveClerk = clerkRef.current;
      return liveClerk.enabled
        ? liveClerk.isSignedIn
          ? liveClerk.fullName || liveClerk.email || 'Séf'
          : null
        : S.user?.name || null;
    };

    const langName = (l: 'hu' | 'ro') => (l === 'ro' ? 'Română' : 'Magyar');

    const PAGE_X = 'w-full max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8';
    const NARROW_X = 'w-full max-w-3xl mx-auto px-3.5 sm:px-6 lg:px-8';

    const langBtn = () => {
      const currentName = langName(S.lang);
      return `<div class="relative">
        <button type="button" data-act="toggleLangMenu" aria-haspopup="menu" aria-expanded="${langMenuOpen}" aria-label="${tr(
          `Kiválasztott nyelv: ${currentName} — Nyelv váltása`,
          `Limbă selectată: ${currentName} — Schimbă limba`
        )}" title="${tr(
          `Kiválasztott nyelv: ${currentName}`,
          `Limbă selectată: ${currentName}`
        )}" class="px-2 sm:px-2.5 py-1.5 rounded-full bg-surface-container-lowest border border-primary/25 text-primary text-[11px] sm:text-label-sm flex items-center gap-1 shadow-sm hover:bg-surface-container-high active:scale-95 transition whitespace-nowrap">
          ${icon('language', 'text-[14px] sm:text-[15px] text-secondary shrink-0')}
          <span class="font-bold">${currentName}</span>
          ${icon(langMenuOpen ? 'expand_less' : 'expand_more', 'text-[14px] text-on-surface-variant shrink-0')}
        </button>
        ${
          langMenuOpen
            ? `<div data-act="closeLangMenu" class="fixed inset-0 z-40" aria-hidden="true"></div>
               <div id="lang-menu" role="menu" aria-label="${tr('Nyelvválasztó', 'Selector limbă')}" class="absolute right-0 top-11 z-50 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-surface-container-lowest border border-outline-variant/40 shadow-xl p-2 flex flex-col gap-1">
                 <div class="px-2.5 py-1.5 border-b border-outline-variant/25 text-label-sm text-on-surface-variant flex items-center justify-between">
                   <span>${tr('Kiválasztott nyelv', 'Limbă selectată')}:</span>
                   <strong class="text-primary">${currentName} (${S.lang.toUpperCase()})</strong>
                 </div>
                 <button type="button" role="menuitemradio" aria-checked="${S.lang === 'hu'}" data-act="pickLang" data-lang="hu" class="w-full px-2.5 py-2 rounded-xl flex items-center gap-2.5 text-left transition ${
                   S.lang === 'hu'
                     ? 'bg-secondary-fixed/70 text-primary'
                     : 'hover:bg-surface-container text-on-surface'
                 }">
                   <span class="w-7 h-7 rounded-full text-label-sm font-bold flex items-center justify-center shrink-0 ${
                     S.lang === 'hu' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
                   }">HU</span>
                   <span class="flex-1 min-w-0">
                     <span class="block text-label-lg font-semibold leading-tight">Magyar</span>
                     <span class="block text-label-sm text-on-surface-variant">Receptek magyar nyelven</span>
                   </span>
                   ${S.lang === 'hu' ? icon('check_circle', 'fill text-[18px] text-secondary shrink-0') : ''}
                 </button>
                 <button type="button" role="menuitemradio" aria-checked="${S.lang === 'ro'}" data-act="pickLang" data-lang="ro" class="w-full px-2.5 py-2 rounded-xl flex items-center gap-2.5 text-left transition ${
                   S.lang === 'ro'
                     ? 'bg-secondary-fixed/70 text-primary'
                     : 'hover:bg-surface-container text-on-surface'
                 }">
                   <span class="w-7 h-7 rounded-full text-label-sm font-bold flex items-center justify-center shrink-0 ${
                     S.lang === 'ro' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
                   }">RO</span>
                   <span class="flex-1 min-w-0">
                     <span class="block text-label-lg font-semibold leading-tight">Română</span>
                     <span class="block text-label-sm text-on-surface-variant">Rețete în limba română</span>
                   </span>
                   ${S.lang === 'ro' ? icon('check_circle', 'fill text-[18px] text-secondary shrink-0') : ''}
                 </button>
               </div>`
            : ''
        }
      </div>`;
    };

    const shoppingBagTrigger = () => {
      const pendingCount = S.shopping.filter(it => !it.checked).length;
      return `<button type="button" data-act="open-shop" aria-label="${tr(
        `Bevásárlólista (${pendingCount} tétel)`,
        `Listă de cumpărături (${pendingCount} articole)`
      )}" title="${tr('Bevásárlólista megnyitása', 'Deschide lista de cumpărături')}" class="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-surface-container-lowest border border-outline-variant/45 hover:border-primary/40 hover:bg-surface-container-low text-primary flex items-center justify-center shadow-sm active:scale-95 transition shrink-0">
        ${icon('shopping_bag', 'text-[18px] sm:text-[19px] text-primary')}
        <span data-shop-badge class="${
          pendingCount > 0 ? 'inline-flex' : 'hidden'
        } absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-secondary text-on-secondary text-[10px] font-bold items-center justify-center shadow-sm leading-none">${pendingCount}</span>
      </button>`;
    };

    const avatarPill = () => {
      const uName = activeUserName();
      const rt = route();
      const curSlug = rt.p[0] === 'r' && rt.p[1] ? rt.p[1] : '';
      const subHref = curSlug ? `#/elofizetes?return=${encodeURIComponent(curSlug)}` : '#/elofizetes';
      return `<div class="flex items-center gap-1 sm:gap-1.5 shrink-0">
        ${shoppingBagTrigger()}
        ${langBtn()}
        ${
          hasSub()
            ? `<a href="#/profil" aria-label="${tr('Prémium', 'Premium')}" class="inline-flex items-center justify-center gap-1 w-8 h-8 min-[430px]:w-auto min-[430px]:h-auto min-[430px]:px-2.5 min-[430px]:py-1.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed text-[11px] sm:text-label-sm shadow-sm whitespace-nowrap shrink-0">${icon(
                'workspace_premium',
                'fill text-[15px] min-[430px]:text-[13px]'
              )}<span class="hidden min-[430px]:inline">${tr('Prémium', 'Premium')}</span></a>`
            : `<a href="${subHref}" aria-label="${tr('Prémium', 'Premium')}" class="inline-flex items-center justify-center gap-1 w-8 h-8 min-[430px]:w-auto min-[430px]:h-auto min-[430px]:px-2.5 min-[430px]:py-1.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-[11px] sm:text-label-sm shadow-sm hover:opacity-90 whitespace-nowrap shrink-0">${icon(
                'workspace_premium',
                'fill text-[15px] min-[430px]:text-[13px] text-secondary'
              )}<span class="hidden min-[430px]:inline">${tr('Prémium', 'Premium')}</span></a>`
        }
        <a href="#/profil" aria-label="${tr('Profil', 'Profil')}" class="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center shrink-0"><span class="w-8 h-8 sm:w-9 sm:h-9 rounded-full ${
          hasSub() ? 'bg-secondary text-on-secondary ring-2 ring-tertiary-fixed' : 'bg-primary text-on-primary'
        } flex items-center justify-center text-label-md">${
          uName ? esc(uName[0].toUpperCase()) : icon('person', 'text-[18px]')
        }</span></a>
      </div>`;
    };

    function brandHeader() {
      return `<header class="sticky top-0 z-30 gpu-sticky-header bg-surface/95 backdrop-blur-md border-b border-outline-variant/25 shadow-[0_1px_8px_rgba(0,0,0,0.03)] no-print">
        <div class="max-w-6xl mx-auto h-16 px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2">
          <a href="#/" class="flex items-center gap-1.5 min-w-0">${icon('local_dining', 'text-secondary text-[20px] sm:text-[24px] shrink-0')}
            <span class="flex flex-col min-w-0"><span class="font-serif text-[19px] sm:text-headline-sm text-primary tracking-tight leading-none">Vebeat</span>
            <span class="text-[9.5px] sm:text-[11px] font-semibold tracking-normal text-on-surface-variant leading-tight mt-0.5 whitespace-nowrap">Fuel your daily vibe.</span></span></a>
          <div class="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <a href="#/kereses" aria-label="${tr('Keresés', 'Căutare')}" class="hidden sm:flex w-9 h-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container">${icon('search', 'text-[20px]')}</a>
            ${avatarPill()}
          </div>
        </div></header>`;
    }

    function titleHeader(
      title: string,
      right = `<div class="flex items-center gap-1 sm:gap-1.5 shrink-0"><a href="#/kereses" aria-label="${tr('Keresés', 'Căutare')}" class="hidden sm:flex w-9 h-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container">${icon('search', 'text-[20px]')}</a>${avatarPill()}</div>`
    ) {
      return `<header class="sticky top-0 z-30 gpu-sticky-header bg-surface/95 backdrop-blur-md border-b border-outline-variant/25 shadow-[0_1px_8px_rgba(0,0,0,0.03)] no-print">
        <div class="max-w-6xl mx-auto h-16 px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2">
          <div class="flex items-center gap-1 min-w-0">
            <button type="button" data-act="back" aria-label="${tr('Vissza', 'Înapoi')}" class="w-9 h-9 sm:w-10 sm:h-10 -ml-1.5 flex items-center justify-center rounded-full hover:bg-surface-container shrink-0">${icon('arrow_back')}</button>
            <h1 class="font-serif text-[16px] sm:text-title-lg text-primary truncate">${esc(title)}</h1>
          </div>${right}</div></header>`;
    }

    const favBtn = (id: string, size = 'w-8 h-8') =>
      `<button data-act="fav" data-id="${esc(id)}" aria-pressed="${isFav(id)}" aria-label="${
        isFav(id)
          ? tr('Eltávolítás a kedvencek közül', 'Elimină de la favorite')
          : tr('Mentés kedvencekhez', 'Salvează la favorite')
      }" class="${size} rounded-full bg-surface-container-lowest/90 backdrop-blur-sm flex items-center justify-center shadow-sm active:scale-90 transition ${
        isFav(id) ? 'text-secondary' : 'text-on-surface-variant hover:text-secondary'
      }">${icon('favorite', 'text-[16px] ' + (isFav(id) ? 'fill' : ''))}</button>`;

    const ratingPill = (r: any) =>
      r.rating
        ? `<span class="px-2 py-0.5 rounded-full bg-surface-container-lowest/90 backdrop-blur-sm text-primary text-label-sm flex items-center gap-1 shadow-sm">${icon(
            'star',
            'fill text-secondary text-[12px]'
          )}${r.rating}<span class="text-on-surface-variant font-normal">(${r.reviews})</span></span>`
        : '';

    function recipeCard(r: any) {
      const free = Boolean(r.is_free || r.mine);
      return `<article class="perf-card bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm flex flex-col group border border-outline-variant/30 transition-transform duration-150 active:scale-[0.99]">
        <div class="relative w-full aspect-[4/3] overflow-hidden bg-surface-container-low">
          <a href="#/r/${encodeURIComponent(r.id)}" tabindex="-1"><img loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 ease-out" src="${img(
            r.image
          )}" alt="${esc(r.title)}"></a>
          <div class="absolute top-2 left-2 right-11 flex items-center gap-1 flex-wrap pointer-events-none">${accessBadge(free, hasSub(), S.lang)}</div>
          <div class="absolute top-2 right-2">${favBtn(r.id, 'w-8 h-8')}</div>
          ${
            r.tags?.[0]
              ? `<div class="absolute bottom-2 left-2 right-2 flex pointer-events-none"><span class="max-w-full truncate">${tagPill(r.tags[0], S.lang)}</span></div>`
              : ''
          }
        </div>
        <div class="p-3 flex flex-col justify-between flex-grow gap-2">
          <a href="#/r/${encodeURIComponent(r.id)}" class="font-serif text-[15px] sm:text-[17px] text-on-surface line-clamp-2 leading-snug tracking-tight hover:text-primary min-h-[2.6em]">${esc(
            r.title
          )}</a>
          <div class="flex flex-col gap-1.5 pt-1.5 border-t border-outline-variant/30">
            <div class="flex items-center justify-between gap-1 text-on-surface-variant text-[11px] sm:text-[12px]">
              <span class="flex items-center gap-1 whitespace-nowrap">${icon(
                'schedule',
                'text-secondary text-[14px]'
              )} ${r.prep + r.cook} ${minLabel()}</span>
              <span class="flex items-center gap-1 whitespace-nowrap">${icon(
                'local_fire_department',
                'text-primary-container text-[14px]'
              )} ${r.kcal || '–'} kcal</span>
            </div>
            <div class="flex items-center justify-between gap-1 text-label-sm">
              <span class="text-secondary uppercase tracking-wider truncate">${esc(r.difficulty)}</span>
              <span class="text-[11px] text-on-surface-variant/80 font-normal whitespace-nowrap">${r.servings} ${srvWord()}</span>
            </div>
          </div>
        </div></article>`;
    }

    const grid = (list: any[]) =>
      list.length
        ? `<div class="grid grid-cols-1 min-[340px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">${list.map(recipeCard).join('')}</div>`
        : `<div class="text-center py-12 px-6 bg-surface-container-low rounded-xl text-on-surface-variant">${icon(
            'search_off',
            'text-[36px] text-outline'
          )}<p class="mt-2">${tr('Nincs találat. Próbálj más kulcsszót vagy szűrőt.', 'Niciun rezultat. Încearcă alt cuvânt cheie sau filtru.')}</p></div>`;

    const chip = (label: string, active: boolean, href: string, ic = '') =>
      `<a href="${href}" class="px-3.5 py-1.5 rounded-full text-label-md whitespace-nowrap flex items-center gap-1.5 transition active:scale-95 ${
        active
          ? 'bg-primary text-on-primary shadow-sm'
          : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
      }">${
        ic ? icon(ic, 'text-[16px] ' + (active ? '' : 'text-secondary')) : ''
      }<span>${esc(label)}</span></a>`;

    function activeCookBanner() {
      const items = Object.entries(S.progress as Record<string, { step: number; at: number }>)
        .map(([id, p]) => ({ r: get(id), step: p?.step || 1, at: p?.at || 0 }))
        .filter(x => x.r && x.step >= 1 && Boolean(x.r.is_free || x.r.mine || hasSub()))
        .sort((a, b) => b.at - a.at);
      if (!items.length) return '';
      return `<section class="flex flex-col gap-2" aria-label="${tr('Folyamatban lévő főzés', 'Gătit în curs')}">
        ${items
          .map(({ r, step }) => {
            const total = r.steps?.length || r.step_count || 3;
            const pct = Math.min(100, Math.round((step / total) * 100));
            const s = r.steps?.[step - 1];
            return `<div class="bg-primary text-on-primary rounded-xl p-3.5 shadow-md flex flex-col gap-2.5 border border-secondary/30">
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2.5 min-w-0">
                  <img src="${img(r.image)}" alt="" class="w-12 h-12 rounded-lg object-cover shrink-0 border border-on-primary/20">
                  <div class="min-w-0">
                    <span class="inline-flex items-center gap-1 text-label-sm uppercase tracking-wider text-secondary-fixed">${icon(
                      'skillet',
                      'text-[14px]'
                    )}${tr('Ott folytathatod, ahol abbahagytad', 'Poți continua de unde ai rămas')}</span>
                    <p class="font-serif text-title-md truncate">${esc(r.title)}</p>
                    <p class="text-body-sm text-on-primary-container truncate">${tr(
                      `${step} / ${total}. lépés`,
                      `Pasul ${step} / ${total}`
                    )}${s?.title ? ': ' + esc(s.title) : ''} (${pct}%)</p>
                  </div>
                </div>
                <button type="button" data-act="resetprog" data-id="${esc(
                  r.id
                )}" aria-label="${tr('Mentett főzési folyamat törlése', 'Șterge progresul salvat')}" class="w-8 h-8 rounded-full bg-primary-container text-on-primary-container hover:text-on-primary flex items-center justify-center shrink-0">${icon(
              'close',
              'text-[18px]'
            )}</button>
              </div>
              <div class="h-1.5 rounded-full bg-primary-container overflow-hidden"><div class="h-full bg-secondary-container rounded-full" style="width:${pct}%"></div></div>
              <div class="flex flex-col min-[380px]:flex-row gap-2">
                <a href="#/fozes/${encodeURIComponent(
                  r.id
                )}/${step}" class="flex-1 min-h-[42px] px-3.5 py-2 rounded-lg bg-secondary text-on-secondary text-[12px] sm:text-label-md font-semibold flex items-center justify-center gap-1.5 text-center leading-snug shadow-sm active:scale-[0.99] transition">${icon(
              'play_arrow',
              'fill text-[18px] shrink-0'
            )}<span>${tr(`Főzés folytatása (${step}/${total}. lépés)`, `Continuă gătitul (pasul ${step}/${total})`)}</span></a>
                <a href="#/r/${encodeURIComponent(
                  r.id
                )}" class="min-h-[42px] px-3.5 py-2 rounded-lg bg-primary-container text-on-primary text-[12px] sm:text-label-md font-semibold flex items-center justify-center shrink-0">${tr('Recept', 'Rețetă')}</a>
              </div>
            </div>`;
          })
          .join('')}
      </section>`;
    }

    function categoriesSection(list = all(), activeCat = '') {
      const tenMinCount = list.filter(FILTERS['10 perces']).length;
      const freeCount = list.filter(FILTERS['Ingyenes']).length;
      return `<section class="flex flex-col gap-space-sm" aria-label="${tr('Receptkategóriák', 'Categorii de rețete')}">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <h3 class="font-serif text-headline-sm text-primary flex items-center gap-1.5">${icon(
              'category',
              'text-secondary text-[19px]'
            )}${tr('Receptkategóriák', 'Categorii de rețete')}</h3>
            <p class="text-body-sm text-on-surface-variant">${CATEGORIES.length} ${tr('kategória', 'categorii')} • ${
              list.length
            } ${tr(`recept (${freeCount} ingyenes • ${tenMinCount} db 10 perces)`, `rețete (${freeCount} gratuite • ${tenMinCount} în 10 min)`)}</p>
          </div>
          <a href="#/kereses?f=${encodeURIComponent(
            '10 perces'
          )}" class="px-3 py-1.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-label-sm flex items-center gap-1 shadow-sm hover:opacity-90 shrink-0">${icon(
        'bolt',
        'text-[14px]'
      )}${tr(`10 percesek (${tenMinCount})`, `În 10 min (${tenMinCount})`)}</a>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
          ${CATEGORIES.map(c => {
            const cnt = list.filter(FILTERS[c.name]).length;
            const on = activeCat === c.name;
            const target = on ? '#/kereses' : `#/kereses?f=${encodeURIComponent(c.name)}`;
            const catTitle = trTag(c.name, S.lang);
            const catSub = S.lang === 'ro' ? CAT_SUB_RO[c.name] || c.sub : c.sub;
            return `<a href="${target}" class="relative h-20 sm:h-24 rounded-xl overflow-hidden shadow-sm flex items-end p-2.5 sm:p-3 group border ${
              on ? 'border-secondary ring-2 ring-secondary/40' : 'border-outline-variant/30'
            }">
              <img loading="lazy" src="${img(c.img)}" alt="${esc(
                catTitle
              )}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
              <div class="absolute inset-0 bg-gradient-to-r from-primary/90 via-primary/65 to-black/25"></div>
              <div class="relative z-10 flex items-center justify-between w-full gap-1.5 text-on-primary">
                <div class="min-w-0">
                  <span class="flex items-center gap-1 font-serif text-[14px] sm:text-[16px] leading-tight truncate">${icon(
                    c.icon,
                    'text-secondary-fixed text-[15px] shrink-0'
                  )}<span class="truncate">${esc(catTitle)}</span></span>
                  <span class="block text-[11px] text-surface-variant truncate">${esc(catSub)}</span>
                </div>
                <span class="shrink-0 px-2 py-0.5 rounded-full bg-surface-container-lowest/90 text-primary text-label-sm">${cnt}</span>
              </div>
            </a>`;
          }).join('')}
        </div>
      </section>`;
    }

    function viewHome() {
      const list = all();
      if (!list.length) {
        return (
          brandHeader() +
          `<div class="${PAGE_X} py-20 text-center text-on-surface-variant">${tr('Receptek betöltése a szerverről...', 'Se încarcă rețetele de pe server...')}</div>`
        );
      }
      const freeCount = list.filter(r => Boolean(r.is_free || r.mine)).length;
      const premiumCount = list.filter(r => !r.is_free && !r.mine).length;
      const subActive = hasSub();
      const f = list.find(r => r.featured) || list[0];
      const others = list.filter(r => r.id !== f.id);
      const popular = (others.length ? others : list)
        .slice()
        .sort((a, b) => (b.mine ? 9 : b.rating || 0) - (a.mine ? 9 : a.rating || 0))
        .slice(0, 8);
      const userLoggedIn = isUserSignedIn();
      const heroCtaHref = '#/elofizetes?plan=yearly';

      const topConversionHero = subActive
        ? `<section class="rounded-2xl bg-primary text-on-primary p-4 sm:p-5 shadow-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-secondary/30">
            <div class="flex items-start gap-3 min-w-0">
              <span class="w-10 h-10 rounded-xl bg-secondary text-on-secondary flex items-center justify-center shrink-0">${icon('workspace_premium', 'fill text-[22px]')}</span>
              <div class="min-w-0">
                <p class="text-label-sm uppercase tracking-wider text-secondary-fixed">${tr('Vebeat Prémium fiók aktív', 'Cont Vebeat Premium activ')}</p>
                <p class="text-body-sm text-surface-variant mt-0.5">${tr(
                  `Mind a ${list.length} séf-recept, az adagoló és a Főzési Mód korlátlanul elérhető.`,
                  `Ai acces nelimitat la toate cele ${list.length} rețete, calculatorul de porții și Modul de Gătit.`
                )}</p>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 shrink-0">
              <a href="#/kereses?f=Prémium" class="min-h-[42px] px-4 rounded-full bg-[#fcf9f3] text-[#132a1f] text-label-lg font-semibold flex items-center gap-1.5 shadow-sm hover:opacity-95 transition">${icon('menu_book', 'text-[18px] text-secondary')}${tr('Prémium receptek', 'Rețete Premium')}</a>
              <button type="button" data-act="portal" class="min-h-[42px] px-3.5 rounded-full border border-white/25 bg-white/10 hover:bg-white/20 text-on-primary text-label-lg flex items-center gap-1.5 transition">${icon('credit_card', 'text-[18px]')}${tr('Fiók kezelése', 'Gestionează')}</button>
            </div>
          </section>`
        : `<section aria-label="${tr('Vebeat Prémium bemutató', 'Prezentare Vebeat Premium')}" class="relative rounded-[24px] overflow-hidden bg-[#132a1f] text-[#fcf9f3] shadow-xl border border-outline-variant/20">
            <!-- Mobile-first full-bleed dish photograph -->
            <div class="relative h-56 sm:h-64 md:hidden overflow-hidden">
              <img src="/assets/hero-vebeat-editorial.jpg" fetchpriority="high" alt="${tr('Vebeat séf-vacsora – ropogós lazac arany sáfrányos rizottóval', 'Cină Vebeat de chef – somon crocant cu risotto auriu')}" class="w-full h-full object-cover object-center">
              <div class="absolute inset-0 pointer-events-none" style="background: linear-gradient(180deg, rgba(19,42,31,0.12) 0%, rgba(19,42,31,0.28) 55%, #132a1f 100%)"></div>
              <div class="absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#132a1f]/75 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-[#fcf9f3]">
                ${icon('star', 'fill text-[13px] text-[#f4b860]')}
                <span>4.9/5 • ${tr(`${list.length} séf-recept`, `${list.length} rețete de chef`)}</span>
              </div>
            </div>
            <!-- Desktop/tablet editorial background photograph with directional walnut-forest scrim -->
            <img src="/assets/hero-vebeat-editorial.jpg" fetchpriority="high" alt="${tr('Vebeat séf-vacsora – ropogós lazac arany sáfrányos rizottóval', 'Cină Vebeat de chef – somon crocant cu risotto auriu')}" class="hidden md:block absolute inset-0 w-full h-full object-cover object-right">
            <div class="hidden md:block absolute inset-0 pointer-events-none" style="background: linear-gradient(90deg, #132a1f 0%, rgba(19,42,31,0.93) 42%, rgba(19,42,31,0.48) 66%, rgba(19,42,31,0.06) 100%)"></div>

            <div class="relative z-10 px-5 pb-6 pt-1 sm:px-7 sm:pb-7 md:p-9 lg:p-10 md:max-w-[58%] lg:max-w-[54%] flex flex-col gap-3.5 sm:gap-4">
              <div class="hidden md:inline-flex self-start items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[11px] font-semibold tracking-wider uppercase text-[#ffdad0]">
                ${icon('star', 'fill text-[14px] text-[#f4b860]')}
                <span>4.9/5 • ${tr(`${list.length} ellenőrzött séf-recept`, `${list.length} rețete verificate de chef`)}</span>
              </div>
              <h2 class="font-serif text-[27px] sm:text-[34px] lg:text-[40px] leading-[1.1] tracking-tight text-[#fcf9f3]">${tr(
                'Éttermi vacsorák húsz perc alatt. Találgatás nélkül.',
                'Cine ca la restaurant în 20 de minute. Fără improvizații.'
              )}</h2>
              <p class="text-body-sm sm:text-body-md text-[#e8e3d9] leading-relaxed max-w-xl">${tr(
                'Grammra pontos adagok, illatos szezonális fogások és lépésről lépésre vezető főzőmód, hogy minden este biztos siker legyen.',
                'Cantități calibrate la gram, arome de sezon și Modul Interactiv de Gătit pas cu pas, ca fiecare seară în bucătărie să fie o reușită.'
              )}</p>
              <div class="flex flex-wrap items-center gap-2.5 pt-1">
                <a href="${heroCtaHref}" data-cta="hero-premium" class="min-h-[48px] px-5 sm:px-6 rounded-full bg-[#fcf9f3] hover:bg-[#ffdad0] text-[#132a1f] text-[14px] sm:text-title-md font-semibold inline-flex items-center justify-center gap-2 shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition">
                  ${icon('workspace_premium', 'fill text-[19px] text-secondary')}
                  <span>${tr('Prémium séftár megnyitása', 'Deschide colecția Premium')}</span>
                  ${icon('arrow_forward', 'text-[18px]')}
                </a>
                <a href="#/kereses?f=Ingyenes" class="min-h-[48px] px-4 sm:px-5 rounded-full border border-white/30 bg-white/10 hover:bg-white/20 text-[#fcf9f3] text-[13px] sm:text-label-lg font-medium inline-flex items-center justify-center gap-1.5 backdrop-blur-sm transition">
                  <span>${tr(`Ingyenes kóstoló (${freeCount})`, `Rețete gratuite (${freeCount})`)}</span>
                </a>
              </div>
              <p class="text-[11px] sm:text-[12px] text-[#d6d0c4] flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>${tr(
                  `Azonnali hozzáférés mind a ${premiumCount} exkluzív recepthez • Bármikor lemondható`,
                  `Acces instant la toate cele ${premiumCount} rețete exclusive • Poți anula oricând`
                )}</span>
                ${
                  userLoggedIn
                    ? ''
                    : `<a href="#/belepes" class="text-[#ffdad0] hover:underline font-medium">${tr('Már tag vagy? Belépés', 'Ai deja cont? Autentificare')}</a>`
                }
              </p>
            </div>
          </section>`;

      const midConversionStrip = subActive
        ? ''
        : `<section aria-label="${tr('Prémium csomagok összehasonlítása', 'Comparație planuri Premium')}" class="rounded-2xl bg-surface-container-lowest border border-secondary/25 shadow-sm p-5 sm:p-6 flex flex-col gap-5">
            <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <div class="flex flex-col gap-1.5 max-w-2xl">
                <span class="text-label-sm uppercase tracking-wider text-secondary font-bold">${tr('Válassz hozzáférést', 'Alege accesul potrivit')}</span>
                <h3 class="font-serif text-headline-sm sm:text-headline-md text-primary leading-tight">${tr(
                  `Miért választják egyre többen a Vebeat Prémium fiókot?`,
                  `De ce aleg tot mai mulți contul Vebeat Premium?`
                )}</h3>
                <p class="text-body-sm text-on-surface-variant">${tr(
                  `A ${freeCount} ingyenes recept mellett azonnal megnyílik mind a ${premiumCount} exkluzív recept és minden kényelmi funkció.`,
                  `Pe lângă cele ${freeCount} rețete gratuite, deblochezi instant toate cele ${premiumCount} rețete exclusive și funcțiile smart.`
                )}</p>
              </div>
              <a href="#/elofizetes" class="self-start md:self-auto text-label-lg text-secondary font-semibold hover:underline inline-flex items-center gap-1 shrink-0">${tr('Összes csomag részletei', 'Detalii complete planuri')}${icon('arrow_forward', 'text-[17px]')}</a>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              ${[
                ['menu_book', tr(`${premiumCount} Prémium recept`, `${premiumCount} Rețete Premium`), tr('Tradicionális, fitt, 10 perces és böjti fogások.', 'Rețete tradiționale, fit, gata în 10 min și de post.')],
                ['timer', tr('Interaktív Főzési Mód', 'Mod de Gătit Interactiv'), tr('Beépített időzítővel és képernyő-ébrentartással.', 'Cu cronometru integrat și ecran mereu activ.')],
                ['calculate', tr('Intelligens adagoló', 'Dozaj inteligent'), tr('Minden hozzávaló 1 kattintással átméretezve.', 'Toate ingredientele recalculate cu 1 click.')],
                ['checklist', tr('Bevásárlólista export', 'Export listă cumpărături'), tr('Azonnali másolás vagy Google Keep export.', 'Copiere rapidă sau export în Google Keep.')],
              ]
                .map(
                  ([ic, t, d]) =>
                    `<div class="p-3.5 rounded-xl bg-surface-container-low/80 border border-outline-variant/25 flex items-start gap-2.5">
                      <span class="w-8 h-8 rounded-lg bg-secondary-fixed/70 text-secondary flex items-center justify-center shrink-0">${icon(ic, 'text-[18px]')}</span>
                      <div class="min-w-0">
                        <p class="text-title-sm font-semibold text-primary leading-snug">${t}</p>
                        <p class="text-[12px] text-on-surface-variant mt-0.5 leading-snug">${d}</p>
                      </div>
                    </div>`
                )
                .join('')}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div class="p-4 rounded-xl border border-outline-variant/40 bg-surface-container-low/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <span class="text-label-sm uppercase tracking-wider text-on-surface-variant">${tr('Havi Prémium', 'Premium Lunar')}</span>
                  <p class="font-serif text-title-lg text-primary mt-0.5">${esc(PLANS[S.lang].monthly.priceLabel)}</p>
                  <p class="text-[12px] text-on-surface-variant">${tr('Rugalmas havi előfizetés, bármikor lemondható.', 'Abonament flexibil, anulare oricând.')}</p>
                </div>
                <a href="#/elofizetes?plan=monthly" class="min-h-[44px] px-4 rounded-xl border border-primary/25 bg-surface-container-lowest text-primary text-label-lg font-semibold flex items-center justify-center gap-1.5 hover:bg-surface-container transition shrink-0">${tr('Havi csomag választása', 'Alege planul lunar')}</a>
              </div>
              <div class="p-4 rounded-xl border-2 border-secondary bg-secondary-fixed/25 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-label-sm uppercase tracking-wider text-secondary font-bold">${tr('Éves Prémium', 'Premium Anual')}</span>
                    <span class="px-2 py-0.5 rounded-full bg-secondary text-on-secondary text-[10px] font-bold">${tr('LEGJOBB ÁR -33%', 'CEL MAI AVANTAJOS -33%')}</span>
                  </div>
                  <p class="font-serif text-title-lg text-primary mt-0.5">${esc(PLANS[S.lang].yearly.priceLabel)}</p>
                  <p class="text-[12px] text-on-surface-variant">${esc(PLANS[S.lang].yearly.vatNote)}</p>
                </div>
                <a href="#/elofizetes?plan=yearly" class="min-h-[44px] px-4 rounded-xl bg-secondary text-on-secondary text-label-lg font-semibold flex items-center justify-center gap-1.5 shadow-sm hover:opacity-95 active:scale-[0.99] transition shrink-0">${icon('workspace_premium', 'fill text-[18px]')}${tr('Prémium fiók (-33%)', 'Cont Premium (-33%)')}</a>
              </div>
            </div>
          </section>`;

      return (
        brandHeader() +
        `<div class="${PAGE_X} pt-4 sm:pt-6 flex flex-col gap-6 sm:gap-8">
        ${topConversionHero}

        <section class="flex flex-col gap-3">
          <form data-form="search" role="search" class="relative">
            <span class="absolute inset-y-0 left-3.5 flex items-center text-outline pointer-events-none">${icon(
              'search',
              'text-[20px]'
            )}</span>
            <label for="hq" class="sr-only">${tr('Keresés', 'Căutare')}</label>
            <input id="hq" name="q" type="search" placeholder="${tr(
              `Keresés ${list.length} recept vagy alapanyag között...`,
              `Caută printre ${list.length} rețete sau ingrediente...`
            )}" class="w-full h-12 pl-11 pr-12 bg-surface-container-lowest placeholder:text-outline rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
            <a href="#/kereses" aria-label="${tr('Részletes szűrő', 'Filtre detaliate')}" class="absolute inset-y-0 right-0 pr-2.5 flex items-center text-on-surface-variant hover:text-primary"><span class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center">${icon(
              'tune',
              'text-[18px]'
            )}</span></a>
          </form>
          <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            ${chip(tr('Összes recept', 'Toate rețetele'), true, '#/kereses')}${chip(
              tr('Ingyenes', 'Gratuit'),
              false,
              '#/kereses?f=Ingyenes',
              'check_circle'
            )}${chip(tr('Prémium', 'Premium'), false, '#/kereses?f=Prémium', 'workspace_premium')}${chip(
              tr('10 perces', '10 minute'),
              false,
              '#/kereses?f=10 perces',
              'bolt'
            )}${CATEGORIES.map(c =>
              chip(trTag(c.name, S.lang), false, `#/kereses?f=${encodeURIComponent(c.name)}`, c.icon)
            ).join('')}${chip(
              tr('Magas fehérje', 'Proteine ridicate'),
              false,
              '#/kereses?f=Magas fehérje',
              'fitness_center'
            )}${chip(tr('Gluténmentes', 'Fără gluten'), false, '#/kereses?f=Gluténmentes')}
          </div>
        </section>

        ${activeCookBanner()}

        <section class="flex flex-col gap-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="flex items-center gap-1.5 text-label-sm uppercase tracking-wider text-secondary">${icon(
              'workspace_premium',
              'text-[18px]'
            )}${tr('A hét választása', 'Alegerea săptămânii')}</span>
            <span class="text-label-md text-on-surface-variant">${tr('Séf ajánlata', 'Recomandarea chef-ului')}</span>
          </div>
          <article class="relative bg-surface-container-lowest rounded-2xl overflow-hidden shadow-md flex flex-col md:grid md:grid-cols-12 group border border-outline-variant/25">
            <div class="relative w-full h-56 sm:h-72 md:h-full md:min-h-[310px] md:col-span-7 overflow-hidden">
              <a href="#/r/${encodeURIComponent(f.id)}" tabindex="-1"><img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${img(
                f.image
              )}" alt="${esc(f.title)}"></a>
              <div class="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/20 to-transparent pointer-events-none"></div>
              <div class="absolute top-3 left-3 right-14 flex flex-wrap items-center gap-1.5">${accessBadge(
                Boolean(f.is_free),
                subActive,
                S.lang
              )}${ratingPill(f)}</div>
              <div class="absolute top-3 right-3">${favBtn(f.id)}</div>
              <div class="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                <span class="px-2.5 py-0.5 rounded-full bg-secondary text-on-secondary text-label-sm">${tr('Kiemelt recept', 'Rețetă recomandată')}</span>
                ${
                  f.author
                    ? `<span class="text-label-md text-surface-variant flex items-center gap-1 truncate max-w-full">${icon(
                        'person',
                        'text-[16px]'
                      )} ${esc(f.author)}</span>`
                    : ''
                }
              </div>
            </div>
            <div class="p-4 sm:p-6 md:col-span-5 flex flex-col justify-between gap-4">
              <div class="flex flex-col gap-2">
                <a href="#/r/${encodeURIComponent(f.id)}" class="font-serif text-headline-sm sm:text-headline-md text-primary leading-tight hover:underline">${esc(
                  f.title
                )}</a>
                ${f.subtitle ? `<p class="text-body-sm text-secondary italic">${esc(f.subtitle)}</p>` : ''}
              </div>
              <div class="grid grid-cols-3 gap-2 py-2.5 px-2 sm:px-3 bg-surface-container-low rounded-xl text-center">
                ${[
                  ['schedule', 'text-secondary', `${f.prep + f.cook} ${minsWord()}`, tr('Időigény', 'Timp total')],
                  ['local_fire_department', 'text-primary-container', `${f.kcal || '–'} kcal`, tr('Energia', 'Energie')],
                  ['restaurant_menu', 'text-on-tertiary-container', f.difficulty, tr('Nehézség', 'Dificultate')],
                ]
                  .map(
                    ([i, c, v, l]) =>
                      `<div class="flex flex-col items-center min-w-0 px-0.5">${icon(
                        i,
                        c + ' text-[18px]'
                      )}<span class="text-[14px] sm:text-title-md font-semibold mt-0.5 truncate max-w-full">${esc(
                        v
                      )}</span><span class="text-[10px] sm:text-label-sm text-on-surface-variant truncate max-w-full">${l}</span></div>`
                  )
                  .join('')}
              </div>
              <a href="#/r/${encodeURIComponent(f.id)}" class="w-full min-h-[46px] px-4 rounded-xl bg-secondary text-on-secondary text-title-md flex items-center justify-center gap-2 hover:bg-secondary/95 shadow-sm active:scale-[0.99] transition">${tr('Recept megtekintése', 'Vezi rețeta')} ${icon(
                'arrow_forward',
                'text-[20px]'
              )}</a>
            </div>
          </article>
        </section>

        ${categoriesSection(list)}

        <section class="flex flex-col gap-space-sm">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div><h3 class="font-serif text-headline-sm text-primary">${tr('Népszerű a héten', 'Populare săptămâna aceasta')}</h3><p class="text-body-sm text-on-surface-variant">${tr('A gasztroközösség kedvencei', 'Preferatele comunității culinare')}</p></div>
            <a href="#/kereses" class="text-label-md text-secondary hover:underline flex items-center shrink-0">${tr('Összes', 'Toate')} (${
              list.length
            }) ${icon('chevron_right', 'text-[16px]')}</a>
          </div>
          ${grid(popular)}
        </section>

        ${midConversionStrip}

        ${seasonalRow()}

        <section class="relative bg-primary text-on-primary rounded-2xl p-5 sm:p-6 overflow-hidden shadow-md">
          <div class="absolute -right-8 -bottom-8 w-36 h-36 rounded-full bg-primary-container/40 pointer-events-none"></div>
          <div class="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div class="flex flex-col gap-2 max-w-2xl">
              <div class="flex flex-wrap items-center gap-2"><span class="px-2.5 py-0.5 rounded-full bg-secondary text-label-sm uppercase tracking-wider">${tr('Vebeat Prémium', 'Vebeat Premium')}</span><span class="text-label-md text-on-primary-container">${
                subActive ? tr('Aktív tagság', 'Abonament activ') : tr('Teljes hozzáférés', 'Acces complet')
              }</span></div>
              <h4 class="font-serif text-headline-sm sm:text-headline-md leading-tight">${
                subActive
                  ? tr('Köszönjük, hogy a Vebeat Prémium tagja vagy!', 'Îți mulțumim că ești membru Vebeat Premium!')
                  : tr(
                      `Készen állsz? Válts Prémium fiókra és oldd fel mind a ${list.length} receptet!`,
                      `Ești pregătit? Treci la contul Premium și deblochează toate cele ${list.length} rețete!`
                    )
              }</h4>
              <p class="text-body-sm text-surface-variant">${
                subActive
                  ? tr(
                      'Minden prémium recept, pontos grammos hozzávaló, időzítő és Google Keep export korlátlanul elérhető számodra.',
                      'Ai acces nelimitat la toate rețetele premium, ingredientele exacte la gram, cronometre și exportul în Google Keep.'
                    )
                  : tr(
                      `Azonnali hozzáférés a ${premiumCount} prémium recepthez, adagszámítóhoz, séf-időzítőkhöz és bevásárlólistához, biztonságos bankkártyás fizetéssel a Stripe-on keresztül.`,
                      `Acces instant la cele ${premiumCount} rețete premium, calculator de porții, cronometre și listă de cumpărături, cu plată securizată prin Stripe.`
                    )
              }</p>
            </div>
            ${
              subActive
                ? `<button type="button" data-act="portal" class="self-start md:self-center min-h-[44px] px-5 rounded-xl bg-surface-container-lowest text-primary text-title-md flex items-center gap-1.5 shadow-sm active:scale-95 transition shrink-0">${icon(
                    'credit_card',
                    'text-[18px]'
                  )}${tr('Előfizetés kezelése', 'Gestionează abonamentul')}</button>`
                : `<div class="flex flex-wrap items-center gap-2.5 shrink-0">
                    <a href="#/elofizetes" class="min-h-[46px] px-5 rounded-xl bg-secondary text-on-secondary text-title-md font-semibold flex items-center gap-1.5 shadow-md hover:opacity-95 active:scale-95 transition shrink-0">${icon(
                      'workspace_premium',
                      'fill text-[18px]'
                    )}${tr('Váltás Prémium fiókra', 'Treci la cont Premium')}</a>
                  </div>`
            }
          </div>
        </section>
      </div>`
      );
    }

    function seasonalRow(activeQ = '') {
      if (!seasonalItems.length) return '';
      const month = new Date()
        .toLocaleDateString(S.lang === 'ro' ? 'ro-RO' : 'hu-HU', { month: 'long' })
        .replace(/^./, c => c.toUpperCase());
      return `<section class="flex flex-col gap-space-sm">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div><h3 class="font-serif text-headline-sm text-primary flex items-center gap-1.5">${icon(
            'calendar_month',
            'text-[18px]'
          )}${tr('Szezonális Ízek', 'Arome de Sezon')}</h3><p class="text-body-sm text-on-surface-variant">${tr('Frissesség a helyi termelőktől', 'Prospețime de la producători locali')}</p></div>
          <span class="text-label-md px-2.5 py-1 rounded-full bg-surface-container-high shrink-0">${month}</span>
        </div>
        <div class="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory no-scrollbar">
          ${seasonalItems
            .map(
              (s: any) => {
                const on = activeQ && norm(activeQ) === norm(s.q);
                const target = on
                  ? '#/kereses?szezonalis=1'
                  : `#/kereses?szezonalis=1&q=${encodeURIComponent(s.q)}`;
                return `<a href="${target}" class="snap-start min-w-[144px] w-[144px] sm:min-w-[168px] sm:w-[168px] bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm flex flex-col flex-shrink-0 group border ${
                  on ? 'border-secondary ring-2 ring-secondary/40' : 'border-outline-variant/25'
                }">
            <div class="w-full h-24 sm:h-28 overflow-hidden"><img loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 ease-out" src="${img(
              s.image
            )}" alt="${esc(s.name)}"></div>
            <div class="p-2.5 flex flex-col gap-0.5"><span class="text-title-md truncate">${esc(
              s.name
            )}</span><span class="text-label-sm text-secondary truncate">${esc(s.note)}</span>
            <span class="text-body-sm text-on-surface-variant">${
              all().filter(r => match(r, s.q)).length
            } ${tr('recept', 'rețete')}</span></div></a>`;
              }
            )
            .join('')}
        </div>
      </section>`;
    }

    function match(r: any, q: string) {
      if (!q) return true;
      const hay = norm(
        [
          r.title,
          r.subtitle,
          r.description,
          r.short_description,
          ...(r.tags || []),
          ...((r.ingredients || []).map((i: any) => i.name)),
        ].join(' ')
      );
      return norm(q)
        .split(/\s+/)
        .every(w => hay.includes(w));
    }

    function viewSearch({ q }: { q: URLSearchParams }) {
      const query = q.get('q') || '',
        f = q.get('f') || '',
        sez = q.get('szezonalis') === '1';
      const href = (filter: string) =>
        `#/kereses?${new URLSearchParams({
          ...(sez && { szezonalis: '1' }),
          ...(query && { q: query }),
          ...(filter && { f: filter }),
        })}`;
      return (
        titleHeader(
          sez
            ? tr('Szezonális ízek', 'Arome de sezon')
            : f
              ? `${tr('Kategória', 'Categorie')}: ${trTag(f, S.lang)}`
              : tr('Kategóriák & keresés', 'Categorii & Căutare')
        ) +
        `<div class="${PAGE_X} pt-4 flex flex-col gap-space-md">
        ${sez ? seasonalRow(query) : ''}
        <form data-form="search" role="search" class="relative">
          <span class="absolute inset-y-0 left-3.5 flex items-center text-outline pointer-events-none">${icon(
            'search',
            'text-[20px]'
          )}</span>
          <label for="sq" class="sr-only">${tr('Keresés', 'Căutare')}</label>
          <input id="sq" name="q" type="search" value="${esc(query)}" data-filter="${esc(
            f
          )}" data-sez="${
            sez ? '1' : ''
          }" placeholder="${tr('Receptnév, alapanyag, kategória...', 'Nume rețetă, ingredient, categorie...')}" class="w-full h-12 pl-11 pr-4 bg-surface-container-lowest placeholder:text-outline rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
        </form>
        <div id="filterchips" class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          ${chip(tr('Összes', 'Toate'), !f, href(''))}${Object.keys(FILTERS)
            .map(k => chip(trTag(k, S.lang), f === k, href(f === k ? '' : k)))
            .join('')}
        </div>
        ${
          !sez && !query
            ? `<details class="bg-surface-container-low rounded-xl p-3 sm:p-4 border border-outline-variant/30"${
                !f ? ' open' : ''
              }>
          <summary class="cursor-pointer font-serif text-title-md text-primary flex items-center justify-between list-none">
            <span class="flex items-center gap-1.5">${icon(
              'grid_view',
              'text-secondary text-[18px]'
            )}${tr(`Böngészés kategóriák szerint (${CATEGORIES.length} kategória)`, `Răsfoiește după categorii (${CATEGORIES.length} categorii)`)}</span>
            ${icon('expand_more', 'text-on-surface-variant text-[18px]')}
          </summary>
          <div class="pt-3">${categoriesSection(all(), f)}</div>
        </details>`
            : ''
        }
        <div id="results">${results(query, f, sez)}</div>
      </div>`
      );
    }

    function results(query: string, f: string, sez = false) {
      const list = all().filter(r => {
        const qOk = query
          ? match(r, query)
          : sez && seasonalItems.length
            ? seasonalItems.some((s: any) => match(r, s.q))
            : true;
        return qOk && (!FILTERS[f] || FILTERS[f](r));
      });
      const clearHref = `#/kereses?${new URLSearchParams({
        ...(sez && { szezonalis: '1' }),
        ...(query && { q: query }),
      })}`;
      return (
        `<div class="flex items-center justify-between mb-2">
        <p class="text-body-sm text-on-surface-variant">${
          sez && !query
            ? `<strong class="text-secondary">${tr('Szezonális válogatás', 'Selecție de sezon')}</strong> • `
            : ''
        }${f ? `<strong class="text-primary">${esc(trTag(f, S.lang))}</strong> • ` : ''}${list.length} ${tr(
          'recept',
          'rețete'
        )}</p>
        <div class="flex items-center gap-2">
          ${
            f
              ? `<a href="${clearHref}" class="text-label-sm text-secondary hover:underline">${tr('Szűrő törlése ×', 'Șterge filtrul ×')}</a>`
              : ''
          }
          ${
            sez
              ? `<a href="#/kereses" class="text-label-sm text-primary hover:underline">${tr('Minden recept →', 'Toate rețetele →')}</a>`
              : ''
          }
        </div>
      </div>` + grid(list)
      );
    }

    /* ---------- Paywall Overlay Component for Locked Recipes ---------- */
    function paywallSection(r: any) {
      const signedIn = isUserSignedIn();
      const ingCount = r.ingredient_count || 6;
      const stepCount = r.step_count || 3;

      return `<section id="paywall-section" class="relative rounded-2xl overflow-hidden border border-secondary/30 shadow-lg bg-surface-container-lowest">
        <!-- Teaser & Blurred Preview Background -->
        <div class="p-4 pb-2 flex flex-col gap-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-label-sm uppercase tracking-wider whitespace-nowrap">${icon(
              'lock',
              'fill text-[14px] text-secondary'
            )}${tr('Prémium Recept Előnézet', 'Previzualizare Rețetă Premium')}</span>
            <span class="text-label-sm text-on-surface-variant whitespace-nowrap">${ingCount} ${tr('hozzávaló', 'ingrediente')} • ${stepCount} ${tr('lépés', 'pași')}</span>
          </div>
          <div class="bg-surface-container-low rounded-xl p-3.5 border-l-4 border-secondary">
            <p class="text-label-sm uppercase tracking-wider text-secondary mb-1">${tr('Ízelítő az 1. lépésből', 'Avanpremieră din Pasul 1')}</p>
            <p class="text-body-md text-primary italic">„${esc(
              r.teaser || r.short_description
            )}”</p>
          </div>
        </div>

        <!-- Blurred Placeholder Rows + Smooth Gradient Overlay -->
        <div class="relative px-4 pt-2 pb-6">
          <div class="select-none pointer-events-none filter blur-[5px] opacity-55 flex flex-col gap-2.5" aria-hidden="true">
            <div class="p-3.5 rounded-lg bg-surface-container-low flex justify-between"><span>• ${tr('Prémium alapanyag pontos adagolással', 'Ingredient premium cu dozaj exact')}</span><span>180 g</span></div>
            <div class="p-3.5 rounded-lg bg-surface-container-low flex justify-between"><span>• ${tr('Második válogatott összetevő', 'Al doilea ingredient selecționat')}</span><span>120 g</span></div>
            <div class="p-3.5 rounded-lg bg-surface-container-low flex justify-between"><span>• ${tr('Séf fűszerkeverék és öntet', 'Condimentele chef-ului și sosul')}</span><span>45 ml</span></div>
            <div class="p-4 rounded-xl bg-surface-container-high mt-2">
              <p class="font-bold">${tr('2. Lépés: Hőkezelés és textúra beállítása', 'Pasul 2: Tratament termic și textură')}</p>
              <p class="text-body-sm mt-1">${tr('A pontos sütési idő, hőfok és a Séf Mesterfogása előfizetéssel válik láthatóvá...', 'Timpul exact de gătire, temperatura și Secretul Bucătarului devin vizibile cu abonament...')}</p>
            </div>
          </div>

          <!-- Gradient Blur Paywall CTA Card -->
          <div class="relative -mt-36 pt-16 bg-gradient-to-b from-surface-container-lowest/10 via-surface-container-lowest/95 to-surface-container-lowest flex flex-col items-center text-center px-3 pb-2">
            <div class="w-full bg-primary text-on-primary rounded-2xl p-5 shadow-xl border border-secondary/40 flex flex-col items-center gap-3">
              <span class="w-12 h-12 rounded-full bg-secondary text-on-secondary flex items-center justify-center shadow-md">${icon(
                'workspace_premium',
                'fill text-[26px]'
              )}</span>
              <div>
                <span class="text-label-sm uppercase tracking-widest text-secondary-fixed">${tr('Vebeat Prémium', 'Vebeat Premium')}</span>
                <h3 class="font-serif text-headline-sm text-on-primary mt-0.5">${tr('Oldd fel a teljes receptet és a Főzési Módot!', 'Deblochează rețeta completă și Modul de Gătit!')}</h3>
                <p class="text-body-sm text-on-primary-container mt-1">${tr(
                  `Hozzáférés mind a ${ingCount} grammra kimért hozzávalóhoz, a ${stepCount} lépéses interaktív főzési útmutatóhoz, a séf-időzítőkhöz és a Google Keep exporthoz.`,
                  `Acces la toate cele ${ingCount} ingrediente cântărite la gram, ghidul interactiv în ${stepCount} pași, cronometrele de chef și exportul în Google Keep.`
                )}</p>
              </div>

              <!-- Plan Selector (with localized VAT-inclusive pricing) -->
              <div class="w-full grid grid-cols-2 gap-2 bg-primary-container p-1.5 rounded-xl">
                <button type="button" data-act="plan" data-plan="monthly" class="py-2 px-2 rounded-lg text-center transition ${
                  selectedPlan === 'monthly'
                    ? 'bg-surface-container-lowest text-primary shadow-sm font-bold'
                    : 'text-on-primary-container'
                }">
                  <span class="block text-label-md">${tr('Havi tagság', 'Abonament lunar')}</span>
                  <span class="block text-title-md">${esc(PLANS[S.lang].monthly.priceLabel)}</span>
                </button>
                <button type="button" data-act="plan" data-plan="yearly" class="py-2 px-2 rounded-lg text-center transition ${
                  selectedPlan === 'yearly'
                    ? 'bg-surface-container-lowest text-primary shadow-sm font-bold'
                    : 'text-on-primary-container'
                }">
                  <span class="block text-label-md">${tr('Éves (-33%)', 'Anual (-33%)')}</span>
                  <span class="block text-title-md">${esc(PLANS[S.lang].yearly.priceLabel)}</span>
                </button>
              </div>
              <p class="text-[11px] text-on-primary-container">${esc(PLANS[S.lang][selectedPlan].vatNote)}</p>

              <!-- Mandatory Pre-Contractual Consents (OUG 34/2014 art. 16 lit. m + Legea 365/2002) -->
              <div class="w-full rounded-xl bg-primary-container/60 p-3 flex flex-col gap-2 text-left text-[11px] text-surface-variant border border-on-primary/15">
                <label class="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" data-consent="terms" ${subConsentTerms ? 'checked' : ''} class="mt-0.5 accent-secondary shrink-0">
                  <span>${tr(
                    'Elfogadom az <a href="#/jogi/aszf" class="underline text-secondary-fixed">ÁSZF</a>-et és az <a href="#/jogi/adatvedelem" class="underline text-secondary-fixed">Adatvédelmi (GDPR)</a> tájékoztatót.',
                    'Accept <a href="#/jogi/aszf" class="underline text-secondary-fixed">Termenii și Condițiile</a> și <a href="#/jogi/adatvedelem" class="underline text-secondary-fixed">Politica GDPR</a>.'
                  )}</span>
                </label>
                <label class="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" data-consent="waiver" ${subConsentWaiver ? 'checked' : ''} class="mt-0.5 accent-secondary shrink-0">
                  <span>${tr(
                    'Kérem a digitális receptek azonnali feloldását és tudomásul veszem az OUG 34/2014 16. cikk m) szerinti elállási szabályokat.',
                    'Solicit acces digital imediat și confirm că am luat cunoștință de excepția dreptului de retragere (OUG 34/2014 art. 16 lit. m)).'
                  )}</span>
                </label>
              </div>

              <button type="button" data-act="subscribe" data-slug="${esc(
                r.id
              )}" class="w-full min-h-[50px] px-4 py-2.5 rounded-xl bg-secondary text-on-secondary text-[14px] sm:text-title-md font-semibold flex items-center justify-center gap-2 text-center leading-snug shadow-md hover:opacity-95 active:scale-[0.98] transition">
                ${icon('lock_open', 'text-[20px] shrink-0')}
                <span>${
                  signedIn
                    ? tr('Előfizetés indítása (Stripe Checkout)', 'Pornește abonamentul (Stripe Checkout)')
                    : tr('Belépés & Prémium feloldása', 'Autentificare & Deblocare Premium')
                }</span>
              </button>

              <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-label-sm">
                <a href="#/elofizetes?return=${encodeURIComponent(
                  r.id
                )}" class="text-secondary-fixed hover:underline">${tr('Csomagok & jogi részletek →', 'Detalii abonament & legislație →')}</a>
                ${
                  !signedIn
                    ? `<a href="#/belepes?return=${encodeURIComponent(
                        r.id
                      )}" class="text-on-primary-container hover:underline">${tr('Már tag vagy? Belépés', 'Ai deja cont? Autentificare')}</a>`
                    : ''
                }
              </div>

              ${
                signedIn
                  ? `<span class="text-label-sm text-on-primary-container flex items-center gap-1">${icon(
                      'verified_user',
                      'text-[14px] text-secondary-fixed'
                    )}${tr('Bejelentkezve:', 'Conectat:')} ${esc(
                      activeUserName()
                    )} • ${tr('Bármikor lemondható 1 kattintással', 'Anulare oricând cu 1 click')}</span>`
                  : ''
              }
            </div>
          </div>
        </div>
      </section>`;
    }

    function viewSubscription({ q }: { q: URLSearchParams }) {
      const signedIn = isUserSignedIn();
      const returnSlug = q.get('return') || '';
      const curRouteKey = location.hash || '#/elofizetes';
      const qp = q.get('plan');
      if (curRouteKey !== lastSubPlanRouteKey) {
        lastSubPlanRouteKey = curRouteKey;
        if (qp === 'yearly' || qp === 'monthly') selectedPlan = qp;
      }
      const list = all();
      const freeCount = list.filter((r: any) => Boolean(r.is_free || r.mine)).length;
      const premiumCount = list.length - freeCount;
      const pInfo = PLANS[S.lang][selectedPlan];

      return (
        titleHeader(tr('Vebeat Prémium Előfizetés', 'Abonament Vebeat Premium')) +
        `<div class="${NARROW_X} pt-4 pb-6 flex flex-col gap-5">
          <section class="rounded-2xl bg-primary text-on-primary p-5 shadow-lg flex flex-col gap-3">
            <div class="flex items-center justify-between gap-2">
              <span class="px-2.5 py-0.5 rounded-full bg-secondary text-on-secondary text-label-sm uppercase tracking-wider">${tr('Teljes hozzáférés', 'Acces complet')}</span>
              ${
                hasSub()
                  ? `<span class="px-2.5 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed text-label-sm font-bold">${tr('AKTÍV', 'ACTIV')}</span>`
                  : ''
              }
            </div>
            <h2 class="font-serif text-headline-md leading-tight">${tr(
              `Mind a ${list.length} séf-recept és a Főzési Mód`,
              `Toate cele ${list.length} rețete de chef & Modul de Gătit`
            )}</h2>
            <p class="text-body-sm text-on-primary-container">${tr(
              `A ${freeCount} ingyenes recepten túl feloldja mind a ${premiumCount} prémium receptet (tradicionális, böjti, nemzetközi és 10 perces fogások), pontos adagolással, lépésenkénti időzítőkkel és Google Keep exporttal.`,
              `Pe lângă cele ${freeCount} rețete gratuite, deblochezi toate cele ${premiumCount} rețete premium (tradiționale, de post, internaționale și gata în 10 min), cantități exacte și cronometre.`
            )}</p>
          </section>

          ${
            hasSub()
              ? `<section class="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/40 flex flex-col gap-3">
                  <p class="text-title-md text-primary">${tr('Már rendelkezel aktív Vebeat Prémium előfizetéssel.', 'Ai deja un abonament Vebeat Premium activ.')}</p>
                  <div class="flex flex-col sm:flex-row gap-2.5">
                    <button type="button" data-act="portal" class="w-full sm:flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-primary text-on-primary text-[14px] sm:text-title-md font-semibold flex items-center justify-center gap-2 text-center leading-snug">${icon('manage_accounts', 'text-[20px] shrink-0')}<span>${tr('Előfizetés kezelése (Stripe)', 'Gestionează abonamentul (Stripe)')}</span></button>
                    ${
                      returnSlug && returnSlug !== 'elofizetes'
                        ? `<a href="#/r/${encodeURIComponent(returnSlug)}" class="w-full sm:w-auto min-h-[46px] px-4 py-2.5 rounded-xl bg-secondary text-on-secondary text-[14px] sm:text-title-md font-semibold flex items-center justify-center shrink-0">${tr('Vissza a recepthez', 'Înapoi la rețetă')}</a>`
                        : ''
                    }
                  </div>
                </section>`
              : `<section class="bg-surface-container-lowest rounded-2xl p-4 shadow-md border border-outline-variant/40 flex flex-col gap-4">
                  <h3 class="font-serif text-title-lg text-primary">${tr('1. Válassz csomagot (ÁFA-val)', '1. Alege planul (TVA inclus)')}</h3>
                  <div class="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2.5">
                    <button type="button" data-act="plan" data-plan="monthly" aria-pressed="${selectedPlan === 'monthly'}" class="min-h-[84px] p-3.5 sm:p-4 rounded-xl border text-left transition-transform duration-150 active:scale-[0.98] ${
                      selectedPlan === 'monthly'
                        ? 'border-secondary bg-secondary-fixed/40 ring-2 ring-secondary/40'
                        : 'border-outline-variant/50 bg-surface-container-low'
                    }">
                      <span class="block text-label-sm uppercase text-secondary">${tr('Havi', 'Lunar')}</span>
                      <span class="block font-serif text-title-lg text-primary mt-0.5">${esc(PLANS[S.lang].monthly.priceLabel)}</span>
                      <span class="block text-[11px] text-on-surface-variant mt-1">${tr('Bármikor lemondható', 'Anulare oricând')}</span>
                    </button>
                    <button type="button" data-act="plan" data-plan="yearly" aria-pressed="${selectedPlan === 'yearly'}" class="min-h-[84px] p-3.5 sm:p-4 rounded-xl border text-left transition-transform duration-150 active:scale-[0.98] ${
                      selectedPlan === 'yearly'
                        ? 'border-secondary bg-secondary-fixed/40 ring-2 ring-secondary/40'
                        : 'border-outline-variant/50 bg-surface-container-low'
                    }">
                      <span class="inline-block px-1.5 py-0.5 rounded bg-secondary text-on-secondary text-[10px] font-bold mb-0.5">-33%</span>
                      <span class="block text-label-sm uppercase text-secondary">${tr('Éves', 'Anual')}</span>
                      <span class="block font-serif text-title-lg text-primary mt-0.5">${esc(PLANS[S.lang].yearly.priceLabel)}</span>
                      <span class="block text-[11px] text-on-surface-variant mt-1">${tr('Legjobb ár', 'Cel mai avantajos')}</span>
                    </button>
                  </div>
                  <div class="rounded-xl bg-surface-container-low p-3 text-body-sm text-primary border border-outline-variant/30">
                    <p class="font-semibold">${tr('Összesítés:', 'Sumar comandă:') } ${esc(pInfo.priceLabel)}</p>
                    <p class="text-[12px] text-on-surface-variant mt-0.5">${esc(pInfo.vatNote)}</p>
                  </div>

                  <div class="flex flex-col gap-2.5 text-[12px] text-on-surface-variant bg-surface-container-low/70 p-3.5 rounded-xl border border-outline-variant/40">
                    <p class="text-label-sm uppercase tracking-wider text-primary">${tr('2. Törvényes nyilatkozatok (OUG 34/2014 & GDPR)', '2. Consimțământ precontractual obligatoriu (OUG 34/2014 & GDPR)')}</p>
                    <label class="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" data-consent="terms" ${subConsentTerms ? 'checked' : ''} class="mt-0.5 accent-secondary shrink-0">
                      <span>${tr(
                        'Elolvastam és elfogadom az <a href="#/jogi/aszf" class="underline text-primary font-semibold">ÁSZF</a>-et, az <a href="#/jogi/adatvedelem" class="underline text-primary font-semibold">Adatvédelmi tájékoztatót</a> és a <a href="#/jogi/kapcsolat" class="underline text-primary font-semibold">Szolgáltatói adatokat</a>.',
                        'Am citit și accept <a href="#/jogi/aszf" class="underline text-primary font-semibold">Termenii și Condițiile</a>, <a href="#/jogi/adatvedelem" class="underline text-primary font-semibold">Politica GDPR</a> și <a href="#/jogi/kapcsolat" class="underline text-primary font-semibold">Datele Operatorului</a>.'
                      )}</span>
                    </label>
                    <label class="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" data-consent="waiver" ${subConsentWaiver ? 'checked' : ''} class="mt-0.5 accent-secondary shrink-0">
                      <span>${tr(
                        'Kifejezetten kérem a digitális tartalom azonnali biztosítását, és tudomásul veszem, hogy az azonnali hozzáférés megkezdésével elveszítem az OUG 34/2014 16. cikk m) szerinti 14 napos elállási jogot (a jövőbeni megújulás bármikor lemondható).',
                        'Solicit expres începerea imediată a accesului digital și confirm că am luat cunoștință că odată cu activarea accesului îmi pierd dreptul de retragere de 14 zile (OUG 34/2014 art. 16 lit. m)). Reînnoirea poate fi anulată oricând.'
                      )}</span>
                    </label>
                  </div>

                  <button type="button" data-act="subscribe" data-slug="${esc(
                    returnSlug || 'elofizetes'
                  )}" class="w-full min-h-[50px] px-4 py-2.5 rounded-xl bg-secondary text-on-secondary text-[14px] sm:text-title-md font-semibold flex items-center justify-center gap-2 text-center leading-snug shadow-md hover:opacity-95 active:scale-[0.98] transition">
                    ${icon('lock_open', 'text-[20px] shrink-0')}
                    <span>${
                      signedIn
                        ? tr('Tovább a biztonságos fizetéshez (Stripe)', 'Continuă la plata securizată (Stripe)')
                        : tr('Belépés & Előfizetés folytatása', 'Autentificare & Continuare abonament')
                    }</span>
                  </button>
                  <p class="text-[11px] text-center text-on-surface-variant">${tr(
                    'Bankkártyás fizetés a Stripe-on keresztül • <a href="#/jogi/elallas" class="underline">Online elállási & lemondási tájékoztató</a>',
                    'Plată securizată prin Stripe • <a href="#/jogi/elallas" class="underline">Drept de retragere & Anulare online</a>'
                  )}</p>
                </section>`
          }
        </div>`
      );
    }

    function viewRecipe(r: any) {
      const isLocked = Boolean(r.locked && !r.is_free && !hasSub());
      const n = servingsOf(r),
        checked = S.checked[r.id] || [],
        note = S.notes[r.id] || '';
      const totalSteps = r.steps?.length || r.step_count || 3;
      const prog = S.progress[r.id]?.step || 0,
        hasProg = !isLocked && prog >= 1 && prog <= totalSteps,
        startStep = hasProg ? prog : 1;

      return (
        brandHeader() +
        `<div class="${PAGE_X} pt-3.5 pb-6 flex flex-col gap-5 sm:gap-6">
        <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-outline-variant/25 no-print">
          <button type="button" data-act="back" class="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container border border-outline-variant/40 text-primary text-label-md font-semibold shadow-sm active:scale-95 transition">
            ${icon('arrow_back', 'text-[18px]')}
            <span>${tr('Vissza', 'Înapoi')}</span>
          </button>
          <div class="flex items-center gap-1.5">
            ${
              r.mine
                ? `<a href="#/szerk/${encodeURIComponent(
                    r.id
                  )}" aria-label="${tr('Szerkesztés', 'Editare')}" class="w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-primary">${icon(
                    'edit',
                    'text-[18px]'
                  )}</a>
            <button type="button" data-act="del" data-id="${esc(
              r.id
            )}" aria-label="${tr('Törlés', 'Șterge')}" class="w-9 h-9 rounded-full bg-surface-container-low hover:bg-error-container flex items-center justify-center text-error">${icon(
                    'delete',
                    'text-[18px]'
                  )}</button>`
                : ''
            }
            <button type="button" data-act="share" aria-label="${tr('Recept megosztása', 'Distribuie rețeta')}" class="w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-primary active:scale-90 transition">${icon(
              'share',
              'text-[18px]'
            )}</button>
            <button type="button" data-act="print" aria-label="${tr('Recept nyomtatása', 'Printează rețeta')}" class="w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-primary active:scale-90 transition">${icon(
              'print',
              'text-[18px]'
            )}</button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 lg:items-start">
          <div class="lg:col-span-5 flex flex-col gap-4 lg:sticky lg:top-20">
            <div class="relative rounded-2xl overflow-hidden shadow-md bg-surface-container-low aspect-[4/3]">
              <img class="w-full h-full object-cover" src="${img(r.image)}" alt="${esc(r.title)}">
              <div class="absolute inset-x-0 top-0 bg-gradient-to-b from-black/25 to-transparent flex items-start justify-between gap-2 p-3 sm:p-4">
                <div class="flex flex-wrap gap-1.5 items-center">${accessBadge(
                  Boolean(r.is_free || r.mine),
                  hasSub(),
                  S.lang
                )}</div>
                ${favBtn(r.id, 'w-10 h-10 shrink-0')}
              </div>
            </div>

            <section class="flex items-center justify-between gap-3 p-3.5 bg-surface-container-low rounded-xl shadow-sm">
              <div class="flex items-center gap-3 min-w-0">
                <span class="w-11 h-11 rounded-full bg-primary text-on-primary flex items-center justify-center font-serif shrink-0">${esc(
                  (r.author || 'V')[0]
                )}</span>
                <div class="min-w-0">
                  <p class="text-title-md flex items-center gap-1 truncate">${esc(
                    r.author || 'Vebeat'
                  )}${icon('verified', 'fill text-primary text-[16px] shrink-0')}</p>
                  <p class="text-body-sm text-on-surface-variant truncate">${
                    r.mine
                      ? tr('Saját recept', 'Rețetă proprie')
                      : tr('Kreatív séf • Vebeat', 'Chef creativ • Vebeat')
                  }</p>
                </div>
              </div>
              <span class="text-label-sm px-2.5 py-1 rounded-full bg-surface-container-highest text-primary shrink-0">${esc(
                r.difficulty || tr('Könnyű', 'Ușor')
              )}</span>
            </section>

            ${
              r.nutrition?.length
                ? `<section class="bg-surface-container-low rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <div class="flex flex-wrap items-center justify-between gap-2"><h3 class="text-title-md text-primary flex items-center gap-2">${icon(
                'nutrition',
                'text-primary text-[20px]'
              )}${tr('Tápérték adagonként', 'Valori nutriționale / porție')}</h3><span class="text-label-md px-2.5 py-1 rounded-full bg-surface-container-highest text-primary">${
                    r.kcal
                  } ${tr('kcal / adag', 'kcal / porție')}</span></div>
              ${r.nutrition
                .map(([k, v]: [string, string], idx: number) => {
                  const pct =
                    parseInt((v.match(/\((\d+)%\)/) || [])[1], 10) || [45, 55, 35][idx % 3];
                  const bar = ['bg-primary-container', 'bg-tertiary', 'bg-secondary-container'][
                    idx % 3
                  ];
                  return `<div><div class="flex justify-between gap-2 text-body-sm mb-1"><span class="font-medium">${esc(
                    k
                  )}</span><span class="text-primary font-bold">${esc(
                    v
                  )}</span></div><div class="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden"><div class="h-full ${bar} rounded-full" style="width:${pct}%"></div></div></div>`;
                })
                .join('')}
            </section>`
                : ''
            }
          </div>

          <div class="lg:col-span-7 flex flex-col gap-5 sm:gap-6">
            <section class="flex flex-col gap-2.5">
              ${
                r.rating
                  ? `<div class="flex items-center gap-1.5"><span class="flex text-secondary">${icon(
                      'star',
                      'fill text-[16px]'
                    ).repeat(
                      5
                    )}</span><span class="text-label-md text-on-surface-variant font-medium">${
                      r.rating
                    } (${r.reviews} ${tr('értékelés', 'evaluări')})</span></div>`
                  : ''
              }
              <h1 class="font-serif text-headline-md sm:text-display-hero-mobile text-primary leading-tight">${esc(
                r.title
              )}</h1>
              ${
                r.subtitle
                  ? `<p class="font-serif italic text-title-md sm:text-title-lg font-normal text-secondary">${esc(
                      r.subtitle
                    )}</p>`
                  : ''
              }
              ${
                r.description || r.short_description
                  ? `<p class="text-body-md text-on-surface-variant leading-relaxed">${esc(
                      r.description || r.short_description
                    )}</p>`
                  : ''
              }
              ${
                r.tags?.length
                  ? `<div class="flex flex-wrap gap-1.5 pt-1">${(r.tags || [])
                      .map((tg: string) => tagLinkPill(tg, S.lang))
                      .join('')}</div>`
                  : ''
              }
            </section>

            <div class="grid grid-cols-2 min-[400px]:grid-cols-4 gap-2.5 text-center">
              ${[
                ['nest_clock_farsight_analog', 'text-primary', tr('ELŐKÉSZ.', 'PREGĂTIRE'), `${r.prep} ${minLabel()}`],
                ['skillet', 'text-secondary', tr('FŐZÉS', 'GĂTIRE'), `${r.cook} ${minLabel()}`],
                ['timer', 'text-primary', tr('ÖSSZES', 'TOTAL'), `${r.prep + r.cook} ${minLabel()}`],
                ['local_fire_department', 'text-secondary-container', tr('ENERGIA', 'ENERGIE'), `${r.kcal || '–'} kcal`],
              ]
                .map(
                  ([ic, c, l, v]) =>
                    `<div class="p-3 rounded-xl bg-surface-container-low shadow-sm flex flex-col items-center min-w-0">${icon(
                      ic,
                      c + ' text-[20px] mb-1'
                    )}<span class="text-[10px] sm:text-label-sm text-on-surface-variant truncate max-w-full">${l}</span><span class="text-title-md mt-0.5 truncate max-w-full">${v}</span></div>`
                )
                .join('')}
            </div>

        ${
          isLocked
            ? paywallSection(r)
            : `
          ${
            hasProg
              ? `<section class="bg-primary text-on-primary rounded-xl p-3.5 flex flex-col gap-2 shadow-md no-print">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="flex items-center gap-1.5 text-label-sm uppercase tracking-wider text-secondary-fixed">${icon(
                'bookmark_added',
                'text-[18px]'
              )}${tr(`Mentett főzési állapot (${prog}/${r.steps.length}. lépés)`, `Progres salvat (pasul ${prog}/${r.steps.length})`)}</span>
              <button type="button" data-act="resetprog" data-id="${esc(
                r.id
              )}" class="text-label-sm text-on-primary-container hover:text-on-primary underline">${tr('Elölről kezdés', 'De la început')}</button>
            </div>
            <p class="text-body-sm text-surface-variant">${tr('Legutóbb itt hagytad abba:', 'Ai rămas ultima dată la:')} <strong class="text-on-primary">${prog}. ${esc(
                  r.steps[prog - 1]?.title || tr('lépés', 'pas')
                )}</strong></p>
          </section>`
              : ''
          }

          <div class="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2.5 no-print">
            <a href="#/fozes/${encodeURIComponent(
              r.id
            )}/${startStep}" data-replace class="min-h-[48px] px-4 rounded-xl bg-secondary text-on-secondary text-title-md flex items-center justify-center gap-2 shadow-md active:scale-[0.99]">${icon(
                'play_circle',
                'fill text-[20px]'
              )}${hasProg ? `${tr('Folytatás', 'Continuă')} (${prog}/${r.steps.length})` : tr('Főzés indítása', 'Începe gătitul')}</a>
            <a href="#ing" data-act="scroll" data-target="ing" class="min-h-[48px] px-4 rounded-xl bg-surface-container-highest text-primary text-title-md flex items-center justify-center gap-2 shadow-sm">${icon(
              'format_list_bulleted',
              'text-[20px]'
            )}${tr('Hozzávalók', 'Ingrediente')}</a>
          </div>

          <section id="ing" class="bg-surface-container-lowest rounded-xl shadow-sm p-4 sm:p-5 flex flex-col gap-3 scroll-mt-20">
            <div class="flex flex-wrap items-center justify-between gap-2.5">
              <div><h3 class="font-serif text-headline-sm text-primary">${tr('Hozzávalók', 'Ingrediente')}</h3><p class="text-body-sm text-on-surface-variant">${tr('Érintsd meg a hozzávalót a pipáláshoz', 'Atinge un ingredient pentru a-l bifa')}</p></div>
              <div class="flex items-center gap-1.5 bg-surface-container-high px-2 py-1.5 rounded-full shrink-0" role="group" aria-label="${tr('Adagok száma', 'Număr de porții')}">
                <button data-act="srv" data-d="-1" aria-label="${tr('Adag csökkentése', 'Scade porțiile')}" class="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-primary shadow-sm active:scale-90 disabled:opacity-40" ${
                  n <= 1 ? 'disabled' : ''
                }>${icon('remove', 'text-[18px]')}</button>
                <span class="text-title-md text-primary min-w-[62px] text-center" aria-live="polite">${n} ${srvWord()}</span>
                <button data-act="srv" data-d="1" aria-label="${tr('Adag növelése', 'Crește porțiile')}" class="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-primary shadow-sm active:scale-90 disabled:opacity-40" ${
                  n >= 24 ? 'disabled' : ''
                }>${icon('add', 'text-[18px]')}</button>
              </div>
            </div>
            <ul class="flex flex-col gap-2">
              ${(r.ingredients || [])
                .map((ing: any, i: number) => {
                  const c = checked.includes(i);
                  return `<li>
                <button role="checkbox" aria-checked="${c}" data-act="check" data-i="${i}" class="w-full flex items-center justify-between gap-3 p-3.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-left min-h-[52px]">
                  <span class="flex items-center gap-3.5 min-w-0">
                    <span class="w-5 h-5 flex-shrink-0 rounded-[6px] flex items-center justify-center ${
                      c
                        ? 'bg-primary text-on-primary'
                        : 'border-[1.5px] border-outline bg-surface-container-lowest'
                    }">${c ? icon('check', 'text-[16px]') : ''}</span>
                    <span class="font-medium ${c ? 'line-through opacity-50' : ''}">${esc(
                      ing.name
                    )}</span>
                  </span>
                  <span class="text-title-md text-primary shrink-0 pl-2">${amount(ing, r)}</span>
                </button></li>`;
                })
                .join('')}
            </ul>
            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-1 no-print">
              <button type="button" id="shop-add-btn" data-act="shop" ${
                checked.length >= (r.ingredients || []).length && (r.ingredients || []).length > 0
                  ? 'disabled'
                  : ''
              } class="flex-1 min-h-[48px] px-4 rounded-xl bg-primary hover:bg-primary-container disabled:opacity-50 text-on-primary text-[14px] sm:text-title-md font-semibold flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-[transform,opacity,background-color] duration-200">${icon(
                checked.length >= (r.ingredients || []).length && (r.ingredients || []).length > 0
                  ? 'done_all'
                  : 'add_shopping_cart',
                'text-[20px] shrink-0'
              )}<span>${
                checked.length >= (r.ingredients || []).length && (r.ingredients || []).length > 0
                  ? tr('Minden hozzávaló kipipálva', 'Toate ingredientele sunt bifate')
                  : checked.length
                    ? tr(
                        `Hiányzók a bevásárlólistához (${Math.max(0, (r.ingredients || []).length - checked.length)})`,
                        `Adaugă lipsă pe listă (${Math.max(0, (r.ingredients || []).length - checked.length)})`
                      )
                    : tr(
                        `Összes hozzávaló a bevásárlólistához (${(r.ingredients || []).length})`,
                        `Toate pe lista de cumpărături (${(r.ingredients || []).length})`
                      )
              }</span></button>
              <button type="button" data-act="open-shop" class="min-h-[48px] px-4 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/45 text-primary text-label-md sm:text-title-md font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition shrink-0">
                ${icon('shopping_bag', 'text-[18px] text-secondary shrink-0')}
                <span>${tr('Lista', 'Listă')}</span>
                <span data-shop-badge class="${
                  S.shopping.filter(it => !it.checked).length > 0 ? 'inline-flex' : 'hidden'
                } min-w-[20px] h-5 px-1.5 rounded-full bg-secondary text-on-secondary text-[11px] font-bold items-center justify-center leading-none">${
                  S.shopping.filter(it => !it.checked).length
                }</span>
              </button>
            </div>
          </section>

          <section id="prep-steps" class="flex flex-col gap-3 scroll-mt-20">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div><h3 class="font-serif text-headline-sm text-primary">${tr('Elkészítés lépésről lépésre', 'Mod de preparare pas cu pas')}</h3><p class="text-body-sm text-on-surface-variant">${tr('Kövesd a séf bevált módszerét a tökéletes végeredményért', 'Urmează metoda verificată a chef-ului pentru un rezultat perfect')}</p></div>
              <span class="px-3 py-1 rounded-full bg-primary-fixed text-primary text-label-sm whitespace-nowrap">${
                (r.steps || []).length
              } ${tr('LÉPÉS', 'PAȘI')}</span>
            </div>
            ${(r.steps || []).map((s: any, i: number) => stepCard(r, s, i, prog)).join('')}
          </section>

          ${tipBox(r)}
        `
        }

            <section class="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col gap-2 no-print">
              <label for="rnote" class="font-serif text-headline-sm text-primary flex items-center gap-2">${icon(
                'edit_note',
                'text-secondary text-[22px]'
              )}${tr('Saját konyhai jegyzet', 'Notițele mele de bucătărie')}</label>
              <textarea id="rnote" rows="2" maxlength="500" placeholder="${tr('Mit változtattál? Hány perc lett a saját sütődben?', 'Ce ai modificat? Câte minute a durat în cuptorul tău?')}" class="w-full bg-surface-container-low rounded-lg p-3 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/20">${esc(
                note
              )}</textarea>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <a href="#/profil?t=jegyzetek" class="text-label-sm text-secondary hover:underline">${tr('Megjelenik a Profil → Jegyzetek fülön', 'Apare în Profil → Notițe')}</a>
                <button data-act="savenote" data-id="${esc(
                  r.id
                )}" class="min-h-[38px] px-3.5 rounded-lg bg-primary text-on-primary text-label-md flex items-center gap-1">${icon(
              'check',
              'text-[16px]'
            )}${tr('Jegyzet mentése', 'Salvează notița')}</button>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div class="fixed-bottom-bar z-40 pb-safe bg-surface-container-lowest/95 backdrop-blur-md border-t border-outline-variant/40 shadow-[0_-4px_20px_rgba(23,40,25,0.08)] no-print">
        <div class="max-w-5xl mx-auto px-3.5 sm:px-6 h-[72px] flex items-center justify-between gap-2.5">
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <span class="w-10 h-10 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center shrink-0">${icon(
              isLocked ? 'lock' : 'restaurant',
              'text-[20px]'
            )}</span>
            <div class="min-w-0"><p class="text-[14px] sm:text-title-md font-semibold text-primary truncate leading-tight">${esc(
              r.short || r.title
            )}</p><p class="text-[12px] sm:text-body-sm text-on-surface-variant truncate leading-tight">${n} ${srvWord()} • ${totalSteps} ${tr('lépés', 'pași')} • ${
              r.prep + r.cook
            } ${minsWord()}</p></div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button type="button" data-act="open-shop" aria-label="${tr(
              'Bevásárlólista megnyitása',
              'Deschide lista de cumpărături'
            )}" class="relative w-11 h-11 rounded-full bg-surface-container-low hover:bg-surface-container border border-outline-variant/45 text-primary flex items-center justify-center shadow-sm active:scale-95 transition shrink-0">
              ${icon('shopping_bag', 'text-[20px] text-primary')}
              <span data-shop-badge class="${
                S.shopping.filter(it => !it.checked).length > 0 ? 'inline-flex' : 'hidden'
              } absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full bg-secondary text-on-secondary text-[10px] font-bold items-center justify-center shadow-sm leading-none">${
                S.shopping.filter(it => !it.checked).length
              }</span>
            </button>
            ${
              isLocked
                ? `<button type="button" data-act="scroll" data-target="paywall-section" class="min-h-[44px] px-3.5 sm:px-5 rounded-full bg-secondary text-on-secondary text-label-md sm:text-title-md flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0 active:scale-95 transition">${icon(
                    'workspace_premium',
                    'fill text-[18px]'
                  )}${tr('Prémium feloldása', 'Deblochează')}</button>`
                : `<a href="#/fozes/${encodeURIComponent(
                    r.id
                  )}/${startStep}" data-replace class="min-h-[44px] px-3.5 sm:px-5 rounded-full bg-secondary text-on-secondary text-label-md sm:text-title-md flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0 active:scale-95 transition">${icon(
                    'play_arrow',
                    'fill text-[20px]'
                  )}${hasProg ? `${tr('Folytatás', 'Continuă')} (${prog}/${r.steps.length})` : tr('Főzés indítása', 'Începe gătitul')}</a>`
            }
          </div>
        </div>
      </div>`
      );
    }

    function stepCard(r: any, s: any, i: number, prog = 0) {
      const key = `${r.id}:${i}`,
        t = s.timer ? timerOf(key, s.timer) : null,
        cur = prog === i + 1;
      return `<article class="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col gap-2.5 ${
        cur ? 'ring-2 ring-secondary' : ''
      }">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2"><span class="w-7 h-7 rounded-full ${
            cur ? 'bg-secondary text-on-secondary' : 'bg-primary text-on-primary'
          } text-label-md flex items-center justify-center flex-shrink-0">${
            i + 1
          }</span><h4 class="text-title-md text-primary">${esc(
            s.title || tr(`${i + 1}. lépés`, `Pasul ${i + 1}`)
          )}</h4></div>
          <div class="flex items-center gap-1.5">
            ${
              cur
                ? `<span class="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-label-sm">${tr('Itt tartasz', 'Ești aici')}</span>`
                : ''
            }
            ${
              s.tag
                ? `<span class="px-2.5 py-0.5 rounded-full bg-surface-container text-label-sm text-on-surface-variant whitespace-nowrap">${esc(
                    s.tag
                  )}</span>`
                : ''
            }
          </div>
        </div>
        ${
          s.image
            ? `<div class="w-full h-36 rounded-lg overflow-hidden bg-surface-container"><img loading="lazy" class="w-full h-full object-cover" src="${img(
                s.image
              )}" alt="${esc(s.title)}"></div>`
            : ''
        }
        <p class="text-body-md text-on-surface leading-relaxed">${esc(s.text)}</p>
        <div class="flex items-center justify-between gap-2 pt-1 no-print">
          ${
            t
              ? `<div class="flex-1 flex items-center justify-between p-2 bg-surface-container-low rounded-lg">
            <span class="flex items-center gap-2 text-primary text-title-md tabular-nums font-mono">${icon(
              'timer',
              'text-secondary text-[20px]'
            )}<span data-timer="${esc(key)}">${tFmt(t.left)}</span></span>
            <button data-act="timer" data-key="${esc(key)}" data-total="${
                  s.timer
                }" data-tbtn="${esc(
                  key
                )}" class="h-8 px-3 rounded-lg bg-primary text-on-primary text-label-md flex items-center gap-1 shadow-sm">${tLabel(
                  t
                )}</button>
          </div>`
              : '<span></span>'
          }
          <a href="#/fozes/${encodeURIComponent(r.id)}/${
            i + 1
          }" data-replace class="h-8 px-2.5 rounded-lg bg-surface-container text-label-sm text-primary hover:bg-surface-container-high flex items-center gap-1 shrink-0">${icon(
        'skillet',
        'text-[14px]'
      )}${cur ? tr('Folytatás innen', 'Continuă de aici') : tr(`${i + 1}. lépés`, `Pasul ${i + 1}`)}</a>
        </div>
      </article>`;
    }

    const tipBox = (r: any) =>
      r.tip && (r.tip.lead || r.tip.bold || r.tip.rest)
        ? `<section class="bg-surface-container-high rounded-xl p-4 flex gap-3 shadow-sm">
        ${icon('tips_and_updates', 'text-secondary text-[24px] shrink-0 mt-0.5')}
        <div><h3 class="text-title-lg text-primary font-bold">${tr('Séf Mesterfogása', 'Secretul Bucătarului')}</h3>
        <p class="text-body-md text-on-surface-variant mt-1 leading-relaxed">${esc(
          r.tip.lead
        )} <strong>${esc(r.tip.bold)}</strong>${esc(r.tip.rest)}</p></div>
      </section>`
        : '';

    function viewCook(r: any, stepParam: string) {
      if (r.locked && !r.is_free && !hasSub()) {
        return viewRecipe(r);
      }
      if (stepParam === 'kesz') return viewCookDone(r);
      const steps = r.steps || [];
      const total = steps.length || 1,
        i = Math.min(Math.max(parseInt(stepParam, 10) || 1, 1), total) - 1,
        s = steps[i] || { title: tr('1. lépés', 'Pasul 1'), text: '' };
      if (S.progress[r.id]?.step !== i + 1) {
        S.progress[r.id] = { step: i + 1, at: Date.now() };
        save();
      }
      const key = `${r.id}:${i}`,
        t = s.timer ? timerOf(key, s.timer) : null,
        last = i === total - 1,
        next = steps[i + 1];
      const pct = Math.round(((i + 1) / total) * 100),
        checked = S.checked[r.id] || [];
      const stepTip = s.tip ? { lead: '', bold: '', rest: s.tip } : last ? r.tip : null;
      const stepImg = s.image || (last ? r.image : '');
      return `<header class="sticky top-0 z-30 gpu-sticky-header bg-surface/95 backdrop-blur-md border-b border-outline-variant/25 shadow-[0_1px_8px_rgba(0,0,0,0.04)] pt-3 pb-3">
          <div class="max-w-4xl mx-auto px-3.5 sm:px-6">
            <div class="flex items-center justify-between gap-2">
              <a href="#/r/${encodeURIComponent(
                r.id
              )}" data-replace class="h-10 px-2 -ml-2 rounded-lg flex items-center gap-1 text-on-surface-variant hover:text-on-surface">${icon(
          'close',
          'text-[20px]'
        )}<span class="text-label-md">${tr('Kilépés', 'Ieșire')}</span></a>
              <div class="flex items-center gap-2">
                <button type="button" id="wake" data-act="wake" class="px-3 py-1 rounded-full bg-surface-container-high border border-outline-variant/30 text-label-sm flex items-center gap-1.5 shadow-sm"></button>
                <span class="w-8 h-8 rounded-full bg-primary text-on-primary text-label-sm flex items-center justify-center">${
                  i + 1
                }/${total}</span>
              </div>
            </div>
            <div class="flex items-baseline justify-between gap-2 mt-2">
              <h1 class="font-serif text-headline-sm text-primary truncate">${esc(
                r.short || r.title
              )}</h1>
              <span class="text-label-sm uppercase tracking-wider text-secondary shrink-0">${pct}% ${tr('kész', 'gata')} • ${
                i + 1
              } / ${total}</span>
            </div>
            <div class="h-1.5 rounded-full bg-surface-container-high mt-1.5 overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="h-full bg-secondary rounded-full transition-all duration-300" style="width:${pct}%"></div></div>
          </div>
        </header>
        <div class="${NARROW_X} pt-4 pb-28 flex flex-col gap-space-md">
          <div class="flex items-center gap-2 flex-wrap">
            ${
              s.timer
                ? `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-label-md">${icon(
                    'schedule',
                    'text-[15px]'
                  )}${Math.max(1, Math.round(s.timer / 60))} ${minsWord()}</span>`
                : ''
            }
            ${
              s.tag
                ? `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container-high text-primary text-label-md">${icon(
                    'skillet',
                    'text-[15px]'
                  )}${esc(s.tag)}</span>`
                : ''
            }
            <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container-low text-on-surface-variant text-label-md">${icon(
              'restaurant',
              'text-[15px]'
            )}${servingsOf(r)} ${srvWord()}</span>
          </div>

          <article class="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col gap-3">
            <div class="flex items-center gap-2.5"><span class="w-8 h-8 rounded-full bg-primary text-on-primary text-title-md flex items-center justify-center shrink-0">${
              i + 1
            }</span><span class="text-label-sm uppercase tracking-wider text-secondary">${esc(
              s.tag || tr(`${i + 1}. lépés`, `Pasul ${i + 1}`)
            )}</span></div>
            <h2 class="font-serif text-headline-sm text-primary leading-tight">${esc(
              s.title || tr(`${i + 1}. lépés`, `Pasul ${i + 1}`)
            )}</h2>
            <div class="bg-surface-container-low rounded-lg p-4 border-l-4 border-secondary"><p class="text-body-lg text-primary font-medium leading-relaxed">${esc(
              s.text
            )}</p></div>
          </article>

          ${
            t
              ? `<section class="bg-primary-container text-on-primary rounded-xl p-4 flex flex-col gap-3 shadow-md">
            <div class="flex items-center justify-between"><span class="flex items-center gap-1.5 text-label-sm uppercase tracking-wider text-primary-fixed">${icon(
              'alarm',
              'text-secondary-container text-[18px]'
            )}${tr('Aktív főzési időzítő', 'Cronometru activ de gătit')}</span><span class="px-2.5 py-0.5 rounded-full bg-primary/50 text-on-primary-container text-label-sm">${tr('Ajánlott:', 'Recomandat:')} ${Math.max(
                  1,
                  Math.round(s.timer / 60)
                )} ${minsWord()}</span></div>
            <div class="flex items-center justify-between py-1">
              <div><span class="text-label-sm uppercase tracking-widest text-on-primary-container">${tr('Hátralévő idő', 'Timp rămas')}</span><p class="font-serif text-[44px] leading-none tabular-nums mt-1" data-timer="${esc(
                key
              )}" aria-live="off">${tFmt(t.left)}</p></div>
              <div class="relative w-20 h-20 flex items-center justify-center">
                <svg class="w-full h-full -rotate-90" viewBox="0 0 100 100"><circle class="text-primary" cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="7"/><circle class="text-secondary-container transition-all duration-500" data-tring="${esc(
                  key
                )}" cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="7" stroke-dasharray="264" stroke-dashoffset="${
                  264 * (1 - t.left / Math.max(t.total, 1))
                }" stroke-linecap="round"/></svg>
                ${icon('timer', 'text-secondary-container absolute text-[26px]')}
              </div>
            </div>
            <div class="flex gap-2">
              <button data-act="treset" data-key="${esc(
                key
              )}" aria-label="${tr('Időzítő visszaállítása', 'Resetează cronometrul')}" class="w-12 h-12 rounded-xl bg-primary/60 flex items-center justify-center active:scale-95">${icon(
                  'replay'
                )}</button>
              <button data-act="timer" data-key="${esc(key)}" data-total="${
                  s.timer
                }" data-tbtn="${esc(
                  key
                )}" class="flex-1 h-12 rounded-xl bg-secondary text-on-secondary text-title-md flex items-center justify-center gap-1.5 shadow-md active:scale-95">${tLabel(
                  t
                )}</button>
              <button data-act="tplus" data-key="${esc(
                key
              )}" data-sec="60" class="h-12 px-3 rounded-xl bg-primary/60 text-label-md active:scale-95">+1 ${minLabel()}</button>
              <button data-act="tplus" data-key="${esc(
                key
              )}" data-sec="300" class="h-12 px-3 rounded-xl bg-primary/60 text-label-md active:scale-95">+5 ${minLabel()}</button>
            </div>
          </section>`
              : ''
          }

          ${
            stepTip && (stepTip.lead || stepTip.bold || stepTip.rest)
              ? `<section class="bg-tertiary-fixed/40 rounded-xl p-4 flex gap-3 items-start shadow-sm">
            <span class="w-8 h-8 rounded-full bg-tertiary text-on-tertiary flex items-center justify-center shrink-0 mt-0.5">${icon(
              'lightbulb',
              'text-[18px]'
            )}</span>
            <div><span class="text-label-sm uppercase tracking-wider text-tertiary">${tr('Séf tipp & technika', 'Sfatul chef-ului & tehnică')}</span><p class="text-body-sm text-on-surface mt-0.5 leading-relaxed">${esc(
              stepTip.lead
            )} <strong>${esc(stepTip.bold)}</strong>${esc(stepTip.rest)}</p></div>
          </section>`
              : ''
          }

          <section class="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col gap-2">
            <div class="flex items-center justify-between"><h3 class="text-title-md text-primary flex items-center gap-1.5">${icon(
              'checklist',
              'text-secondary text-[20px]'
            )}${tr('Kimért alapanyagok', 'Ingrediente pregătite')} (${servingsOf(
        r
      )} ${srvWord()})</h3><span class="text-label-sm text-on-surface-variant">${tr('Érintsd meg ha kész', 'Atinge când e gata')}</span></div>
            <ul class="divide-y divide-outline-variant/30">${(r.ingredients || [])
              .map((ing: any, idx: number) => {
                const c = checked.includes(idx);
                return `<li>
              <button role="checkbox" aria-checked="${c}" data-act="check" data-i="${idx}" class="w-full flex items-center justify-between gap-3 py-2.5 text-left">
                <span class="flex items-center gap-2.5 min-w-0">
                  <span class="w-5 h-5 rounded-[6px] flex items-center justify-center shrink-0 ${
                    c ? 'bg-primary text-on-primary' : 'bg-surface-container-high'
                  }">${c ? icon('check', 'text-[15px]') : ''}</span>
                  <span class="text-body-sm ${
                    c ? 'line-through text-outline' : 'font-medium'
                  } truncate">${esc(ing.name)}</span>
                </span>
                <span class="text-label-md text-secondary shrink-0">${amount(ing, r)}</span>
              </button></li>`;
              })
              .join('')}</ul>
          </section>

          ${
            stepImg
              ? `<section class="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm">
            <div class="relative h-48 bg-surface-container"><img class="w-full h-full object-cover" src="${img(
              stepImg
            )}" alt="${esc(s.title || r.title)}">
              <div class="absolute bottom-3 left-3 bg-primary/85 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1.5 text-on-primary">${icon(
                'verified',
                'text-[15px] text-secondary-fixed'
              )}<span class="text-label-sm">${tr(`Várt eredmény a(z) ${i + 1}. lépés végén`, `Rezultat așteptat la finalul pasului ${i + 1}`)}</span></div>
            </div>
          </section>`
              : ''
          }

          ${
            next
              ? `<a href="#/fozes/${encodeURIComponent(r.id)}/${
                  i + 2
                }" data-replace class="bg-surface-container-low rounded-xl p-4 flex items-center gap-3 hover:bg-surface-container">
            <span class="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-label-md shrink-0">${
              i + 2
            }</span>
            <span class="flex-1 min-w-0"><span class="block text-label-sm uppercase text-on-surface-variant">${tr('Következő lépés előnézete', 'Previzualizare pas următor')}</span><span class="block text-title-md text-primary truncate">${tr(
                  `${i + 2}. Lépés`,
                  `Pasul ${i + 2}`
                )}: ${esc(next.title || next.tag || '')}</span></span>${icon(
                  'chevron_right',
                  'text-secondary'
                )}</a>`
              : ''
          }
        </div>
        <aside class="fixed-bottom-bar z-40 pb-safe bg-surface/95 backdrop-blur-md border-t border-outline-variant/40 shadow-[0_-4px_20px_rgba(44,62,45,0.08)]">
          <div class="max-w-4xl mx-auto h-[72px] px-3.5 sm:px-6 flex items-center gap-2.5">
            ${
              i > 0
                ? `<a href="#/fozes/${encodeURIComponent(
                    r.id
                  )}/${i}" data-replace class="min-h-[48px] px-3.5 sm:px-4 rounded-xl bg-surface-container-high text-primary text-label-md sm:text-title-md flex items-center gap-1.5 shrink-0">${icon(
                    'arrow_back',
                    'text-[20px]'
                  )}${tr('Előző', 'Înapoi')}</a>`
                : ''
            }
            ${
              last
                ? `<button data-act="cookdone" data-id="${esc(
                    r.id
                  )}" class="flex-1 min-h-[48px] px-4 rounded-xl bg-secondary text-on-secondary text-label-md sm:text-title-md flex items-center justify-center gap-2 shadow-md">${icon(
                    'celebration',
                    'text-[22px]'
                  )}${tr('Főzés befejezése & mentés', 'Finalizează & salvează')}</button>`
                : `<a href="#/fozes/${encodeURIComponent(r.id)}/${
                    i + 2
                  }" data-replace class="flex-1 min-h-[48px] px-4 rounded-xl bg-secondary text-on-secondary text-label-md sm:text-title-md flex items-center justify-center gap-2 shadow-md">${tr('Következő lépés', 'Pasul următor')} (${
                    i + 2
                  }/${total}) ${icon('arrow_forward', 'text-[22px]')}</a>`
            }
          </div>
        </aside>`;
    }

    function viewCookDone(r: any) {
      return `<div class="${NARROW_X} min-h-[100dvh] py-10 flex flex-col items-center justify-center text-center gap-5">
        <span class="w-16 h-16 rounded-full bg-secondary-fixed text-secondary flex items-center justify-center">${icon(
          'celebration',
          'text-[32px]'
        )}</span>
        <p class="text-label-sm uppercase tracking-wider text-secondary">${tr('Szép munka, séf!', 'Felicitări, chef!')}</p>
        <h1 class="font-serif text-display-hero-mobile text-primary">${tr('Jó étvágyat!', 'Poftă bună!')}</h1>
        <img class="w-full h-56 object-cover rounded-xl shadow-md" src="${img(
          r.image
        )}" alt="${esc(r.title)}">
        <p class="text-body-md text-on-surface-variant">${tr(
          `A(z) <strong>${esc(r.short || r.title)}</strong> bekerült a „Nemrég főzött” listádba.`,
          `Rețeta <strong>${esc(r.short || r.title)}</strong> a fost adăugată în lista „Gătite recent”.`
        )}</p>
        <div class="w-full flex flex-col gap-2">
          ${
            isFav(r.id)
              ? ''
              : `<button data-act="fav" data-id="${esc(
                  r.id
                )}" class="min-h-[48px] px-4 py-2.5 rounded-xl bg-secondary text-on-secondary text-[14px] sm:text-title-md font-semibold flex items-center justify-center gap-2 text-center leading-snug">${icon(
                  'favorite',
                  'text-[20px] shrink-0'
                )}<span>${tr('Mentés a kedvencek közé', 'Salvează la favorite')}</span></button>`
          }
          <a href="#/r/${encodeURIComponent(
            r.id
          )}" data-replace class="min-h-[48px] px-4 py-2.5 rounded-xl bg-surface-container text-primary text-[14px] sm:text-title-md font-semibold flex items-center justify-center text-center leading-snug">${tr('Vissza a recepthez', 'Înapoi la rețetă')}</a>
          <a href="#/profil?t=fozott" data-replace class="min-h-[44px] px-4 py-2.5 rounded-xl bg-surface-container-low text-primary text-[13px] sm:text-label-md font-semibold flex items-center justify-center text-center leading-snug hover:bg-surface-container">${tr('Megtekintés a Nemrég főzötteknél', 'Vezi în Gătite recent')}</a>
          <a href="#/" data-replace class="min-h-[48px] px-4 py-2.5 rounded-xl text-secondary text-[14px] sm:text-title-md font-semibold flex items-center justify-center text-center leading-snug">${tr('Új recept felfedezése', 'Descoperă o rețetă nouă')}</a>
        </div></div>`;
    }

    function viewProfile({ q }: { q: URLSearchParams }) {
      const list = all();
      const totalCount = list.length;
      const freeCount = list.filter((r: any) => Boolean(r.is_free || r.mine)).length;
      const premiumCount = totalCount - freeCount;
      const tab = q.get('t') || 'kedvencek',
        edit = q.get('edit') === '1';
      const favs = S.favs.map(get).filter(Boolean);
      const cooked = S.cooked
        .map(c => ({ r: get(c.id), at: c.at }))
        .filter(c => c.r);
      const noted = Object.entries(S.notes)
        .filter(([, v]) => String(v || '').trim())
        .map(([id, text]) => ({ r: get(id), text }))
        .filter(x => x.r);
      const tabs = [
        ['kedvencek', `${tr('Kedvencek', 'Favorite')} (${favs.length})`],
        ['fozott', `${tr('Nemrég', 'Recente')} (${cooked.length})`],
        ['sajat', `${tr('Saját', 'Proprii')} (${S.mine.length})`],
        ['jegyzetek', `${tr('Jegyzet', 'Notițe')} (${noted.length})`],
        ['lista', `${tr('Lista', 'Cumpărături')} (${S.shopping.length})`],
      ];
      const row = (r: any, meta: string, ctaLabel = tr('Készítsd el újra', 'Gătește din nou')) => {
        const total = r.steps?.length || r.step_count || 3;
        const p = S.progress[r.id]?.step || 0,
          hp = p >= 1 && p <= total;
        return `<article class="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-3 flex flex-col gap-2.5">
          <div class="flex gap-3">
            <a href="#/r/${encodeURIComponent(
              r.id
            )}" class="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden"><img loading="lazy" class="w-full h-full object-cover" src="${img(
          r.image
        )}" alt=""><span class="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-surface-container-lowest/90 text-label-sm text-secondary">${
          r.prep + r.cook
        } ${minsWord()}</span></a>
            <div class="flex-1 min-w-0 flex flex-col justify-between">
              <div>
                <div class="flex items-start justify-between gap-1"><a href="#/r/${encodeURIComponent(
                  r.id
                )}" class="text-title-md text-primary leading-snug line-clamp-2">${esc(
          r.short || r.title
        )}</a>${favBtn(r.id, 'w-8 h-8 flex-shrink-0')}</div>
                <p class="text-body-sm text-on-surface-variant truncate mt-0.5">${esc(
                  r.subtitle || r.description
                )}</p>
              </div>
              <div class="flex items-center gap-2 text-label-sm text-on-surface-variant">
                ${accessBadge(Boolean(r.is_free || r.mine), hasSub(), S.lang)}
                <span>${meta}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-between pt-1 border-t border-outline-variant/30">
            <a href="#/r/${encodeURIComponent(
              r.id
            )}" class="text-label-md text-primary hover:underline flex items-center gap-1">${icon(
          'menu_book',
          'text-[16px]'
        )}${tr('Recept megtekintése', 'Vezi rețeta')}</a>
            <a href="#/fozes/${encodeURIComponent(r.id)}/${
          hp ? p : 1
        }" data-replace class="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary text-label-md flex items-center gap-1 shadow-sm">${icon(
          'skillet',
          'text-[16px]'
        )}${hp ? `${tr('Folytatás', 'Continuă')} (${p}/${total})` : ctaLabel}</a>
          </div></article>`;
      };
      const empty = (msg: string, href: string, cta: string) =>
        `<div class="text-center py-10 px-6 bg-surface-container-low rounded-xl text-on-surface-variant"><p>${msg}</p><a href="${href}" class="inline-block mt-3 text-secondary text-title-md hover:underline">${cta}</a></div>`;
      const bodyMap: Record<string, () => string> = {
        kedvencek: () =>
          favs.length
            ? favs
                .map((r: any) =>
                  row(r, r.rating ? `${tr('Értékelés', 'Evaluare')}: ${r.rating}/5` : esc(r.difficulty))
                )
                .join('')
            : empty(
                tr('Még nincs kedvenc recepted. Koppints a szív ikonra bármelyik receptnél.', 'Încă nu ai rețete favorite. Apasă pe pictograma inimă la orice rețetă.'),
                '#/',
                tr('Receptek felfedezése', 'Descoperă rețete')
              ),
        fozott: () =>
          cooked.length
            ? cooked
                .map((c: any) => row(c.r, `${tr('Utoljára főzve:', 'Gătit ultima dată:')} ${relDays(c.at, S.lang)}`))
                .join('')
            : empty(
                tr('Itt jelennek meg a főzési módban befejezett receptek.', 'Aici apar rețetele finalizate în modul de gătit.'),
                '#/',
                tr('Válassz egy receptet', 'Alege o rețetă')
              ),
        sajat: () =>
          S.mine.length
            ? S.mine.map((r: any) => row(r, esc(r.difficulty), tr('Főzés', 'Gătește'))).join('')
            : empty(
                tr('Még nem adtál hozzá saját receptet.', 'Nu ai adăugat încă rețete proprii.'),
                '#/uj',
                tr('Első receptem hozzáadása', 'Adaugă prima rețetă')
              ),
        jegyzetek: () =>
          noted.length
            ? noted
                .map(
                  ({ r, text }: any) => `<article class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-3.5 flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2"><a href="#/r/${encodeURIComponent(
              r.id
            )}" class="text-title-md text-primary hover:underline truncate">${esc(
                    r.short || r.title
                  )}</a>
            <button data-act="delnote" data-id="${esc(
              r.id
            )}" aria-label="${tr('Jegyzet törlése', 'Șterge notița')}" class="text-outline hover:text-error">${icon(
                    'delete',
                    'text-[18px]'
                  )}</button></div>
            <p class="text-body-sm text-on-surface-variant bg-surface-container-low rounded-lg p-2.5 whitespace-pre-wrap">${esc(
              text
            )}</p>
          </article>`
                )
                .join('')
            : empty(
                tr('Még nincs jegyzeted. Bármelyik recept alján írhatsz saját konyhai feljegyzést.', 'Nu ai încă notițe. Poți adăuga notițe la baza fiecărei rețete.'),
                '#/',
                tr('Receptek böngészése', 'Răsfoiește rețetele')
              ),
        lista: () => {
          if (!S.shopping.length) {
            return empty(
              tr(
                'A bevásárlólista üres. A receptoldalon a „Hiányzók a bevásárlólistához” gombbal tölthetsz fel.',
                'Lista de cumpărături este goală. Adaugă ingrediente din pagina unei rețete.'
              ),
              '#/kereses',
              tr('Receptek böngészése', 'Răsfoiește rețetele')
            );
          }
          const curExportMode: ChecklistExportMode = shoppingStore.getSnapshot().exportMode;
          const uncheckedItems = S.shopping.filter(it => !it.checked);
          const checkedItems = S.shopping.filter(it => it.checked);
          const checkedCount = checkedItems.length;

          const renderProfileShopRow = (s: ShoppingItem) => {
            const qtyBadge = formatShoppingQty(s.qty, s.unit, S.unit);
            const step = s.qty != null ? getSymmetricStep(s.unit, S.unit) : 0;
            const willRemove = s.qty != null && s.qty <= step;
            return `<li class="flex items-center justify-between gap-2.5 px-3.5 py-2.5 hover:bg-surface-container-low/45 transition-colors">
              <button type="button" role="checkbox" aria-checked="${s.checked}" data-act="shoptoggle" data-id="${esc(
                s.id
              )}" class="flex items-start gap-2.5 text-left flex-1 min-w-0 py-0.5">
                <span class="mt-0.5 w-[18px] h-[18px] rounded-[5px] flex items-center justify-center flex-shrink-0 ${
                  s.checked
                    ? 'bg-primary text-on-primary'
                    : 'border-[1.5px] border-outline bg-surface-container-lowest'
                }">${s.checked ? icon('check', 'text-[14px]') : ''}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-[14px] font-medium leading-snug ${
                    s.checked ? 'line-through text-outline' : 'text-on-surface'
                  }">${esc(s.name)}</span>
                  ${
                    s.from
                      ? `<span class="block text-[11px] text-outline leading-tight mt-0.5 truncate">${esc(
                          s.from
                        )}</span>`
                      : ''
                  }
                </span>
              </button>
              <div class="flex items-center gap-1 shrink-0">
                ${
                  s.qty != null
                    ? `<div class="inline-flex items-center bg-surface-container-low rounded-lg p-0.5 border border-outline-variant/35">
                        <button type="button" data-act="shopqty" data-id="${esc(s.id)}" data-d="-1" aria-label="${
                          willRemove
                            ? tr('Tétel eltávolítása (0)', 'Elimină articolul (0)')
                            : tr('Mennyiség csökkentése', 'Scade cantitatea')
                        }" class="w-6 h-6 rounded-md flex items-center justify-center active:scale-90 transition ${
                          willRemove
                            ? 'text-error hover:bg-error-container/60'
                            : 'text-primary hover:bg-surface-container-high'
                        }">${icon(willRemove ? 'delete' : 'remove', 'text-[14px]')}</button>
                        <span class="px-1.5 text-[12px] font-semibold tabular-nums text-primary whitespace-nowrap min-w-[48px] text-center">${esc(
                          qtyBadge
                        )}</span>
                        <button type="button" data-act="shopqty" data-id="${esc(s.id)}" data-d="1" aria-label="${tr(
                          'Mennyiség növelése',
                          'Crește cantitatea'
                        )}" class="w-6 h-6 rounded-md text-primary hover:bg-surface-container-high flex items-center justify-center active:scale-90 transition">${icon(
                          'add',
                          'text-[14px]'
                        )}</button>
                      </div>`
                    : qtyBadge
                      ? `<span class="px-2 py-0.5 rounded-md bg-surface-container-low text-[11px] text-on-surface-variant">${esc(
                          qtyBadge
                        )}</span>`
                      : ''
                }
                <button type="button" data-act="shopremove" data-id="${esc(s.id)}" aria-label="${tr(
                  'Törlés:',
                  'Șterge:'
                )} ${esc(s.name)}" class="w-7 h-7 rounded-full text-outline/75 hover:text-error flex items-center justify-center">${icon(
                  'close',
                  'text-[15px]'
                )}</button>
              </div>
            </li>`;
          };

          return `<div class="flex flex-col gap-3">
            <!-- Compact Sticky/Header Action Bar: Keep/Notes Export + Clear -->
            <div class="rounded-xl bg-surface-container-lowest p-3 border border-outline-variant/35 shadow-sm flex flex-col gap-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">${icon(
                  'checklist_rtl',
                  'text-secondary text-[16px]'
                )}${tr('Pipálható lista exportálása', 'Exportă ca listă cu bife')}</span>
                <div class="inline-flex rounded-full bg-surface-container p-0.5 text-[10.5px] font-bold border border-outline-variant/30" role="group" aria-label="${tr(
                  'Export formátum',
                  'Format export'
                )}">
                  <button type="button" data-act="shop-fmt" data-fmt="plain" aria-pressed="${
                    curExportMode === 'plain'
                  }" class="px-2.5 py-0.5 rounded-full transition ${
                    curExportMode === 'plain'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-on-surface-variant'
                  }">Keep / Notes</button>
                  <button type="button" data-act="shop-fmt" data-fmt="markdown" aria-pressed="${
                    curExportMode === 'markdown'
                  }" class="px-2.5 py-0.5 rounded-full transition ${
                    curExportMode === 'markdown'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-on-surface-variant'
                  }">- [ ] MD</button>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                <button type="button" data-act="keep" class="flex-1 min-w-[120px] min-h-[38px] px-3 rounded-lg bg-secondary-fixed text-on-secondary-fixed text-label-md font-semibold flex items-center justify-center gap-1.5 shadow-sm hover:opacity-90 active:scale-95 transition">${icon(
                  'keep',
                  'text-[16px]'
                )}Google Keep</button>
                <button type="button" data-act="notes-share" class="flex-1 min-w-[120px] min-h-[38px] px-3 rounded-lg bg-surface-container-low border border-outline-variant/45 text-primary text-label-md font-semibold flex items-center justify-center gap-1.5 hover:bg-surface-container active:scale-95 transition">${icon(
                  'ios_share',
                  'text-[16px]'
                )}${tr('Notes / Másolás', 'Notes / Copiază')}</button>
                <button type="button" data-act="notes-dl" title="${tr(
                  'Mentés .txt fájlként',
                  'Salvează ca fișier .txt'
                )}" aria-label="${tr(
                  'Mentés .txt fájlként',
                  'Salvează ca fișier .txt'
                )}" class="w-9 h-[38px] rounded-lg bg-surface-container-low border border-outline-variant/45 text-primary hover:bg-surface-container flex items-center justify-center active:scale-95 transition shrink-0">${icon(
                  'download',
                  'text-[17px]'
                )}</button>
                <button type="button" data-act="shopclear" title="${tr(
                  'Teljes lista törlése',
                  'Șterge întreaga listă'
                )}" aria-label="${tr(
                  'Teljes lista törlése',
                  'Șterge întreaga listă'
                )}" class="w-9 h-[38px] rounded-lg bg-error-container/75 hover:bg-error-container text-on-error-container flex items-center justify-center active:scale-95 transition shrink-0">${icon(
                  'delete_sweep',
                  'text-[17px]'
                )}</button>
              </div>
              <div id="keepbox" class="hidden bg-surface-container-low rounded-lg p-2.5 border border-outline-variant/35 flex-col gap-1.5">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-[11px] font-semibold text-secondary" id="keepstatus">${tr(
                    'Vágólapra másolva – készen áll a beillesztésre',
                    'Copiat în clipboard – gata de lipit'
                  )}</span>
                  <a href="https://keep.google.com/" target="_blank" rel="noopener noreferrer" class="px-2 py-0.5 rounded bg-secondary text-on-secondary text-[11px] font-semibold flex items-center gap-1">${tr(
                    'Keep megnyitása',
                    'Deschide Keep'
                  )} ${icon('open_in_new', 'text-[12px]')}</a>
                </div>
                <pre id="keeptext" class="text-[12px] font-mono whitespace-pre-wrap bg-surface-container-lowest p-2 rounded border border-outline-variant/30 max-h-36 overflow-y-auto"></pre>
              </div>
            </div>

            ${
              uncheckedItems.length > 0
                ? `<ul class="bg-surface-container-lowest rounded-xl border border-outline-variant/35 shadow-sm divide-y divide-outline-variant/30 overflow-hidden">${uncheckedItems
                    .map(renderProfileShopRow)
                    .join('')}</ul>`
                : ''
            }

            ${
              checkedCount > 0
                ? `<div class="flex flex-col gap-1.5">
                    <div class="px-1 flex items-center justify-between gap-2">
                      <span class="text-[11px] font-bold uppercase tracking-wider text-outline">${tr(
                        `Megvan (${checkedCount})`,
                        `Bifate (${checkedCount})`
                      )}</span>
                      <button type="button" data-act="shopclearchecked" class="text-[11px] font-semibold text-secondary hover:underline flex items-center gap-1">${icon(
                        'done_all',
                        'text-[14px]'
                      )}<span>${tr('Kipipáltak törlése', 'Șterge bifate')}</span></button>
                    </div>
                    <ul class="bg-surface-container-low/65 rounded-xl border border-outline-variant/25 divide-y divide-outline-variant/25 overflow-hidden">${checkedItems
                      .map(renderProfileShopRow)
                      .join('')}</ul>
                  </div>`
                : ''
            }
          </div>`;
        },
      };

      const liveClerk = clerkRef.current;
      const authReady = isAuthReady();
      const signedIn = isUserSignedIn();
      const uName = activeUserName() || '';
      const uEmail = liveClerk.enabled
        ? liveClerk.isSignedIn
          ? liveClerk.email || ''
          : ''
        : S.user?.email || '';

      if (!authReady) {
        return (
          titleHeader(tr('Profil & Előfizetés', 'Profil & Abonament')) +
          `<div class="${NARROW_X} py-24 flex flex-col items-center justify-center gap-3 text-center text-on-surface-variant">
            ${icon('progress_activity', 'animate-spin text-secondary text-[28px]')}
            <p class="text-body-sm">${tr('Munkamenet és előfizetés szinkronizálása...', 'Se sincronizează sesiunea și abonamentul...')}</p>
          </div>`
        );
      }

      return (
        titleHeader(tr('Profil & Előfizetés', 'Profil & Abonament')) +
        `<div class="${NARROW_X} pt-4 pb-6 flex flex-col gap-space-lg">
        <section class="bg-surface-container-lowest rounded-2xl shadow-sm p-5 sm:p-6 flex flex-col items-center text-center gap-2 relative overflow-hidden border border-outline-variant/25">
          <div class="relative mb-1">
            <span class="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-primary text-on-primary font-serif text-[34px] sm:text-[38px] flex items-center justify-center ring-4 ring-secondary/20">${
              signedIn && uName ? esc(uName[0].toUpperCase()) : icon('person', 'text-[38px]')
            }</span>
            ${
              signedIn
                ? `<span class="absolute -bottom-1 right-0 ${
                    hasSub() ? 'bg-tertiary text-on-tertiary' : 'bg-secondary text-on-secondary'
                  } text-label-sm px-2.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm whitespace-nowrap">${icon(
                    hasSub() ? 'workspace_premium' : 'local_fire_department',
                    'fill text-[13px]'
                  )}${hasSub() ? tr('Vebeat Prémium', 'Vebeat Premium') : tr('Ingyenes csomag', 'Plan Gratuit')}</span>`
                : ''
            }
          </div>
          ${
            signedIn
              ? `<h2 class="font-serif text-[22px] sm:text-headline-md text-primary mt-1 break-words max-w-full">${esc(uName || tr('Vebeat Fiók', 'Cont Vebeat'))}</h2>
                 <p class="text-body-md text-on-surface-variant">${esc(
                   S.user?.bio || tr('Lelkes házi séf & Receptalkotó', 'Bucătar pasionat & Creator de rețete')
                 )}</p>
                 ${
                   uEmail
                     ? `<p class="text-label-md text-on-surface-variant flex items-center justify-center gap-1 break-all">${icon(
                         'mail',
                         'text-secondary text-[14px] shrink-0'
                       )}${esc(uEmail)}</p>`
                     : ''
                 }`
              : `<h2 class="font-serif text-headline-sm sm:text-headline-md text-primary mt-1">${tr(
                  'Nem vagy bejelentkezve',
                  'Nu ești autentificat'
                )}</h2>
                 <p class="text-body-sm text-on-surface-variant max-w-md">${tr(
                   'Jelentkezz be vagy hozz létre fiókot az előfizetésed, kedvenc receptjeid és jegyzeteid mentéséhez.',
                   'Autentifică-te sau creează un cont pentru a-ți salva abonamentul, rețetele favorite și notițele.'
                 )}</p>`
          }
          ${
            signedIn && edit
              ? `<form data-form="profile" class="w-full mt-3 pt-3 border-t border-outline-variant/40 flex flex-col gap-2 text-left">
            <input name="name" required maxlength="60" placeholder="${tr('Neved', 'Numele tău')}" value="${esc(
              S.user?.name || uName
            )}" class="w-full h-11 px-3 rounded-lg bg-surface-container-low">
            <input name="bio" maxlength="100" placeholder="${tr('Rövid bemutatkozás', 'Scurtă descriere')}" value="${esc(
              S.user?.bio || tr('Lelkes házi séf & Receptalkotó', 'Bucătar pasionat & Creator de rețete')
            )}" class="w-full h-11 px-3 rounded-lg bg-surface-container-low">
            <input name="email" type="email" placeholder="E-mail" value="${esc(
              S.user?.email || uEmail
            )}" class="w-full h-11 px-3 rounded-lg bg-surface-container-low">
            <div class="flex gap-2 justify-end pt-1"><a href="#/profil?t=${esc(
              tab
            )}" data-replace class="min-h-[38px] px-3.5 rounded-lg bg-surface-container text-label-md flex items-center">${tr('Mégse', 'Anulează')}</a><button class="min-h-[38px] px-4 rounded-lg bg-secondary text-on-secondary text-label-md">${tr('Mentés', 'Salvează')}</button></div>
          </form>`
              : `<div class="flex flex-wrap justify-center gap-2 mt-2">
            ${
              signedIn
                ? `<a href="#/profil?t=${esc(
                    tab
                  )}&edit=1" data-replace class="min-h-[40px] px-4 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-primary text-label-md flex items-center gap-1.5">${icon(
                    'edit',
                    'text-[16px]'
                  )}${tr('Profil szerkesztése', 'Editează profilul')}</a>`
                : `<a href="#/belepes" class="min-h-[42px] px-5 rounded-xl bg-secondary text-on-secondary text-label-md font-semibold flex items-center gap-1.5 shadow-sm hover:opacity-95">${icon(
                    'login',
                    'text-[18px]'
                  )}${tr('Bejelentkezés', 'Autentificare')}</a>
                   <a href="#/belepes?m=reg" class="min-h-[42px] px-4 rounded-xl bg-surface-container-high text-primary text-label-md font-semibold flex items-center gap-1.5 hover:bg-surface-container-highest">${icon(
                     'person_add',
                     'text-[18px]'
                   )}${tr('Regisztráció', 'Creează cont')}</a>`
            }
          </div>`
          }
        </section>

        <!-- Subscription Management Card (Manage Subscription / Stripe Customer Portal) -->
        <section id="subscription-card" class="rounded-xl p-4 shadow-md border ${
          hasSub()
            ? 'bg-primary text-on-primary border-secondary/40'
            : 'bg-surface-container-lowest text-on-surface border-outline-variant/40'
        } flex flex-col gap-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="flex items-center gap-1.5 text-label-sm uppercase tracking-wider ${
              hasSub() ? 'text-secondary-fixed' : 'text-secondary'
            }">${icon('workspace_premium', 'fill text-[18px] shrink-0')}<span>${tr('Előfizetés & Tagság (Stripe)', 'Abonament & Membru (Stripe)')}</span></span>
            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase whitespace-nowrap shrink-0 ${
              hasSub()
                ? 'bg-secondary text-on-secondary'
                : 'bg-surface-container-high text-primary'
            }">${
          currentSubscriptionStatus === 'active'
            ? tr('AKTÍV PRÉMIUM', 'PREMIUM ACTIV')
            : currentSubscriptionStatus === 'past_due'
              ? tr('FIZETÉSRE VÁR', 'PLATĂ ÎN AȘTEPTARE')
              : currentSubscriptionStatus === 'canceled'
                ? tr('LEMONDVA', 'ANULAT')
                : tr('INGYENES CSOMAG', 'PLAN GRATUIT')
        }</span>
          </div>
          <div>
            <h3 class="font-serif text-headline-sm ${
              hasSub() ? 'text-on-primary' : 'text-primary'
            }">${
          hasSub()
            ? tr('Vebeat Prémium – Korlátlan hozzáférés', 'Vebeat Premium – Acces nelimitat')
            : tr('Válts Vebeat Prémium tagságra!', 'Treci la Vebeat Premium!')
        }</h3>
            <p class="text-body-sm ${
              hasSub() ? 'text-on-primary-container' : 'text-on-surface-variant'
            } mt-0.5">${
          hasSub()
            ? tr(
                `Minden prémium recept (${totalCount}/${totalCount}), pontos hozzávaló és interaktív Főzési Mód fel van oldva.${
                  currentSubscriptionEnd
                    ? ' Érvényes: ' + new Date(currentSubscriptionEnd).toLocaleDateString('hu-HU') + '-ig.'
                    : ''
                }`,
                `Toate rețetele premium (${totalCount}/${totalCount}), ingredientele exacte și Modul Interactiv de Gătit sunt deblocate.${
                  currentSubscriptionEnd
                    ? ' Valabil până la: ' + new Date(currentSubscriptionEnd).toLocaleDateString('ro-RO') + '.'
                    : ''
                }`
              )
            : tr(
                `Jelenleg a ${freeCount} ingyenes receptet éred el teljes terjedelemben. Fizess elő a további ${premiumCount} prémium nemzetközi, tradicionális, böjti és 10 perces recept feloldásához!`,
                `În prezent ai acces complet la ${freeCount} rețete gratuite. Abonează-te pentru a debloca cele ${premiumCount} rețete premium internaționale, tradiționale, de post și gata în 10 minute!`
              )
        }</p>
          </div>
          <div class="flex flex-col sm:flex-row gap-2.5 pt-1">
            ${
              hasSub()
                ? `<button type="button" data-act="portal" class="w-full sm:flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-surface-container-lowest text-primary text-[14px] sm:text-title-md font-semibold flex items-center justify-center gap-2 text-center leading-snug shadow-sm active:scale-[0.98] transition">${icon(
                    'manage_accounts',
                    'text-[20px] text-secondary shrink-0'
                  )}<span>${tr('Előfizetés kezelése (Stripe)', 'Gestionează abonamentul (Stripe)')}</span></button>
                   <button type="button" data-act="portal-cancel" class="w-full sm:w-auto min-h-[46px] px-4 py-2.5 rounded-xl bg-primary-container text-on-primary-container hover:text-on-primary text-[13px] sm:text-label-md font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 active:scale-[0.98] transition">${tr('Lemondás', 'Anulare')}</button>`
                : `<a href="#/elofizetes" class="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-secondary text-on-secondary text-[14px] sm:text-title-md font-semibold flex items-center justify-center gap-2 text-center leading-snug shadow-sm active:scale-[0.98] transition">${icon(
                    'workspace_premium',
                    'fill text-[20px] shrink-0'
                  )}<span>${tr(
                    `Prémium előfizetés (${PLANS.hu.monthly.shortLabel})`,
                    `Abonament Premium (${PLANS.ro.monthly.shortLabel})`
                  )}</span></a>`
            }
          </div>
        </section>

        <section class="grid grid-cols-3 gap-2 text-center">
          ${[
            [favs.length, tr('Mentve', 'Salvate'), 'kedvencek'],
            [S.cooked.length, tr('Főzés', 'Gătite'), 'fozott'],
            [noted.length + S.mine.length, tr('Jegyzet & Saját', 'Notițe & Proprii'), 'jegyzetek'],
          ]
            .map(
              ([v, l, k], idx) =>
                `<a href="#/profil?t=${k}" data-replace class="bg-surface-container-lowest rounded-xl shadow-sm py-3 hover:bg-surface-container-low"><p class="font-serif text-headline-sm ${
                  idx === 1 ? 'text-secondary' : 'text-primary'
                }">${v}</p><p class="text-label-sm uppercase text-on-surface-variant">${l}</p></a>`
            )
            .join('')}
        </section>

        <section class="flex flex-col gap-3">
          <div class="flex items-center justify-between"><h3 class="font-serif text-headline-sm text-primary">${tr('Recepttáram', 'Colecția mea')}</h3><a href="#/kereses" class="text-label-md text-secondary hover:underline">${tr('Összes', 'Toate')} (${
            totalCount
          })</a></div>
          <div class="flex gap-1 bg-surface-container rounded-xl p-1 overflow-x-auto no-scrollbar" role="tablist">
            ${tabs
              .map(
                ([k, l]) =>
                  `<a role="tab" aria-selected="${
                    k === tab
                  }" href="#/profil?t=${k}" data-replace class="flex-1 py-2 px-2 rounded-lg text-center text-label-md whitespace-nowrap ${
                    k === tab
                      ? 'bg-surface-container-lowest shadow-sm text-primary'
                      : 'text-on-surface-variant'
                  }">${l}</a>`
              )
              .join('')}
          </div>
          <div class="flex flex-col gap-2.5">${(bodyMap[tab] || (() => ''))()}</div>
        </section>

        <section class="flex flex-col gap-2">
          <h3 class="text-title-md text-primary">${tr('Konyhai & Fiók beállítások', 'Setări bucătărie & cont')}</h3>
          <div class="bg-surface-container-lowest rounded-xl shadow-sm divide-y divide-outline-variant/30">
            <div class="w-full p-4 flex flex-wrap items-center justify-between gap-3 text-left">
              <div class="flex items-center gap-3 min-w-0">
                <span class="w-9 h-9 rounded-full bg-secondary-fixed/60 flex items-center justify-center shrink-0">${icon(
                  'translate',
                  'text-secondary'
                )}</span>
                <span class="min-w-0">
                  <span class="block text-title-md">${tr('Az oldal nyelve', 'Limba aplicației')}</span>
                  <span class="block text-body-sm text-on-surface-variant">${tr('Kiválasztva:', 'Selectată:')} <strong class="text-primary">${
                  S.lang === 'ro' ? 'Română (RO)' : 'Magyar (HU)'
                }</strong></span>
                </span>
              </div>
              <div class="inline-flex rounded-full bg-surface-container p-0.5 border border-outline-variant/30 shrink-0 ml-auto" role="group" aria-label="${tr('Nyelv kiválasztása', 'Selectează limba')}">
                <button type="button" data-act="pickLang" data-lang="hu" aria-pressed="${S.lang === 'hu'}" class="px-2.5 py-1 rounded-full text-label-sm font-semibold transition ${
                S.lang === 'hu'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-primary'
              }">Magyar</button>
                <button type="button" data-act="pickLang" data-lang="ro" aria-pressed="${S.lang === 'ro'}" class="px-2.5 py-1 rounded-full text-label-sm font-semibold transition ${
                S.lang === 'ro'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-primary'
              }">Română</button>
              </div>
            </div>
            ${
              hasSub()
                ? `<button type="button" data-act="portal" class="w-full p-4 flex items-center gap-3 text-left">
              <span class="w-9 h-9 rounded-full bg-secondary-fixed/60 flex items-center justify-center shrink-0">${icon(
                'credit_card',
                'text-secondary'
              )}</span>
              <span class="flex-1"><span class="block text-title-md">${tr('Előfizetés kezelése', 'Gestionează abonamentul')}</span><span class="block text-body-sm text-on-surface-variant">${tr('Számlázás, kártyaadatok és csomagmódosítás (Stripe Portal)', 'Facturare, card și modificare plan (Stripe Portal)')}</span></span>
              <span class="text-label-md text-secondary">${tr('Kezelés', 'Gestionare')}</span>${icon('chevron_right')}
            </button>`
                : `<a href="#/elofizetes" class="w-full p-4 flex items-center gap-3 text-left">
              <span class="w-9 h-9 rounded-full bg-secondary-fixed/60 flex items-center justify-center shrink-0">${icon(
                'credit_card',
                'text-secondary'
              )}</span>
              <span class="flex-1"><span class="block text-title-md">${tr('Előfizetés & Csomagok', 'Abonament & Planuri')}</span><span class="block text-body-sm text-on-surface-variant">${tr('Váltás Vebeat Prémium csomagra (ÁFA-val)', 'Treci la planul Vebeat Premium (TVA inclus)')}</span></span>
              <span class="text-label-md text-secondary">${tr('Előfizetés', 'Abonament')}</span>${icon('chevron_right')}
            </a>`
            }
            <a href="#/jogi/elallas" class="w-full p-4 flex items-center gap-3 text-left">
              <span class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center shrink-0">${icon(
                'assignment_return',
                'text-primary'
              )}</span>
              <span class="flex-1"><span class="block text-title-md">${tr('Elállás & Online lemondás', 'Drept de retragere & Anulare')}</span><span class="block text-body-sm text-on-surface-variant">${tr('OUG 34/2014 nyilatkozat és lemondási felület', 'Declarație OUG 34/2014 și anulare online')}</span></span>${icon(
                'chevron_right'
              )}
            </a>
            <a href="#/jogi/aszf" class="w-full p-4 flex items-center gap-3 text-left">
              <span class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center shrink-0">${icon(
                'gavel',
                'text-primary'
              )}</span>
              <span class="flex-1"><span class="block text-title-md">${tr('Jogi tudnivalók & ANPC SAL', 'Informații legale & ANPC SAL')}</span><span class="block text-body-sm text-on-surface-variant">${tr('ÁSZF, GDPR adatvédelem, sütik és cégadatok', 'Termeni, GDPR, cookies și date operator')}</span></span>${icon(
                'chevron_right'
              )}
            </a>
            <button role="switch" aria-checked="${
              S.wake
            }" data-act="wake" class="w-full p-4 flex items-center gap-3 text-left">
              <span class="w-9 h-9 rounded-full bg-primary-fixed/50 flex items-center justify-center shrink-0">${icon(
                'visibility',
                'text-primary'
              )}</span>
              <span class="flex-1"><span class="block text-title-md">${tr('Képernyő ébrentartása', 'Menține ecranul activ')}</span><span class="block text-body-sm text-on-surface-variant">${tr('Főzés közben aktív marad a kijelző', 'Ecranul rămâne pornit în timpul gătitului')}</span></span>
              <span class="w-11 h-6 rounded-full p-0.5 transition ${
                S.wake ? 'bg-secondary' : 'bg-surface-container-highest'
              }"><span class="block w-5 h-5 rounded-full bg-white shadow transition ${
                S.wake ? 'translate-x-5' : ''
              }"></span></span>
            </button>
            <button data-act="unit" class="w-full p-4 flex items-center gap-3 text-left">
              <span class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center shrink-0">${icon(
                'scale'
              )}</span>
              <span class="flex-1"><span class="block text-title-md">${tr('Mértékegységek', 'Unități de măsură')}</span><span class="block text-body-sm text-on-surface-variant">${
                S.unit === 'dkg'
                  ? tr('Magyar konyhai (dkg, dl)', 'Sistem tradițional (dkg, dl)')
                  : tr('Metrikus rendszer (g, ml)', 'Sistem metric (g, ml)')
              }</span></span>
              <span class="text-label-md text-secondary">${
                S.unit === 'dkg' ? 'dkg / dl' : 'g / ml'
              }</span>${icon('chevron_right')}
            </button>
            <button data-act="export" class="w-full p-4 flex items-center gap-3 text-left">
              <span class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center shrink-0">${icon(
                'download'
              )}</span>
              <span class="flex-1"><span class="block text-title-md">${tr('Adatok exportálása', 'Exportă datele')}</span><span class="block text-body-sm text-on-surface-variant">${tr('Biztonsági mentés JSON fájlba', 'Copie de siguranță în fișier JSON')}</span></span>${icon(
                'chevron_right'
              )}
            </button>
          </div>
        </section>
        <div class="flex flex-col items-center gap-1 pt-1">
          ${
            signedIn
              ? `<button data-act="logout" class="text-error text-title-md hover:underline flex items-center gap-1 py-1">${icon(
                  'logout',
                  'text-[20px]'
                )}${tr('Kijelentkezés a profilból', 'Deconectare din profil')}</button>`
              : ''
          }
          <p class="text-label-sm text-outline">Vebeat • Fuel your daily vibe.</p>
        </div>
      </div>`
      );
    }

    function viewAuth({ q }: { q: URLSearchParams }) {
      const reg = q.get('m') === 'reg';
      const returnSlug = q.get('return') || '';
      return `<div class="w-full max-w-lg mx-auto px-3.5 sm:px-6 pt-4 pb-6 flex flex-col gap-space-md">
        <header class="flex items-center justify-between">
          <button type="button" data-act="back" aria-label="${tr('Bezárás', 'Închide')}" class="w-10 h-10 rounded-full flex items-center justify-center bg-surface-container-high">${icon(
            'close',
            'text-[20px]'
          )}</button>
          <span class="flex items-center gap-1.5 bg-surface-container-low px-3.5 py-1.5 rounded-full shadow-sm">${icon(
            'verified_user',
            'fill text-secondary text-[18px]'
          )}<span class="text-label-sm uppercase tracking-wider text-primary">Clerk Auth • Vebeat</span></span>
          <a href="#/" class="w-10 h-10 rounded-full flex items-center justify-center bg-surface-container-low text-on-surface-variant">${icon(
            'home',
            'text-[20px]'
          )}</a>
        </header>

        <section class="rounded-xl bg-surface-container-low p-5 text-center flex flex-col items-center gap-1.5 relative overflow-hidden shadow-sm">
          <span class="w-12 h-12 rounded-full bg-secondary/10 text-secondary flex items-center justify-center">${icon(
            'workspace_premium',
            'fill text-[24px]'
          )}</span>
          <p class="text-label-sm tracking-wide text-secondary">Vebeat • Fuel your daily vibe.</p>
          <h1 class="font-serif text-headline-md text-primary">${
            reg ? tr('Fiók létrehozása', 'Creează cont') : tr('Bejelentkezés', 'Autentificare')
          }</h1>
          <p class="text-body-sm text-on-surface-variant max-w-xs">${
            reg
              ? tr('Hozd létre fiókodat a prémium receptek, a főzési memória és a Stripe előfizetés kezeléséhez!', 'Creează un cont pentru rețete premium, memorarea pașilor și gestionarea abonamentului Stripe!')
              : tr('Jelentkezz be a fiókodba az előfizetésed és a mentett receptjeid eléréséhez.', 'Conectează-te la contul tău pentru abonament și rețetele salvate.')
          }</p>
        </section>

        <div class="grid grid-cols-2 bg-surface-container-high rounded-full p-1" role="tablist">
          <a role="tab" aria-selected="${!reg}" href="#/belepes${
            returnSlug ? '?return=' + encodeURIComponent(returnSlug) : ''
          }" data-replace class="py-2 rounded-full text-center text-label-md ${
            !reg ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant'
          }">${tr('Bejelentkezés', 'Autentificare')}</a>
          <a role="tab" aria-selected="${reg}" href="#/belepes?m=reg${
            returnSlug ? '&return=' + encodeURIComponent(returnSlug) : ''
          }" data-replace class="py-2 rounded-full text-center text-label-md ${
            reg ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant'
          }">${tr('Regisztráció', 'Înregistrare')}</a>
        </div>

        ${
          clerkRef.current.enabled
            ? clerkRef.current.isSignedIn
              ? `<div class="bg-surface-container-lowest rounded-xl p-5 shadow-sm text-center border border-outline-variant/30 flex flex-col items-center gap-2">
                  <p class="text-title-md text-primary">${tr('Bejelentkezve, átirányítás...', 'Autentificat, redirecționare...')}</p>
                </div>`
              : ''
            : `<form data-form="auth" data-reg="${reg}" data-return="${esc(
                returnSlug
              )}" novalidate class="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col gap-3.5 border border-outline-variant/30">
                <p class="text-[11px] text-on-surface-variant bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant/30">${tr(
                  'Helyi fejlesztői belépési mód (amíg a Clerk éles kulcsok nincsenek beállítva).',
                  'Mod local de dezvoltare (până la configurarea cheilor live Clerk).'
                )}</p>
                ${
                  reg
                    ? `<label class="block bg-surface-container-low rounded-xl px-4 pt-2 pb-1.5 border border-transparent focus-within:border-secondary focus-within:bg-surface-container-lowest">
                  <span class="flex items-center gap-1 text-label-sm uppercase text-secondary">${icon(
                    'person',
                    'text-[15px]'
                  )}${tr('Teljes név', 'Nume complet')}</span>
                  <input id="name" name="name" type="text" required maxlength="60" autocomplete="name" placeholder="${tr('Teljes neved', 'Numele tău')}" class="w-full bg-transparent py-1 text-body-md focus:outline-none">
                </label>`
                    : ''
                }
                <label class="block bg-surface-container-low rounded-xl px-4 pt-2 pb-1.5 border border-transparent focus-within:border-secondary focus-within:bg-surface-container-lowest">
                  <span class="flex items-center gap-1 text-label-sm uppercase text-secondary">${icon(
                    'mail',
                    'text-[15px]'
                  )}${tr('E-mail cím', 'Adresă de e-mail')}</span>
                  <input id="email" name="email" type="email" required autocomplete="email" placeholder="${tr('eszter@vebeat.hu', 'elena@vebeat.ro')}" class="w-full bg-transparent py-1 text-body-md focus:outline-none">
                </label>
                <label class="block bg-surface-container-low rounded-xl px-4 pt-2 pb-1.5 border border-transparent focus-within:border-secondary focus-within:bg-surface-container-lowest">
                  <span class="flex items-center gap-1 text-label-sm uppercase text-secondary">${icon(
                    'lock',
                    'text-[15px]'
                  )}${tr('Jelszó', 'Parolă')}</span>
                  <input id="password" name="password" type="password" required minlength="8" autocomplete="${
                    reg ? 'new-password' : 'current-password'
                  }" placeholder="${tr('Legalább 8 karakter', 'Cel puțin 8 caractere')}" class="w-full bg-transparent py-1 text-body-md focus:outline-none">
                </label>
                <p id="autherr" role="alert" class="text-body-sm text-error min-h-[20px]"></p>
                <button class="h-[52px] rounded-xl bg-secondary text-on-secondary text-title-md flex items-center justify-center gap-2 shadow-md active:scale-[0.99]">${
                  reg ? tr('Fiók létrehozása & Folytatás', 'Creează cont & Continuă') : tr('Bejelentkezés a Recepttáramba', 'Autentificare în Colecție')
                } ${icon('arrow_forward')}</button>
              </form>`
        }
      </div>`;
    }

    function viewForm(r: any) {
      const v = r || {
        title: '',
        short: '',
        subtitle: '',
        description: '',
        image: '',
        prep: 10,
        cook: 20,
        kcal: '',
        servings: 2,
        difficulty: tr('Könnyű', 'Ușor'),
        tags: [],
        ingredients: [],
        steps: [],
        tip: null,
      };
      const ingText = (v.ingredients || [])
        .map((i: any) =>
          [i.qty == null ? '' : fmtNum(i.qty), i.qty == null ? '' : i.unit, i.name]
            .filter(Boolean)
            .join(' ')
        )
        .join('\n');
      const stepText = (v.steps || [])
        .map((s: any) => (s.title ? `${s.title}: ` : '') + s.text)
        .join('\n');
      const inp =
        'w-full bg-surface-container-lowest border border-outline-variant/60 rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/10';
      const lbl = (txt: string, inner: string, hint = '') =>
        `<label class="flex flex-col gap-1"><span class="text-label-md uppercase text-on-surface-variant">${txt}</span>${inner}${
          hint ? `<span class="text-body-sm text-outline">${hint}</span>` : ''
        }</label>`;
      return (
        titleHeader(r ? tr('Recept szerkesztése', 'Editează rețeta') : tr('Új recept', 'Rețetă nouă')) +
        `<form data-form="recipe" data-id="${esc(
          r?.id || ''
        )}" novalidate class="${NARROW_X} pt-4 pb-6 flex flex-col gap-4">
        ${lbl(
          tr('Recept neve *', 'Numele rețetei *'),
          `<input name="title" required maxlength="200" class="${inp}" value="${esc(
            v.title
          )}" placeholder="${tr('pl. Nagymama túrós csuszája', 'ex. Papanași pufoși cu smântână')}">`
        )}
        ${lbl(
          tr('Alcím', 'Subtitlu'),
          `<input name="subtitle" maxlength="200" class="${inp}" value="${esc(
            v.subtitle
          )}" placeholder="${tr('pl. pirított szalonnával, tejföllel', 'ex. cu dulceață de afine și smântână')}">`
        )}
        ${lbl(
          tr('Leírás', 'Descriere'),
          `<textarea name="description" rows="3" maxlength="1000" class="${inp}">${esc(
            v.description
          )}</textarea>`
        )}
        <div class="grid grid-cols-2 gap-3">
          ${lbl(
            tr('Előkészítés (perc)', 'Pregătire (min)'),
            `<input name="prep" type="number" min="0" max="1440" class="${inp}" value="${esc(
              v.prep
            )}">`
          )}
          ${lbl(
            tr('Főzés (perc)', 'Gătire (min)'),
            `<input name="cook" type="number" min="0" max="2880" class="${inp}" value="${esc(
              v.cook
            )}">`
          )}
          ${lbl(
            tr('Adag *', 'Porții *'),
            `<input name="servings" type="number" min="1" max="50" required class="${inp}" value="${esc(
              v.servings
            )}">`
          )}
          ${lbl(
            tr('Energia (kcal/adag)', 'Energie (kcal/porție)'),
            `<input name="kcal" type="number" min="0" max="5000" class="${inp}" value="${esc(
              v.kcal || ''
            )}">`
          )}
        </div>
        ${lbl(
          tr('Hozzávalók * (soronként egy)', 'Ingrediente * (câte unul pe rând)'),
          `<textarea name="ingredients" rows="5" class="${inp} font-mono text-body-sm" placeholder="${tr('500 g liszt\n2 db tojás', '500 g făină\n2 buc ouă')}">${esc(
            ingText
          )}</textarea>`
        )}
        ${lbl(
          tr('Elkészítés * (soronként egy lépés)', 'Mod de preparare * (un pas pe rând)'),
          `<textarea name="steps" rows="5" class="${inp} text-body-sm" placeholder="${tr('Tészta: Gyúrd össze a hozzávalókat.', 'Aluat: Amestecă ingredientele.')}">${esc(
            stepText
          )}</textarea>`
        )}
        ${lbl(
          tr('Kategória', 'Categorie'),
          `<select name="category" class="${inp}">
            ${CATEGORIES.map(
              c =>
                `<option value="${esc(c.name)}" ${
                  v.category === c.name || (v.tags || []).includes(c.name) ? 'selected' : ''
                }>${esc(trTag(c.name, S.lang))}</option>`
            ).join('')}
          </select>`
        )}
        <p id="formerr" role="alert" class="text-body-sm text-error min-h-[20px]"></p>
        <div class="flex flex-col-reverse sm:flex-row gap-2.5">
          <button type="button" data-act="back" class="w-full sm:w-auto min-h-[50px] px-5 py-2.5 rounded-xl bg-surface-container text-primary text-[15px] sm:text-title-md font-semibold hover:bg-surface-container-high active:scale-[0.98] transition">${tr('Mégse', 'Anulează')}</button>
          <button class="w-full sm:flex-1 min-h-[52px] px-4 py-2.5 rounded-xl bg-secondary text-on-secondary text-[15px] sm:text-title-lg font-semibold flex items-center justify-center gap-2 text-center leading-snug shadow-md active:scale-[0.98] transition">${icon(
            'save',
            'shrink-0'
          )}<span>${r ? tr('Változtatások mentése', 'Salvează modificările') : tr('Recept mentése', 'Salvează rețeta')}</span></button>
        </div>
      </form>`
      );
    }

    function viewNotFound() {
      return (
        titleHeader(tr('Nem található', 'Nu a fost găsit')) +
        `<div class="${NARROW_X} py-16 text-center"><p class="text-on-surface-variant">${tr('Ez a recept nem létezik vagy törölve lett.', 'Această rețetă nu există sau a fost ștearsă.')}</p><a href="#/" class="inline-block mt-4 text-secondary text-title-md">${tr('Vissza a főoldalra', 'Înapoi la pagina principală')}</a></div>`
      );
    }

    /* ---------- Form Helpers ---------- */
    const UNITS = [
      'g',
      'dkg',
      'kg',
      'ml',
      'cl',
      'dl',
      'l',
      'ek',
      'kk',
      'tk',
      'mk',
      'db',
      'gerezd',
      'csokor',
      'szelet',
      'csipet',
      'buc',
      'bucăți',
      'lingură',
      'linguri',
      'linguriță',
      'lingurițe',
      'căței',
      'cățel',
      'legătură',
      'felii',
      'felie',
      'cană',
      'praf',
    ];
    function parseIngredient(line: string) {
      const m = line.match(/^(\d+(?:[.,]\d+)?|\d+\/[1-9]\d*)\s+(.*)$/);
      if (!m) return { name: line, qty: null, unit: tr('ízlés szerint', 'după gust') };
      const qty = m[1].includes('/')
        ? m[1].split('/').reduce((a, b) => Number(a) / Number(b), 0)
        : parseFloat(m[1].replace(',', '.'));
      const [first, ...rest] = m[2].split(/\s+/);
      return UNITS.includes(first.toLowerCase().replace(/\.$/, '')) && rest.length
        ? { qty, unit: first, name: rest.join(' ') }
        : { qty, unit: '', name: m[2] };
    }
    function parseStep(line: string) {
      const c = line.indexOf(':');
      const [title, text] =
        c > 0 && c < 50 ? [line.slice(0, c).trim(), line.slice(c + 1).trim()] : ['', line];
      return { title, tag: '', text, timer: 0 };
    }

    function submitRecipe(form: HTMLFormElement) {
      const fd = new FormData(form),
        err = form.querySelector('#formerr')!;
      const lines = (k: string) =>
        String(fd.get(k) || '')
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean);
      const id = form.dataset.id;
      const title = String(fd.get('title') || '').trim();
      const ingredients = lines('ingredients').map(parseIngredient);
      const steps = lines('steps').map(parseStep);
      if (!title || !ingredients.length || !steps.length) {
        err.textContent = tr(
          'Kérlek add meg a recept nevét, hozzávalóit és lépéseit!',
          'Te rugăm să introduci numele, ingredientele și pașii rețetei!'
        );
        return;
      }
      const cat = String(fd.get('category') || CATEGORIES[0].name);
      const r = {
        id: id || uid(title),
        slug: id || uid(title),
        mine: true,
        is_free: true,
        category: cat,
        canonical_category: cat,
        title,
        short: title.slice(0, 50),
        subtitle: String(fd.get('subtitle') || ''),
        description: String(fd.get('description') || ''),
        image: 'assets/marhahusos-tal.png',
        author: activeUserName() || tr('Saját recept', 'Rețetă proprie'),
        prep: Number(fd.get('prep') || 10),
        cook: Number(fd.get('cook') || 15),
        kcal: Number(fd.get('kcal') || 320),
        servings: Math.max(1, Number(fd.get('servings') || 2)),
        difficulty: tr('Könnyű', 'Ușor'),
        tags: [cat, 'Saját receptjeim'],
        ingredients,
        steps,
      };
      S.mine = id ? S.mine.map((x: any) => (x.id === id ? r : x)) : [r, ...S.mine];
      save();
      toast(tr('Recept elmentve', 'Rețetă salvată'));
      goReplace(`#/r/${encodeURIComponent(r.id)}`);
    }

    async function submitAuth(form: HTMLFormElement) {
      const fd = new FormData(form),
        reg = form.dataset.reg === 'true',
        returnSlug = form.dataset.return || '',
        err = form.querySelector('#autherr')!;
      const email = String(fd.get('email') || '').trim(),
        pw = String(fd.get('password') || ''),
        name = String(fd.get('name') || '').trim();
      if (reg && name.length < 2) {
        err.textContent = tr(
          'Add meg a neved (legalább 2 karakter).',
          'Introdu numele tău (cel puțin 2 caractere).'
        );
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        err.textContent = tr('Érvénytelen e-mail cím.', 'Adresă de e-mail invalidă.');
        return;
      }
      if (pw.length < 8) {
        err.textContent = tr(
          'A jelszó legalább 8 karakter legyen.',
          'Parola trebuie să aibă cel puțin 8 caractere.'
        );
        return;
      }
      const userId =
        'user_' +
        norm(email)
          .replace(/[^a-z0-9]+/g, '_')
          .slice(0, 24);
      S.user = {
        id: userId,
        name: reg ? name : S.user?.email === email ? S.user.name : email.split('@')[0],
        email,
        bio: S.user?.bio || tr('Lelkes házi séf & Receptalkotó', 'Bucătar pasionat & Creator de rețete'),
      };
      save();
      await syncMeAndRecipes();
      toast(tr(`Üdvözlünk, ${S.user.name}!`, `Bun venit, ${S.user.name}!`));
      if (returnSlug === 'elofizetes') {
        goReplace('#/elofizetes');
      } else if (returnSlug) {
        goReplace(`#/r/${encodeURIComponent(returnSlug)}`);
      } else {
        goReplace('#/profil');
      }
    }

    function submitProfile(form: HTMLFormElement) {
      const fd = new FormData(form),
        name = String(fd.get('name') || '').trim();
      if (name.length < 2)
        return toast(tr('A név legalább 2 karakter legyen', 'Numele trebuie să aibă cel puțin 2 caractere'));
      S.user = {
        id: S.user?.id || 'user_' + norm(name).replace(/[^a-z0-9]+/g, '_'),
        name,
        bio: String(fd.get('bio') || '').trim(),
        email: String(fd.get('email') || '').trim(),
      };
      save();
      toast(tr('Profil mentve', 'Profil salvat'));
      goReplace('#/profil');
    }

    /* ---------- Actions ---------- */
    async function applyLanguage(nextLang: 'hu' | 'ro', showToast = true) {
      const changed = S.lang !== nextLang || !S.langSelected;
      S.lang = nextLang;
      S.langSelected = true;
      langMenuOpen = false;
      save();
      shoppingStore.syncFromApp(S.shopping, S.lang, S.unit);
      document.documentElement.lang = S.lang;
      if (location.search.includes('clear') || location.search.includes('lang=')) {
        const sp = new URLSearchParams(location.search);
        sp.delete('clear');
        const qs = sp.toString();
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
      }
      if (changed || !publicRecipes.length) {
        Object.keys(recipeDetailsCache).forEach(k => delete recipeDetailsCache[k]);
        await syncMeAndRecipes();
      }
      if (showToast) {
        toast(S.lang === 'ro' ? 'Limbă selectată: Română (RO)' : 'Kiválasztott nyelv: Magyar (HU)');
      }
      render(true);
    }

    const actions: Record<string, (el: HTMLElement, e: Event) => void> = {
      toggleLangMenu: () => {
        langMenuOpen = !langMenuOpen;
        render(true);
      },
      closeLangMenu: () => {
        langMenuOpen = false;
        render(true);
      },
      pickLang: el => {
        const chosen = el.dataset.lang === 'ro' ? 'ro' : 'hu';
        applyLanguage(chosen, true);
      },
      lang: () => {
        applyLanguage(S.lang === 'ro' ? 'hu' : 'ro', true);
      },
      back: () => {
        const rt = route();
        if (rt.p[0] === 'profil' && rt.q.get('edit') === '1') {
          goReplace(`#/profil?t=${encodeURIComponent(rt.q.get('t') || 'kedvencek')}`);
          return;
        }
        const cur = screenKey(location.hash || '#/');
        while (navHistory.length && screenKey(navHistory[navHistory.length - 1]) === cur)
          navHistory.pop();
        goReplace(navHistory.pop() || '#/');
      },
      scroll: (el, e) => {
        e.preventDefault();
        document
          .getElementById(el.dataset.target || 'ing')
          ?.scrollIntoView({ behavior: 'smooth' });
      },
      print: () => window.print(),
      plan: el => {
        selectedPlan = el.dataset.plan === 'yearly' ? 'yearly' : 'monthly';
        const rt = route();
        if (rt.p[0] === 'elofizetes') {
          const nextQ = new URLSearchParams(rt.q);
          nextQ.set('plan', selectedPlan);
          const nextHash = `#/elofizetes?${nextQ.toString()}`;
          lastSubPlanRouteKey = nextHash;
          history.replaceState(null, '', nextHash);
        }
        render(true);
      },
      subscribe: el => {
        const slug = el.dataset.slug || (route().p[0] === 'r' ? route().p[1] : '');
        startStripeCheckout(slug, selectedPlan);
      },
      portal: () => {
        openStripePortal('manage');
      },
      'portal-cancel': () => {
        openStripePortal('cancel');
      },
      fav: el => {
        const id = el.dataset.id!;
        S.favs = isFav(id) ? S.favs.filter(x => x !== id) : [id, ...S.favs];
        save();
        toast(
          isFav(id)
            ? tr('Mentve a kedvencek közé', 'Salvat la favorite')
            : tr('Eltávolítva a kedvencek közül', 'Eliminat de la favorite')
        );
        render(true);
      },
      check: el => {
        const id = route().p[1],
          i = +el.dataset.i!,
          list = S.checked[id] || [];
        S.checked[id] = list.includes(i) ? list.filter(x => x !== i) : [...list, i];
        save();
        render(true);
      },
      srv: el => {
        const r = get(route().p[1]);
        if (!r) return;
        S.servings[r.id] = Math.min(24, Math.max(1, servingsOf(r) + +el.dataset.d!));
        save();
        render(true);
      },
      'open-shop': () => {
        shoppingStore.openDrawer();
      },
      shop: el => {
        const r = get(route().p[1]);
        if (!r || !r.ingredients) return;
        const checked = S.checked[r.id] || [];
        const missingCount = r.ingredients.filter((_: any, i: number) => !checked.includes(i)).length;
        if (!missingCount) {
          return toast(tr('Minden hozzávaló ki van pipálva', 'Toate ingredientele sunt bifate'));
        }

        const servingsMultiplier = servingsOf(r) / (r.servings || 2);
        const result = mergeRecipeIngredientsIntoList({
          existing: S.shopping,
          ingredients: r.ingredients,
          checkedIndices: checked,
          recipeId: r.id,
          recipeTitle: r.short || r.title,
          servingsMultiplier,
          unitSystem: S.unit,
        });

        S.shopping = result.items;
        save();
        const changedTotal = result.addedCount + result.mergedCount;
        shoppingStore.syncFromApp(S.shopping, S.lang, S.unit, changedTotal > 0);

        // Lightweight GPU button transition to checkmark state
        const btn = (el.id === 'shop-add-btn'
          ? el
          : document.getElementById('shop-add-btn')) as HTMLButtonElement | null;
        if (btn) {
          const originalHtml = btn.innerHTML;
          if (shopBtnResetTimer) clearTimeout(shopBtnResetTimer);
          btn.classList.remove('shop-btn-added');
          void btn.offsetWidth;
          btn.classList.add('shop-btn-added');
          btn.innerHTML = `${icon('check_circle', 'fill text-[20px] text-secondary-fixed shrink-0')}<span>${
            result.addedCount > 0 && result.mergedCount > 0
              ? tr(
                  `${result.addedCount} új + ${result.mergedCount} összevont tétel!`,
                  `${result.addedCount} noi + ${result.mergedCount} cumulate!`
                )
              : result.addedCount > 0
                ? tr(
                    `${result.addedCount} tétel hozzáadva!`,
                    `${result.addedCount} articole adăugate!`
                  )
                : result.mergedCount > 0
                  ? tr(
                      `${result.mergedCount} tétel mennyisége frissítve!`,
                      `${result.mergedCount} cantități actualizate!`
                    )
                  : tr('Már szerepel a listán', 'Deja pe listă')
          }</span>`;
          shopBtnResetTimer = setTimeout(() => {
            if (btn.isConnected) {
              btn.classList.remove('shop-btn-added');
              btn.innerHTML = originalHtml;
            }
          }, 1600);
        }

        const summaryMsg =
          result.addedCount > 0 && result.mergedCount > 0
            ? tr(
                `${result.addedCount} új és ${result.mergedCount} összevont tétel a listán`,
                `${result.addedCount} noi și ${result.mergedCount} cumulate în listă`
              )
            : result.addedCount > 0
              ? tr(
                  `${result.addedCount} tétel a bevásárlólistán`,
                  `${result.addedCount} articole adăugate în listă`
                )
              : result.mergedCount > 0
                ? tr(
                    `${result.mergedCount} tétel mennyisége összeadva`,
                    `${result.mergedCount} cantități cumulate în listă`
                  )
                : tr('Már minden tétel a bevásárlólistán van', 'Toate articolele sunt deja pe listă');

        shoppingStore.showActionToast(summaryMsg, tr('Lista megnyitása', 'Vezi lista'));
      },
      'shop-fmt': el => {
        const fmt: ChecklistExportMode = el.dataset.fmt === 'markdown' ? 'markdown' : 'plain';
        shoppingStore.setExportMode(fmt);
        render(true);
      },
      keep: async () => {
        if (!S.shopping.length) return;
        shoppingStore.setExportMode('plain');
        const text = formatShoppingChecklist(S.shopping, {
          mode: 'plain',
          unitSystem: S.unit,
          includeChecked: false,
        });
        const box = document.getElementById('keepbox'),
          pre = document.getElementById('keeptext'),
          st = document.getElementById('keepstatus');
        if (box && pre) {
          pre.textContent = text;
          box.classList.remove('hidden');
          box.classList.add('flex');
        }
        try {
          await navigator.clipboard.writeText(text);
          if (st)
            st.textContent = tr(
              'Google Keep lista a vágólapon (illeszd be lista-jegyzetbe!)',
              'Listă Google Keep copiată în clipboard (lipește într-o listă!)'
            );
          toast(
            tr(
              'Pipálható lista a vágólapon – illeszd be a Google Keep-be!',
              'Listă copiată în clipboard – lipește în Google Keep!'
            )
          );
        } catch {
          toast(tr('Pipálható lista elkészült', 'Lista cu bife a fost generată'));
        }
      },
      'notes-share': async () => {
        if (!S.shopping.length) return;
        const mode = shoppingStore.getSnapshot().exportMode;
        const text = formatShoppingChecklist(S.shopping, {
          mode,
          unitSystem: S.unit,
          includeChecked: false,
        });
        const box = document.getElementById('keepbox'),
          pre = document.getElementById('keeptext'),
          st = document.getElementById('keepstatus');
        if (box && pre) {
          pre.textContent = text;
          box.classList.remove('hidden');
          box.classList.add('flex');
        }
        try {
          if (typeof navigator.share === 'function') {
            await navigator.share({ text });
          } else {
            await navigator.clipboard.writeText(text);
          }
        } catch {
          try {
            await navigator.clipboard.writeText(text);
          } catch {}
        }
        if (st)
          st.textContent =
            mode === 'markdown'
              ? tr(
                  'Markdown (- [ ]) pipálható lista a vágólapon (Notion / Obsidian)',
                  'Listă Markdown (- [ ]) copiată în clipboard (Notion / Obsidian)'
                )
              : tr(
                  'Tiszta soronkénti lista a vágólapon (Apple Notes / Keep)',
                  'Listă curată pe rânduri în clipboard (Apple Notes / Keep)'
                );
        toast(
          tr(
            'Bevásárlólista a vágólapon (Keep, Apple Notes, Notion)',
            'Listă copiată în clipboard (Keep, Apple Notes, Notion)'
          )
        );
      },
      'notes-dl': () => {
        if (!S.shopping.length) return;
        const mode = shoppingStore.getSnapshot().exportMode;
        const text = formatShoppingChecklist(S.shopping, {
          mode,
          unitSystem: S.unit,
          includeChecked: false,
        });
        const fileName = `vebeat-bevasarlolista-${new Date().toISOString().slice(0, 10)}.txt`;
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const a = Object.assign(document.createElement('a'), {
          href: URL.createObjectURL(blob),
          download: fileName,
        });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast(tr(`Bevásárlólista letöltve: ${fileName}`, `Listă descărcată: ${fileName}`));
      },
      resetprog: el => {
        const id = el.dataset.id!;
        delete S.progress[id];
        clearRecipeTimers(id);
        save();
        toast(tr('Főzési folyamat alaphelyzetbe állítva', 'Progresul de gătit a fost resetat'));
        render(true);
      },
      share: async () => {
        const r = get(route().p[1]);
        try {
          if (navigator.share) await navigator.share({ title: r?.title, url: location.href });
          else {
            await navigator.clipboard.writeText(location.href);
            toast(tr('Link a vágólapon', 'Link copiat în clipboard'));
          }
        } catch {}
      },
      del: el => {
        const id = el.dataset.id!;
        if (!confirm(tr('Biztosan törlöd ezt a receptet?', 'Sigur dorești să ștergi această rețetă?'))) return;
        S.mine = S.mine.filter((r: any) => r.id !== id);
        save();
        toast(tr('Recept törölve', 'Rețetă ștearsă'));
        goReplace('#/profil?t=sajat');
      },
      savenote: el => {
        const id = el.dataset.id!,
          val = (document.getElementById('rnote') as HTMLTextAreaElement)?.value.trim() || '';
        if (val) S.notes[id] = val;
        else delete S.notes[id];
        save();
        toast(
          val
            ? tr('Jegyzet elmentve', 'Notiță salvată')
            : tr('Jegyzet törölve', 'Notiță ștearsă')
        );
      },
      delnote: el => {
        delete S.notes[el.dataset.id!];
        save();
        toast(tr('Jegyzet törölve', 'Notiță ștearsă'));
        render(true);
      },
      timer: el => tToggle(el.dataset.key!, +el.dataset.total!),
      treset: el => {
        const t = T[el.dataset.key!];
        if (t) {
          clearInterval(t.iv);
          t.run = false;
          t.endAt = 0;
          t.left = t.total;
          syncTimer(el.dataset.key!);
          paintTimers();
        }
      },
      tplus: el => {
        const t = T[el.dataset.key!],
          sec = +(el.dataset.sec || 60);
        if (t) {
          t.left += sec;
          if (t.run) t.endAt += sec * 1000;
          t.total = Math.max(t.total, t.left);
          syncTimer(el.dataset.key!);
          paintTimers();
        }
      },
      cookdone: el => {
        const id = el.dataset.id!;
        S.cooked = [{ id, at: Date.now() }, ...S.cooked.filter(c => c.id !== id)].slice(0, 50);
        delete S.checked[id];
        delete S.progress[id];
        clearRecipeTimers(id);
        save();
        goReplace(`#/fozes/${encodeURIComponent(id)}/kesz`);
      },
      shoptoggle: el => {
        const id = el.dataset.id!;
        S.shopping = S.shopping.map(it => (it.id === id ? { ...it, checked: !it.checked } : it));
        save();
        shoppingStore.syncFromApp(S.shopping, S.lang, S.unit);
        render(true);
      },
      shopqty: el => {
        const id = el.dataset.id!;
        const dir: 1 | -1 = Number(el.dataset.d) < 0 ? -1 : 1;
        S.shopping = applySymmetricQtyStep(S.shopping, id, dir, S.unit);
        save();
        shoppingStore.syncFromApp(S.shopping, S.lang, S.unit);
        render(true);
      },
      shopremove: el => {
        const id = el.dataset.id!;
        S.shopping = S.shopping.filter(it => it.id !== id);
        save();
        shoppingStore.syncFromApp(S.shopping, S.lang, S.unit);
        render(true);
      },
      shopclearchecked: () => {
        S.shopping = S.shopping.filter(it => !it.checked);
        save();
        shoppingStore.syncFromApp(S.shopping, S.lang, S.unit);
        render(true);
      },
      shopdel: el => {
        S.shopping.splice(+el.dataset.i!, 1);
        save();
        shoppingStore.syncFromApp(S.shopping, S.lang, S.unit);
        render(true);
      },
      shopclear: () => {
        if (confirm(tr('Törlöd a teljes bevásárlólistát?', 'Ștergi întreaga listă de cumpărături?'))) {
          S.shopping = [];
          save();
          shoppingStore.syncFromApp(S.shopping, S.lang, S.unit);
          render(true);
        }
      },
      shopcopy: async () => {
        try {
          const text = formatShoppingChecklist(S.shopping, {
            mode: shoppingStore.getSnapshot().exportMode,
            unitSystem: S.unit,
            includeChecked: false,
          });
          await navigator.clipboard.writeText(text);
          toast(tr('Pipálható lista a vágólapon', 'Lista cu bife a fost copiată'));
        } catch {
          toast(tr('A másolás nem sikerült', 'Copierea a eșuat'));
        }
      },
      wake: () => {
        S.wake = !S.wake;
        save();
        if (route().p[0] === 'fozes') {
          wakeOn();
          toast(
            S.wake
              ? tr('Képernyő ébrentartása bekapcsolva', 'Menținere ecran activată')
              : tr('Képernyőzár normál módban', 'Blocare ecran normală')
          );
        } else render(true);
      },
      unit: () => {
        S.unit = S.unit === 'dkg' ? 'metric' : 'dkg';
        S.shopping = normalizeStoredShoppingList(S.shopping, S.unit);
        save();
        shoppingStore.syncFromApp(S.shopping, S.lang, S.unit);
        toast(
          S.unit === 'dkg'
            ? tr('Mértékegység: dkg / dl', 'Unități: dkg / dl')
            : tr('Mértékegység: g / ml', 'Unități: g / ml')
        );
        render(true);
      },
      export: () => {
        const blob = new Blob(
          [
            JSON.stringify(
              {
                app: 'vebeat',
                version: 3,
                mine: S.mine,
                favs: S.favs,
                cooked: S.cooked,
                shopping: S.shopping,
                notes: S.notes,
              },
              null,
              2
            ),
          ],
          { type: 'application/json' }
        );
        const a = Object.assign(document.createElement('a'), {
          href: URL.createObjectURL(blob),
          download: `vebeat-receptek-${new Date().toISOString().slice(0, 10)}.json`,
        });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
      logout: async () => {
        if (clerkRef.current.enabled && clerkRef.current.isSignedIn) {
          await clerkRef.current.signOut();
        }
        S.user = null;
        currentSubscriptionStatus = 'free';
        currentSubscriptionEnd = null;
        Object.keys(recipeDetailsCache).forEach(k => delete recipeDetailsCache[k]);
        save();
        toast(tr('Kijelentkeztél', 'Te-ai deconectat'));
        render(true);
      },
      cookieAll: () => {
        S.cookieConsent = 'all';
        cookiePrefsOpen = false;
        save();
        toast(tr('Cookie beállítások mentve (mind elfogadva)', 'Preferințe cookies salvate (toate acceptate)'));
        render(true);
      },
      cookieEssential: () => {
        S.cookieConsent = 'essential';
        cookiePrefsOpen = false;
        save();
        toast(tr('Csak a szükséges sütik aktívak', 'Doar stocarea strict esențială este activă'));
        render(true);
      },
      openCookiePrefs: () => {
        cookiePrefsOpen = true;
        render(true);
      },
      'gdpr-delete-local': () => {
        if (
          !confirm(
            tr(
              'Biztosan törlöd az összes helyi adatodat (kedvencek, jegyzetek, bevásárlólista, saját receptek) erről az eszközről?',
              'Sigur dorești să ștergi toate datele locale (favorite, notițe, listă cumpărături, rețete proprii) de pe acest dispozitiv?'
            )
          )
        )
          return;
        const keepLang = S.lang;
        localStorage.removeItem(KEY);
        S = { ...DEF, lang: keepLang, langSelected: true, cookieConsent: 'essential' };
        save();
        shoppingStore.syncFromApp([], S.lang, S.unit);
        toast(tr('Minden helyi személyes adat törölve (GDPR 17. cikk)', 'Toate datele locale au fost șterse (GDPR art. 17)'));
        goReplace('#/');
      },
    };

    const onChange = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset?.consent === 'terms') subConsentTerms = Boolean(el.checked);
      else if (el.dataset?.consent === 'waiver') subConsentWaiver = Boolean(el.checked);
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const rep = target.closest('a[data-replace], #filterchips a');
      if (rep && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        goReplace(rep.getAttribute('href')!);
        return;
      }
      const el = target.closest<HTMLElement>('[data-act]');
      if (el && actions[el.dataset.act!]) actions[el.dataset.act!](el, e);
    };

    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      e.preventDefault();
      if (f.dataset.form === 'search') {
        const q = String(new FormData(f).get('q') || '').trim(),
          inp = f.querySelector<HTMLElement>('[data-filter]');
        const filter = inp?.dataset.filter,
          sez = inp?.dataset.sez;
        location.hash =
          '#/kereses?' +
          new URLSearchParams({
            ...(sez && { szezonalis: '1' }),
            ...(q && { q }),
            ...(filter && { f: filter }),
          });
      } else if (f.dataset.form === 'recipe') submitRecipe(f);
      else if (f.dataset.form === 'auth') submitAuth(f);
      else if (f.dataset.form === 'profile') submitProfile(f);
      else if (f.dataset.form === 'withdrawal') {
        const fd = new FormData(f);
        const fullName = String(fd.get('fullName') || '').trim();
        const email = String(fd.get('email') || '').trim();
        const kind = String(fd.get('kind') || 'cancel');
        const reason = String(fd.get('reason') || '').trim();
        const errEl = document.getElementById('withdraw-err');
        const outEl = document.getElementById('withdraw-result');
        if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          if (errEl)
            errEl.textContent = tr(
              'Kérlek add meg a neved és egy érvényes e-mail címet.',
              'Te rugăm să introduci numele complet și o adresă de e-mail validă.'
            );
          return;
        }
        if (errEl) errEl.textContent = '';
        const refId = 'VB-' + Date.now().toString(36).toUpperCase();
        const bodyText =
          S.lang === 'ro'
            ? `Către Vebeat Digital S.R.L. (contact@vebeat.ro)\nReferință: ${refId}\nData: ${new Date().toLocaleDateString('ro-RO')}\nSolicitant: ${fullName} (${email})\nTip cerere: ${
                kind === 'withdraw'
                  ? 'Retragere din contract la distanță (OUG 34/2014)'
                  : 'Anulare reînnoire automată abonament'
              }\nDetalii: ${reason || '-'}`
            : `Címzett: Vebeat Digital S.R.L. (contact@vebeat.ro)\nAzonosító: ${refId}\nDátum: ${new Date().toLocaleDateString('hu-HU')}\nIgénylő: ${fullName} (${email})\nTípus: ${
                kind === 'withdraw'
                  ? 'Elállási nyilatkozat (OUG 34/2014)'
                  : 'Előfizetés automatikus megújításának lemondása'
              }\nMegjegyzés: ${reason || '-'}`;
        if (outEl) {
          outEl.classList.remove('hidden');
          outEl.classList.add('flex');
          outEl.innerHTML = `<p class="text-label-md text-primary">${tr(
            'Nyilatkozat elkészült',
            'Declarație pregătită'
          )} (${esc(refId)})</p>
          <pre class="text-[11px] font-mono bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant/30 whitespace-pre-wrap">${esc(
            bodyText
          )}</pre>
          <a href="mailto:contact@vebeat.ro?subject=${encodeURIComponent(
            `Vebeat ${refId}`
          )}&body=${encodeURIComponent(
            bodyText
          )}" class="min-h-[44px] px-4 py-2.5 rounded-lg bg-secondary text-on-secondary text-[13px] sm:text-label-md font-semibold flex items-center justify-center gap-1.5 text-center leading-snug shadow-sm">${icon(
            'send',
            'text-[16px] shrink-0'
          )}<span>${tr('Küldés e-mailben (contact@vebeat.ro)', 'Trimite pe e-mail (contact@vebeat.ro)')}</span></a>`;
        }
        toast(tr(`Nyilatkozat elkészült: ${refId}`, `Declarație pregătită: ${refId}`));
      }
    };

    const onInput = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (el.id === 'sq') {
        const f = el.dataset.filter || '',
          sez = el.dataset.sez || '';
        const resEl = document.getElementById('results');
        if (resEl) resEl.innerHTML = results(el.value, f, Boolean(sez));
        const href = (filter: string) =>
          `#/kereses?${new URLSearchParams({
            ...(sez && { szezonalis: '1' }),
            ...(el.value && { q: el.value }),
            ...(filter && { f: filter }),
          })}`;
        const fcEl = document.getElementById('filterchips');
        if (fcEl) {
          fcEl.innerHTML =
            chip(tr('Összes', 'Toate'), !f, href('')) +
            Object.keys(FILTERS)
              .map(k => chip(trTag(k, S.lang), f === k, href(f === k ? '' : k)))
              .join('');
        }
        history.replaceState(null, '', href(f));
        recordNav(href(f));
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && langMenuOpen) {
        langMenuOpen = false;
        render(true);
      }
    };

    $app.addEventListener('click', onClick);
    $app.addEventListener('change', onChange);
    $app.addEventListener('submit', onSubmit);
    $app.addEventListener('input', onInput);
    window.addEventListener('keydown', onKeyDown);

    async function render(keepScroll = false) {
      document.documentElement.lang = S.lang;
      const y = window.scrollY,
        rt = route(),
        [page, id, extra] = rt.p;
      if (!keepScroll) recordNav(location.hash || '#/');

      const isCheckoutSuccess =
        rt.q.get('checkout') === 'success' || Boolean(pendingCheckoutRef.current?.active);

      if (isCheckoutSuccess && isAuthReady()) {
        const checkoutSessionId =
          rt.q.get('session_id') || pendingCheckoutRef.current?.sessionId || '';
        pendingCheckoutRef.current = { active: false, sessionId: '' };

        // Clean checkout & session_id query params only AFTER auth has hydrated, preserving pathname + search
        const cleanParams = new URLSearchParams(rt.q);
        cleanParams.delete('session_id');
        cleanParams.delete('checkout');
        const cleanQs = cleanParams.toString();
        const cleanHash = `#/${rt.p.join('/')}${cleanQs ? '?' + cleanQs : ''}`;
        history.replaceState(null, '', `${location.pathname}${location.search}${cleanHash}`);

        Object.keys(recipeDetailsCache).forEach(k => delete recipeDetailsCache[k]);
        await syncMeAndRecipes(checkoutSessionId, true);

        // Handle redirect-vs-webhook race condition with bounded short backoff if not yet active
        if (isUserSignedIn() && !hasSub()) {
          for (let attempt = 0; attempt < 2 && !hasSub() && !cancelled; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 900));
            if (cancelled) return;
            await syncMeAndRecipes(checkoutSessionId, true);
          }
        }
        Object.keys(recipeDetailsCache).forEach(k => delete recipeDetailsCache[k]);

        if (hasSub()) {
          toast(
            tr(
              'Sikeres előfizetés! Minden prémium recept feloldva.',
              'Abonament reușit! Toate rețetele premium sunt deblocate.'
            )
          );
        } else if (!isUserSignedIn()) {
          toast(
            tr(
              'Kérlek jelentkezz be az előfizetés aktiválásához.',
              'Te rugăm să te autentifici pentru activarea abonamentului.'
            )
          );
        }
      } else if (rt.q.get('checkout') === 'canceled' && isAuthReady()) {
        const cleanParams = new URLSearchParams(rt.q);
        cleanParams.delete('checkout');
        const cleanQs = cleanParams.toString();
        const cleanHash = `#/${rt.p.join('/')}${cleanQs ? '?' + cleanQs : ''}`;
        history.replaceState(null, '', `${location.pathname}${location.search}${cleanHash}`);
        toast(
          tr(
            'A fizetési folyamat megszakadt.',
            'Procesul de plată a fost anulat.'
          )
        );
      }

      let html = '',
        tab = '',
        showTabs = true,
        showFooter = true;

      if (!S.langSelected || (isCheckoutSuccess && !isAuthReady())) {
        html =
          brandHeader() +
          `<div class="${PAGE_X} py-24 flex flex-col items-center justify-center gap-3 text-center text-on-surface-variant">
            ${icon('progress_activity', 'animate-spin text-secondary text-[28px]')}
            <p class="text-body-sm">${tr('Betöltés...', 'Se încarcă...')}</p>
          </div>`;
      } else if (!page) {
        html = viewHome();
        tab = 'home';
      } else if (page === 'kereses') {
        html = viewSearch(rt);
        tab = rt.q.get('szezonalis') === '1' ? 'szezonalis' : 'kereses';
      } else if (page === 'r' || page === 'fozes') {
        let r = recipeDetailsCache[id];
        if (!r) {
          $app.innerHTML =
            brandHeader() +
            `<div class="${PAGE_X} py-20 text-center text-on-surface-variant">${tr('Recept ellenőrzése és betöltése a szerverről...', 'Se verifică și se încarcă rețeta de pe server...')}</div>`;
          r = await fetchRecipeDetail(id);
        }
        if (page === 'r') {
          html = r ? viewRecipe(r) : viewNotFound();
          showTabs = !r;
        } else {
          html = r ? viewCook(r, extra) : viewNotFound();
          showTabs = !r;
          showFooter = false;
        }
      } else if (page === 'elofizetes') {
        html = viewSubscription(rt);
        tab = 'profil';
      } else if (page === 'jogi') {
        const secList: LegalSection[] = ['aszf', 'adatvedelem', 'sutik', 'elallas', 'kapcsolat'];
        const sec: LegalSection = secList.includes(id as LegalSection)
          ? (id as LegalSection)
          : 'aszf';
        const legal = viewLegalContent(sec, S.lang, {
          cookieConsent: S.cookieConsent,
          userEmail: (clerkRef.current.enabled && clerkRef.current.email) || S.user?.email || null,
          userName: activeUserName(),
          hasSub: hasSub(),
        });
        html = titleHeader(legal.pageTitle) + legal.bodyHtml;
      } else if (page === 'uj') {
        html = viewForm(null);
        tab = 'uj';
      } else if (page === 'szerk') {
        const r = S.mine.find((x: any) => x.id === id);
        html = r ? viewForm(r) : viewNotFound();
      } else if (page === 'profil') {
        html = viewProfile(rt);
        tab = 'profil';
      } else if (page === 'belepes') {
        html = viewAuth(rt);
        showTabs = false;
        showFooter = false;
      } else {
        html = viewNotFound();
      }

      if (showFooter) {
        html += siteFooterHtml(S.lang);
      }
      if (S.langSelected && (!S.cookieConsent || cookiePrefsOpen)) {
        html += cookieBannerHtml(S.lang);
      }

      const mountClerkAuth =
        clerkRef.current.enabled &&
        S.langSelected &&
        page === 'belepes' &&
        !clerkRef.current.isSignedIn;
      const clerkReg = rt.q.get('m') === 'reg';
      setClerkAuthView(prev =>
        prev.open === mountClerkAuth && prev.reg === clerkReg
          ? prev
          : { open: mountClerkAuth, reg: clerkReg }
      );

      $app.classList.toggle('pb-28', S.langSelected && !mountClerkAuth);
      $app.classList.toggle('pb-2', mountClerkAuth);
      $app.innerHTML = html;
      const tabLabels: Record<string, string> =
        S.lang === 'ro'
          ? {
              home: 'Descoperă',
              szezonalis: 'De sezon',
              uj: 'Rețetă nouă',
              kereses: 'Categorii',
              profil: 'Colecție',
            }
          : {
              home: 'Felfedezés',
              szezonalis: 'Szezonális',
              uj: 'Új recept',
              kereses: 'Kategóriák',
              profil: 'Gyűjtemény',
            };
      const tabbar = document.getElementById('tabbar');
      if (tabbar) {
        tabbar.style.display = showTabs ? '' : 'none';
        tabbar.setAttribute('aria-label', tr('Fő navigáció', 'Navigare principală'));
      }
      document.querySelectorAll<HTMLElement>('#tabbar [data-tab]').forEach(a => {
        const dt = a.dataset.tab || '';
        const on = dt === tab;
        const lblEl = a.querySelector<HTMLElement>('[data-tablabel]');
        if (lblEl && tabLabels[dt]) lblEl.textContent = tabLabels[dt];
        if (dt !== 'uj') {
          a.classList.toggle('text-primary', on);
          a.classList.toggle('font-bold', on);
          a.classList.toggle('text-on-surface-variant', !on);
          a.querySelector('.material-symbols-outlined')?.classList.toggle('fill', on);
        } else {
          a.setAttribute('aria-label', tabLabels.uj);
        }
        if (on) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      const r = S.langSelected && (page === 'r' || page === 'fozes') && get(id);
      document.title = !S.langSelected
        ? 'Vebeat – Fuel your daily vibe.'
        : r
          ? `${r.short || r.title} – Vebeat`
          : tr('Vebeat – Fuel your daily vibe.', 'Vebeat – Fuel your daily vibe.');
      if (S.langSelected && page === 'fozes' && extra !== 'kesz') wakeOn();
      else wakeOff();
      window.scrollTo(0, keepScroll ? y : 0);
    }

    const onHashChange = () => {
      langMenuOpen = false;
      render();
    };
    window.addEventListener('hashchange', onHashChange);
    navigator.serviceWorker?.register('/sw.js').catch(() => {});

    // Initial load: resolve visitor language automatically via IP geo lookup on first visit,
    // wait for Clerk session hydration when enabled, then sync profile & recipes.
    let cancelled = false;

    const finishBoot = async () => {
      if (cancelled) return;
      if (clerkRef.current.enabled && !clerkRef.current.isLoaded) {
        render();
        return;
      }
      const rtInit = route();
      const isCheckoutReturn =
        rtInit.q.get('checkout') === 'success' || Boolean(pendingCheckoutRef.current?.active);

      if (!isCheckoutReturn) {
        await syncMeAndRecipes('', isUserSignedIn());
        if (cancelled) return;
      }
      const rtAfter = route();
      if (clerkRef.current.enabled && clerkRef.current.isSignedIn && rtAfter.p[0] === 'belepes') {
        const ret = rtAfter.q.get('return') || '';
        goReplace(
          ret === 'elofizetes'
            ? '#/elofizetes'
            : ret
              ? `#/r/${encodeURIComponent(ret)}`
              : '#/profil'
        );
      } else {
        render();
      }
    };

    if (S.langSelected) {
      save();
      finishBoot();
    } else {
      render();
      fetch('/api/geo', { signal: AbortSignal.timeout(1500) })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (!cancelled && data && (data.lang === 'ro' || data.lang === 'hu')) {
            S.lang = data.lang;
          }
        })
        .catch(() => {})
        .finally(() => {
          if (cancelled) return;
          S.langSelected = true;
          document.documentElement.lang = S.lang;
          save();
          if (location.search.includes('clear')) {
            const sp = new URLSearchParams(location.search);
            sp.delete('clear');
            const qs = sp.toString();
            history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
          }
          finishBoot();
        });
    }

    return () => {
      cancelled = true;
      if (shopBtnResetTimer) clearTimeout(shopBtnResetTimer);
      shoppingStore.registerAppBridge(null);
      setClerkAuthView({ open: false, reg: false });
      $app.removeEventListener('click', onClick);
      $app.removeEventListener('change', onChange);
      $app.removeEventListener('submit', onSubmit);
      $app.removeEventListener('input', onInput);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [clerk.isLoaded, clerk.isSignedIn, clerk.userId, clerk.email, clerk.fullName]);

  return (
    <div className="w-full min-h-[100dvh] relative bg-surface">
      {clerk.enabled && (
        <div ref={clerkMountRef} className="hidden">
          {clerk.renderUserButton()}
        </div>
      )}
      <main id="app" ref={appRef} className="pb-28"></main>
      {clerk.enabled && clerkAuthView.open && (
        <div className="w-full max-w-lg mx-auto px-3.5 sm:px-6 pb-12">
          {clerk.isLoaded ? (
            clerkAuthView.reg ? (
              clerk.renderSignUp()
            ) : (
              clerk.renderSignIn()
            )
          ) : (
            <div className="bg-surface-container-lowest rounded-xl p-6 text-center text-body-sm text-on-surface-variant shadow-sm border border-outline-variant/30">
              Clerk betöltése...
            </div>
          )}
        </div>
      )}
      <nav
        id="tabbar"
        className="fixed-bottom-bar z-40 pb-safe bg-surface-container-lowest/95 backdrop-blur-md border-t border-outline-variant/40 shadow-[0_-4px_20px_rgba(44,62,45,0.06)]"
        aria-label="Fő navigáció"
      >
        <div className="max-w-xl mx-auto px-1 sm:px-4 flex justify-around items-center h-[68px] sm:h-[72px]">
          <a
            href="#/"
            data-tab="home"
            className="flex-1 min-w-0 py-1.5 flex flex-col items-center justify-center gap-0.5 text-center text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">explore</span>
            <span data-tablabel className="text-[10px] sm:text-label-sm leading-tight truncate max-w-full px-0.5">Felfedezés</span>
          </a>
          <a
            href="#/kereses?szezonalis=1"
            data-tab="szezonalis"
            className="flex-1 min-w-0 py-1.5 flex flex-col items-center justify-center gap-0.5 text-center text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">nest_eco_leaf</span>
            <span data-tablabel className="text-[10px] sm:text-label-sm leading-tight truncate max-w-full px-0.5">Szezonális</span>
          </a>
          <a
            href="#/uj"
            data-tab="uj"
            aria-label="Új recept"
            className="flex-1 min-w-0 flex flex-col items-center justify-center -mt-3.5"
          >
            <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-secondary text-on-secondary flex items-center justify-center shadow-md shrink-0">
              <span className="material-symbols-outlined text-[22px] sm:text-[24px]">add</span>
            </span>
            <span data-tablabel className="text-[10px] sm:text-label-sm text-secondary mt-0.5 leading-tight truncate max-w-full px-0.5">Új recept</span>
          </a>
          <a
            href="#/kereses"
            data-tab="kereses"
            className="flex-1 min-w-0 py-1.5 flex flex-col items-center justify-center gap-0.5 text-center text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">menu_book</span>
            <span data-tablabel className="text-[10px] sm:text-label-sm leading-tight truncate max-w-full px-0.5">Kategóriák</span>
          </a>
          <a
            href="#/profil"
            data-tab="profil"
            className="flex-1 min-w-0 py-1.5 flex flex-col items-center justify-center gap-0.5 text-center text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">bookmark</span>
            <span data-tablabel className="text-[10px] sm:text-label-sm leading-tight truncate max-w-full px-0.5">Gyűjtemény</span>
          </a>
        </div>
      </nav>
      <ShoppingDrawerAndToast />
      <div className="fixed-floating-overlay bottom-24 z-50 px-4 flex justify-center pointer-events-none">
        <div
          id="toast"
          role="status"
          aria-live="polite"
          className="max-w-md px-4 py-2 rounded-full bg-primary text-on-primary text-label-md text-center shadow-lg opacity-0 transition-opacity"
        ></div>
      </div>
    </div>
  );
}
