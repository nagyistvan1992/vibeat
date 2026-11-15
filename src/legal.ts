export type LegalSection = 'aszf' | 'adatvedelem' | 'sutik' | 'elallas' | 'kapcsolat';

const esc = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)
  );

export const PLANS = {
  hu: {
    monthly: {
      priceLabel: '2 490 Ft / hó',
      vatNote: 'ÁFA-val együtt • Automatikusan megújuló havi előfizetés',
      shortLabel: '2 490 Ft/hó',
      currency: 'huf',
    },
    yearly: {
      priceLabel: '19 900 Ft / év',
      vatNote: 'ÁFA-val együtt (~1 658 Ft / hó, -33%) • Éves előfizetés',
      shortLabel: '19 900 Ft/év',
      currency: 'huf',
    },
  },
  ro: {
    monthly: {
      priceLabel: '29,99 Lei / lună',
      vatNote: 'TVA inclus • Abonament lunar recurent, fără angajament',
      shortLabel: '29,99 Lei/lună',
      currency: 'ron',
    },
    yearly: {
      priceLabel: '239,99 Lei / an',
      vatNote: 'TVA inclus (~20 Lei / lună, -33%) • Abonament anual recurent',
      shortLabel: '239,99 Lei/an',
      currency: 'ron',
    },
  },
} as const;

export const LEGAL_OPERATOR = {
  brand: 'Vebeat',
  slogan: 'Fuel your daily vibe.',
  company: {
    hu: 'Vebeat Digital S.R.L. (cégadat-sablon – élesítéskor cégkivonat szerint kitöltendő)',
    ro: 'S.C. Vebeat Digital S.R.L. (șablon date fiscale – de completat conform certificatului constatator ONRC)',
  },
  cui: '[RO ________ – CUI / Cod fiscal]',
  regCom: '[J__/____/20__ – Nr. Reg. Com.]',
  address: {
    hu: '[Székhely címe, Irányítószám, Város, Románia]',
    ro: '[Adresă sediu social completă, Cod poștal, Localitate, România]',
  },
  email: 'contact@vebeat.ro',
  phone: '+40 700 000 000',
  hours: {
    hu: 'Hétfő – Péntek, 09:00 – 17:00 (EET)',
    ro: 'Luni – Vineri, 09:00 – 17:00 (EET)',
  },
  caen: '4791 / 6312 / 5819',
};

/**
 * Mandatory ANPC SAL badge (Ordinul ANPC nr. 449/2022).
 * Note: EU ODR/SOL platform (ec.europa.eu/consumers/odr) was permanently discontinued
 * on July 20, 2025 under Regulation (EU) 2024/3228 & Ordinul ANPC 270/2026 and MUST NOT be shown.
 */
export function anpcSalBadgeHtml(lang: 'hu' | 'ro'): string {
  const tr = (hu: string, ro: string) => (lang === 'ro' ? ro : hu);
  return `<div class="flex flex-col gap-2">
    <a href="https://reclamatiisal.anpc.ro" target="_blank" rel="noopener noreferrer" aria-label="${tr(
      'ANPC – Alternatív Vitarendezés (SAL)',
      'ANPC – Soluționarea Alternativă a Litigiilor (SAL)'
    )}" class="inline-flex items-center gap-3 rounded-xl border border-[#1a3b7c]/30 bg-white px-3.5 py-2.5 shadow-sm hover:shadow transition group">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 42" class="w-14 h-9 shrink-0" aria-hidden="true">
        <rect x="1" y="1" width="62" height="40" rx="6" fill="#003399" stroke="#d4af37" stroke-width="1.5"/>
        <rect x="1" y="1" width="62" height="10" rx="5" fill="#1a4bb8"/>
        <text x="32" y="9" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="7" font-weight="700" letter-spacing="0.8">ANPC</text>
        <text x="32" y="27" text-anchor="middle" fill="#ffd447" font-family="sans-serif" font-size="14" font-weight="800" letter-spacing="1.2">SAL</text>
        <text x="32" y="36" text-anchor="middle" fill="#dbe7ff" font-family="sans-serif" font-size="4.6" font-weight="600">reclamatiisal.anpc.ro</text>
      </svg>
      <span class="min-w-0 flex-1 text-left">
        <span class="block text-label-md text-[#003399] font-bold leading-tight group-hover:underline">ANPC – SAL (${tr(
          'Alternatív Vitarendezés',
          'Soluționarea Alternativă a Litigiilor'
        )})</span>
        <span class="block text-[11px] text-on-surface-variant leading-snug mt-0.5">${tr(
          'Hivatalos fogyasztói panaszportál: reclamatiisal.anpc.ro',
          'Portal oficial ANPC pentru consumatori: reclamatiisal.anpc.ro'
        )}</span>
      </span>
      <span class="material-symbols-outlined text-[18px] text-[#003399] shrink-0" aria-hidden="true">open_in_new</span>
    </a>
    <p class="text-[11px] text-on-surface-variant leading-snug flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <a href="https://anpc.ro" target="_blank" rel="noopener noreferrer" class="underline text-primary font-medium hover:text-secondary">ANPC (anpc.ro)</a>
      <span>•</span>
      <span>${tr('Fogyasztóvédelmi vonal', 'Telefonul Consumatorilor')}: <strong>021-9551</strong></span>
    </p>
  </div>`;
}

export function siteFooterHtml(lang: 'hu' | 'ro'): string {
  const tr = (hu: string, ro: string) => (lang === 'ro' ? ro : hu);
  return `<footer class="mt-10 border-t border-outline-variant/40 bg-surface-container-low/80 no-print">
    <div class="max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-6 pb-8 flex flex-col gap-5 text-body-sm text-on-surface-variant">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <a href="#/" class="flex items-center gap-1.5">
          <span class="material-symbols-outlined text-secondary text-[20px]" aria-hidden="true">local_dining</span>
          <span class="font-serif text-title-md text-primary leading-none">Vebeat</span>
        </a>
        <span class="text-label-sm text-secondary">Fuel your daily vibe.</span>
      </div>

      <div class="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 gap-5">
        <nav aria-label="${tr('Gyors navigáció', 'Navigare rapidă')}" class="flex flex-col gap-1.5">
          <span class="text-label-sm uppercase tracking-wider text-primary mb-0.5">${tr('Oldalak', 'Pagini')}</span>
          <a href="#/" class="hover:text-primary hover:underline py-0.5">${tr('Felfedezés', 'Descoperă')}</a>
          <a href="#/kereses" class="hover:text-primary hover:underline py-0.5">${tr('Kategóriák & Keresés', 'Categorii & Căutare')}</a>
          <a href="#/kereses?szezonalis=1" class="hover:text-primary hover:underline py-0.5">${tr('Szezonális receptek', 'Rețete de sezon')}</a>
          <a href="#/elofizetes" class="hover:text-primary hover:underline font-semibold text-secondary py-0.5">${tr('Vebeat Prémium', 'Vebeat Premium')}</a>
          <a href="#/profil" class="hover:text-primary hover:underline py-0.5">${tr('Profil & Gyűjtemény', 'Profil & Colecție')}</a>
        </nav>
        <nav aria-label="${tr('Jogi dokumentumok', 'Informații legale')}" class="flex flex-col gap-1.5">
          <span class="text-label-sm uppercase tracking-wider text-primary mb-0.5">${tr('Jogi megfelelőség (RO/UE)', 'Conformitate legală (RO/UE)')}</span>
          <a href="#/jogi/aszf" class="hover:text-primary hover:underline py-0.5">${tr('ÁSZF & Feltételek', 'Termeni și Condiții')}</a>
          <a href="#/jogi/adatvedelem" class="hover:text-primary hover:underline py-0.5">${tr('Adatvédelem (GDPR)', 'Confidențialitate (GDPR)')}</a>
          <a href="#/jogi/sutik" class="hover:text-primary hover:underline py-0.5">${tr('Cookie tájékoztató', 'Politica de Cookies')}</a>
          <a href="#/jogi/elallas" class="hover:text-primary hover:underline py-0.5">${tr('Elállás & Lemondás', 'Retragere & Anulare')}</a>
          <a href="#/jogi/kapcsolat" class="hover:text-primary hover:underline py-0.5">${tr('Üzemeltető & Kapcsolat', 'Date Firmă & Contact')}</a>
        </nav>
        <div class="min-[360px]:col-span-2 md:col-span-1 rounded-xl bg-surface-container-lowest/90 border border-outline-variant/30 p-3.5 text-[11px] leading-relaxed flex flex-col gap-1">
          <p class="font-semibold text-primary">${esc(LEGAL_OPERATOR.company[lang])}</p>
          <p>CUI: ${esc(LEGAL_OPERATOR.cui)} • Reg. Com.: ${esc(LEGAL_OPERATOR.regCom)}</p>
          <p>${tr('Székhely', 'Sediu social')}: ${esc(LEGAL_OPERATOR.address[lang])}</p>
          <p>E-mail: <a href="mailto:${LEGAL_OPERATOR.email}" class="underline text-primary break-all">${LEGAL_OPERATOR.email}</a> • Tel: ${LEGAL_OPERATOR.phone}</p>
        </div>
      </div>

      ${anpcSalBadgeHtml(lang)}

      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-outline-variant/25 text-[11px]">
        <span>© ${new Date().getFullYear()} Vebeat • ${tr('Minden jog fenntartva.', 'Toate drepturile rezervate.')}</span>
        <button type="button" data-act="openCookiePrefs" class="underline text-primary hover:text-secondary font-medium py-1">${tr(
          'Cookie beállítások módosítása',
          'Preferințe Cookies'
        )}</button>
      </div>
    </div>
  </footer>`;
}

export function cookieBannerHtml(lang: 'hu' | 'ro'): string {
  const tr = (hu: string, ro: string) => (lang === 'ro' ? ro : hu);
  return `<aside id="cookie-banner" role="dialog" aria-label="${tr(
    'Cookie és adatvédelmi hozzájárulás',
    'Consimțământ Cookies și GDPR'
  )}" class="fixed-floating-overlay bottom-[82px] sm:bottom-[88px] z-50 px-3 sm:px-6 pointer-events-none no-print">
    <div class="max-w-lg mx-auto bg-surface-container-lowest border border-primary/25 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 pointer-events-auto">
      <div class="flex items-start gap-2.5">
        <span class="w-9 h-9 rounded-full bg-secondary-fixed text-secondary flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true">cookie</span>
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-serif text-title-md text-primary leading-tight">${tr(
            'Adatvédelem & Sütik (GDPR / Legea 506/2004)',
            'Confidențialitate & Cookies (GDPR / Legea 506/2004)'
          )}</p>
          <p class="text-[12px] text-on-surface-variant leading-relaxed mt-1">${tr(
            'A Vebeat alapvető sütiket és böngészőtárolót használ a bejelentkezéshez, a nyelvhez és a Stripe fizetéshez. Az opcionális kényelmi beállítások csak az engedélyeddel aktiválódnak.',
            'Vebeat folosește stocare strict necesară pentru autentificare, limba aleasă și plata securizată Stripe. Preferințele opționale se activează doar cu acordul tău explicit.'
          )}</p>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" data-act="cookieEssential" class="min-h-[42px] px-3 rounded-xl bg-surface-container text-primary text-label-md hover:bg-surface-container-high transition">${tr(
          'Csak szükségesek',
          'Doar esențiale'
        )}</button>
        <button type="button" data-act="cookieAll" class="min-h-[42px] px-3 rounded-xl bg-primary text-on-primary text-label-md shadow-sm hover:opacity-95 transition">${tr(
          'Összes elfogadása',
          'Acceptă toate'
        )}</button>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-on-surface-variant pt-0.5">
        <a href="#/jogi/sutik" class="underline text-secondary font-medium">${tr(
          'Részletes Cookie & GDPR beállítások',
          'Setări detaliate & Politica de Cookies'
        )}</a>
        <a href="#/jogi/adatvedelem" class="underline hover:text-primary">${tr('Adatvédelmi tájékoztató', 'Confidențialitate')}</a>
      </div>
    </div>
  </aside>`;
}

export function viewLegalContent(
  section: LegalSection,
  lang: 'hu' | 'ro',
  opts: {
    cookieConsent: 'all' | 'essential' | null;
    userEmail?: string | null;
    userName?: string | null;
    hasSub: boolean;
  }
): { pageTitle: string; bodyHtml: string } {
  const tr = (hu: string, ro: string) => (lang === 'ro' ? ro : hu);
  const plans = PLANS[lang];
  const tabs: [LegalSection, string][] = [
    ['aszf', tr('ÁSZF', 'Termeni')],
    ['adatvedelem', tr('GDPR', 'GDPR')],
    ['sutik', tr('Sütik', 'Cookies')],
    ['elallas', tr('Elállás (OUG 34)', 'Retragere (OUG 34)')],
    ['kapcsolat', tr('Cégadatok', 'Contact & Firmă')],
  ];

  const navPills = `<nav aria-label="${tr('Jogi menü', 'Meniu legal')}" class="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
    ${tabs
      .map(
        ([k, lbl]) => `<a href="#/jogi/${k}" data-replace class="px-3 py-1.5 rounded-full text-label-md whitespace-nowrap transition ${
          k === section
            ? 'bg-primary text-on-primary shadow-sm'
            : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
        }">${esc(lbl)}</a>`
      )
      .join('')}
  </nav>`;

  const box = (title: string, iconName: string, inner: string) =>
    `<section class="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-2">
      <h2 class="font-serif text-title-lg text-primary flex items-center gap-2"><span class="material-symbols-outlined text-secondary text-[20px]" aria-hidden="true">${iconName}</span>${title}</h2>
      <div class="text-body-sm text-on-surface-variant leading-relaxed flex flex-col gap-2">${inner}</div>
    </section>`;

  if (section === 'aszf') {
    return {
      pageTitle: tr('Általános Szerződési Feltételek', 'Termeni și Condiții'),
      bodyHtml: `<div class="max-w-4xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 pb-6 flex flex-col gap-4">
        ${navPills}
        ${box(
          tr('1. Szolgáltató adatai (Legea 365/2002)', '1. Datele Operatorului (Legea nr. 365/2002)'),
          'apartment',
          `<p>${tr(
            `A Vebeat platformot üzemelteti: <strong>${esc(LEGAL_OPERATOR.company.hu)}</strong>.`,
            `Platforma Vebeat este operată de: <strong>${esc(LEGAL_OPERATOR.company.ro)}</strong>.`
          )}</p>
          <p>CUI: ${esc(LEGAL_OPERATOR.cui)} • Reg. Com.: ${esc(LEGAL_OPERATOR.regCom)}<br>${tr(
            'Székhely',
            'Sediu social'
          )}: ${esc(LEGAL_OPERATOR.address[lang])}<br>E-mail: <a href="mailto:${
            LEGAL_OPERATOR.email
          }" class="underline text-primary">${LEGAL_OPERATOR.email}</a> • Tel: ${LEGAL_OPERATOR.phone}</p>`
        )}
        ${box(
          tr('2. Szolgáltatás, árak és ÁFA (OUG 34/2014)', '2. Servicii, prețuri cu TVA și abonament (OUG 34/2014)'),
          'payments',
          `<p>${tr(
            'A Vebeat ingyenes és Prémium digitális receptgyűjteményt, interaktív főzési módot és bevásárlólistát nyújt online hozzáféréssel.',
            'Vebeat oferă acces digital la colecția de rețete gratuite și Premium, modul interactiv de gătit cu cronometre și liste de cumpărături.'
          )}</p>
          <ul class="list-disc pl-5 flex flex-col gap-1">
            <li><strong>${tr('Havi Prémium csomag', 'Abonament Premium Lunar')}:</strong> ${esc(
              plans.monthly.priceLabel
            )} (${esc(plans.monthly.vatNote)})</li>
            <li><strong>${tr('Éves Prémium csomag', 'Abonament Premium Anual')}:</strong> ${esc(
              plans.yearly.priceLabel
            )} (${esc(plans.yearly.vatNote)})</li>
          </ul>
          <p>${tr(
            'A fizetés a Stripe biztonságos felületén keresztül történik bankkártyával. Az előfizetés a választott ciklus végén automatikusan megújul, és bármikor büntetés nélkül lemondható a Profil → Előfizetés kezelése menüben.',
            'Plata se realizează securizat cu cardul prin Stripe. Abonamentul se reînnoiește automat la finalul perioadei alese și poate fi anulat oricând fără penalități din Profil → Gestionează abonamentul sau prin funcția online de anulare.'
          )}</p>`
        )}
        ${box(
          tr('3. Elállási jog digitális tartalomnál (OUG 34/2014 art. 16 lit. m)', '3. Dreptul de retragere pentru conținut digital (OUG 34/2014 art. 16 lit. m)'),
          'assignment_return',
          `<p>${tr(
            'A fogyasztót főszabály szerint 14 naptári napos elállási jog illeti meg. Az OUG 34/2014 16. cikk m) pontja alapján azonban a nem tárgyi adathordozón nyújtott digitális tartalom (azonnali Prémium recept-hozzáférés) esetén az elállási jog megszűnik, ha a teljesítés a fogyasztó előzetes, kifejezett hozzájárulásával és annak tudomásulvételével kezdődött meg, hogy elveszíti elállási jogát.',
            'Conform OUG nr. 34/2014, consumatorul beneficiază în mod obișnuit de 14 zile calendaristice pentru retragere. Totuși, potrivit art. 16 lit. m) din OUG nr. 34/2014, furnizarea de conținut digital care nu este livrat pe un suport material (acces imediat la rețetele Premium) este exceptată de la dreptul de retragere odată ce prestarea a început cu acordul prealabil expres al consumatorului și confirmarea că a luat cunoștință că își pierde dreptul de retragere.'
          )}</p>
          <p><a href="#/jogi/elallas" class="underline text-secondary font-semibold">${tr(
            'Online elállási és lemondási űrlap megnyitása →',
            'Accesează formularul online de retragere și anulare →'
          )}</a></p>`
        )}
        ${box(
          tr('4. Vitarendezés – ANPC SAL (Ordinul ANPC 449/2022 & Reg. UE 2024/3228)', '4. Soluționarea litigiilor – ANPC SAL (Ordinul ANPC 449/2022 & Reg. UE 2024/3228)'),
          'gavel',
          `<p>${tr(
            'Fogyasztói jogvita esetén békés egyeztetéshez fordulhatsz ügyfélszolgálatunkhoz, illetve az Országos Fogyasztóvédelmi Hatóság Alternatív Vitarendezési Igazgatóságához (ANPC – SAL): https://reclamatiisal.anpc.ro.',
            'În cazul oricărei neînțelegeri, ne poți contacta direct pentru soluționare amiabilă sau poți apela la Direcția de Soluționare Alternativă a Litigiilor din cadrul ANPC: https://reclamatiisal.anpc.ro.'
          )}</p>
          <p class="text-[12px] text-outline">${tr(
            'Megjegyzés: Az Európai Bizottság SOL/ODR platformja 2025. július 20-án az (EU) 2024/3228 rendelet és a 270/2026-os ANPC rendelet alapján megszűnt.',
            'Notă legală: Platforma europeană SOL/ODR a fost închisă definitiv la 20 iulie 2025 conform Regulamentului (UE) 2024/3228 și Ordinului ANPC nr. 270/2026.'
          )}</p>
          ${anpcSalBadgeHtml(lang)}`
        )}
      </div>`,
    };
  }

  if (section === 'adatvedelem') {
    return {
      pageTitle: tr('Adatvédelmi tájékoztató (GDPR)', 'Politica de Confidențialitate (GDPR)'),
      bodyHtml: `<div class="max-w-4xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 pb-6 flex flex-col gap-4">
        ${navPills}
        ${box(
          tr('1. Adatkezelő és jogalapok (Reg. UE 2016/679 & Legea 190/2018)', '1. Operator de date și temeiuri legale (GDPR & Legea 190/2018)'),
          'shield_person',
          `<p>${tr(
            `Adatkezelő: <strong>${esc(LEGAL_OPERATOR.company.hu)}</strong> (${LEGAL_OPERATOR.email}).`,
            `Operator de date cu caracter personal: <strong>${esc(LEGAL_OPERATOR.company.ro)}</strong> (${LEGAL_OPERATOR.email}).`
          )}</p>
          <ul class="list-disc pl-5 flex flex-col gap-1">
            <li><strong>${tr('Fiók & hitelesítés (Clerk)', 'Cont și autentificare (Clerk)')}:</strong> ${tr(
              'név, e-mail cím, felhasználói azonosító — szerződés teljesítése (GDPR 6. cikk (1) b)).',
              'nume, adresă e-mail, ID utilizator — executarea contractului (art. 6 alin. (1) lit. b) GDPR).'
            )}</li>
            <li><strong>${tr('Előfizetés & számlázás (Stripe)', 'Abonament și facturare (Stripe)')}:</strong> ${tr(
              'előfizetési státusz, Stripe ügyfél-azonosító, számlázási időszak (a kártyaadatokat kizárólag a PCI-DSS tanúsított Stripe kezeli) — szerződés és számviteli jogi kötelezettség (GDPR 6. cikk (1) b), c)).',
              'status abonament, ID client Stripe, dată expirare (datele cardului sunt procesate exclusiv de Stripe, certificat PCI-DSS) — executarea contractului și obligații fiscale (art. 6 alin. (1) lit. b), c) GDPR).'
            )}</li>
            <li><strong>${tr('Helyi főzési adatok', 'Preferințe locale în browser')}:</strong> ${tr(
              'kedvencek, jegyzetek, bevásárlólista, saját receptek és választott nyelv a saját eszközödön tárolva.',
              'rețete favorite, notițe, listă de cumpărături, rețete proprii și limba selectată stocate pe dispozitivul tău.'
            )}</li>
          </ul>`
        )}
        ${box(
          tr('2. Érintetti jogok & Adathordozhatóság / Törlés', '2. Drepturile tale GDPR, Export & Ștergere'),
          'privacy_tip',
          `<p>${tr(
            'Jogod van az adatokhoz való hozzáféréshez, helyesbítéshez, törléshez („elfeledtetés”), korlátozáshoz, adathordozhatósághoz és tiltakozáshoz (GDPR 15–22. cikkek).',
            'Ai dreptul de acces, rectificare, ștergere („dreptul de a fi uitat”), restricționare, portabilitate a datelor și opoziție (art. 15–22 GDPR).'
          )}</p>
          <div class="grid grid-cols-1 gap-2 pt-1">
            <button type="button" data-act="export" class="h-10 px-3 rounded-lg bg-primary text-on-primary text-label-md flex items-center justify-center gap-1.5">
              <span class="material-symbols-outlined text-[18px]" aria-hidden="true">download</span>
              ${tr('Saját adatok letöltése (GDPR JSON export)', 'Descarcă datele mele (Export portabilitate GDPR JSON)')}
            </button>
            <button type="button" data-act="gdpr-delete-local" class="h-10 px-3 rounded-lg bg-error-container text-on-error-container text-label-md flex items-center justify-center gap-1.5">
              <span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete_forever</span>
              ${tr('Helyi adatok törlése erről az eszközről', 'Șterge toate datele locale de pe acest dispozitiv')}
            </button>
          </div>
          <p class="text-[12px] pt-1">${tr(
            'Szerveroldali fiók végleges törléséhez írj a contact@vebeat.ro címre vagy használd a Clerk profilkezelőt.',
            'Pentru ștergerea definitivă a contului de pe server (Clerk / Postgres), ne poți scrie la contact@vebeat.ro.'
          )}</p>`
        )}
        ${box(
          tr('3. Felügyeleti hatóság (ANSPDCP)', '3. Autoritatea Națională de Supraveghere (ANSPDCP)'),
          'balance',
          `<p>${tr(
            'Panaszt nyújthatsz be a román Nemzeti Adatvédelmi Hatóságnál (ANSPDCP): B-dul G-ral. Gheorghe Magheru 28-30, Sector 1, București • <a href="https://www.dataprotection.ro" target="_blank" rel="noopener noreferrer" class="underline text-primary">dataprotection.ro</a>.',
            'Poți depune plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP): B-dul G-ral. Gheorghe Magheru 28-30, Sector 1, București • <a href="https://www.dataprotection.ro" target="_blank" rel="noopener noreferrer" class="underline text-primary">dataprotection.ro</a>.'
          )}</p>`
        )}
      </div>`,
    };
  }

  if (section === 'sutik') {
    const consentLabel =
      opts.cookieConsent === 'all'
        ? tr('Minden süti és preferencia engedélyezve', 'Toate cookie-urile acceptate')
        : opts.cookieConsent === 'essential'
          ? tr('Csak a működéshez szükségesek aktívak', 'Doar stocare strict esențială activă')
          : tr('Még nincs kiválasztva', 'Neselectat încă');
    return {
      pageTitle: tr('Cookie tájékoztató & Beállítások', 'Politica de Cookies & Preferințe'),
      bodyHtml: `<div class="max-w-4xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 pb-6 flex flex-col gap-4">
        ${navPills}
        ${box(
          tr('Aktuális hozzájárulási állapotod (Legea 506/2004)', 'Statusul consimțământului tău (Legea nr. 506/2004)'),
          'cookie',
          `<p>${tr('Jelenlegi beállítás:', 'Preferință curentă:')} <strong class="text-primary">${esc(consentLabel)}</strong></p>
          <ul class="list-disc pl-5 flex flex-col gap-1">
            <li><strong>${tr('Szigorúan szükséges (mindig aktív)', 'Strict necesare (întotdeauna active)')}:</strong> ${tr(
              'Clerk bejelentkezési munkamenet, Stripe fizetési biztonság, kiválasztott nyelv (HU/RO), bevásárlólista és aktív főzési időzítők.',
              'sesiune autentificare Clerk, securitate plată Stripe, limba aleasă (RO/HU), listă cumpărături și cronometre de gătit.'
            )}</li>
            <li><strong>${tr('Opcionális kényelmi & analitika (opt-in)', 'Preferințe opționale & analiză (opt-in)')}:</strong> ${tr(
              'csak az előzetes engedélyed után aktiválódik a receptajánló minőségének javításához.',
              'se activează exclusiv cu acordul tău prealabil pentru îmbunătățirea experienței culinare.'
            )}</li>
          </ul>
          <div class="grid grid-cols-2 gap-2 pt-2">
            <button type="button" data-act="cookieEssential" class="h-10 px-3 rounded-xl bg-surface-container text-primary text-label-md hover:bg-surface-container-high">${tr(
              'Csak szükségesek',
              'Doar esențiale'
            )}</button>
            <button type="button" data-act="cookieAll" class="h-10 px-3 rounded-xl bg-secondary text-on-secondary text-label-md shadow-sm">${tr(
              'Összes elfogadása',
              'Acceptă toate'
            )}</button>
          </div>`
        )}
      </div>`,
    };
  }

  if (section === 'elallas') {
    return {
      pageTitle: tr('Elállási jog & Lemondás', 'Drept de retragere & Anulare'),
      bodyHtml: `<div class="max-w-4xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 pb-6 flex flex-col gap-4">
        ${navPills}
        ${box(
          tr('Gyors előfizetés-lemondás (OUG 34/2014 & EU 2023/2673)', 'Anulare rapidă abonament (OUG 34/2014 & Directiva UE 2023/2673)'),
          'cancel',
          `<p>${tr(
            'Az automatikus megújulást bármikor leállíthatod 1 kattintással a Stripe Ügyfélportálon keresztül, extra költségek nélkül.',
            'Poți opri reînnoirea automată a abonamentului oricând cu 1 click prin Portalul de Client Stripe, fără penalități.'
          )}</p>
          ${
            opts.hasSub
              ? `<button type="button" data-act="portal-cancel" class="h-11 px-4 rounded-xl bg-error text-on-error text-title-md flex items-center justify-center gap-1.5 shadow-sm">
                  <span class="material-symbols-outlined text-[20px]" aria-hidden="true">cancel</span>
                  ${tr('Előfizetés azonnali lemondása (Stripe Portal)', 'Anulează abonamentul acum (Stripe Portal)')}
                </button>`
              : `<p class="text-[12px] bg-surface-container-low rounded-lg p-3">${tr(
                  'Jelenleg nincs aktív fizetős előfizetésed.',
                  'Momentan nu ai un abonament plătit activ.'
                )} <a href="#/elofizetes" class="underline text-secondary font-semibold">${tr(
                  'Előfizetési csomagok →',
                  'Vezi planurile Premium →'
                )}</a></p>`
          }`
        )}
        <section class="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
          <div>
            <h2 class="font-serif text-title-lg text-primary flex items-center gap-2"><span class="material-symbols-outlined text-secondary text-[20px]" aria-hidden="true">edit_document</span>${tr(
              'Online elállási nyilatkozat (OUG 34/2014 melléklet)',
              'Formular online de retragere / solicitare rambursare (Anexa OUG 34/2014)'
            )}</h2>
            <p class="text-body-sm text-on-surface-variant mt-1">${tr(
              'Töltsd ki az alábbi nyilatkozatot, ha a szerződéskötéstől számított 14 napon belül elállási vagy visszatérítési kérelmet kívánsz benyújtani:',
              'Completează declarația de mai jos dacă dorești să exerciți retragerea sau să soliciți anularea în termen de 14 zile:'
            )}</p>
          </div>
          <form data-form="withdrawal" novalidate class="flex flex-col gap-3">
            <label class="flex flex-col gap-1">
              <span class="text-label-sm uppercase text-on-surface-variant">${tr('Teljes név *', 'Nume complet *')}</span>
              <input name="fullName" required maxlength="80" value="${esc(
                opts.userName || ''
              )}" placeholder="${tr('pl. Teljes neved', 'ex. Numele complet')}" class="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40">
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-label-sm uppercase text-on-surface-variant">${tr('Fiók e-mail címe *', 'E-mail cont *')}</span>
              <input name="email" type="email" required value="${esc(
                opts.userEmail || ''
              )}" placeholder="${tr('nev@pelda.ro', 'nume@exemplu.ro')}" class="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40">
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-label-sm uppercase text-on-surface-variant">${tr('Kérelem típusa', 'Tip solicitare')}</span>
              <select name="kind" class="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40">
                <option value="cancel">${tr('Jövőbeli megújulás lemondása', 'Anulare reînnoire abonament')}</option>
                <option value="withdraw">${tr('14 napon belüli elállás (OUG 34/2014)', 'Retragere din contract în 14 zile (OUG 34/2014)')}</option>
              </select>
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-label-sm uppercase text-on-surface-variant">${tr('Megjegyzés (opcionális)', 'Detalii (opțional)')}</span>
              <textarea name="reason" rows="2" maxlength="400" class="w-full p-3 rounded-lg bg-surface-container-low border border-outline-variant/40"></textarea>
            </label>
            <p id="withdraw-err" role="alert" class="text-body-sm text-error"></p>
            <button class="h-11 rounded-xl bg-primary text-on-primary text-title-md flex items-center justify-center gap-2 shadow-sm">
              <span class="material-symbols-outlined text-[18px]" aria-hidden="true">description</span>
              ${tr('Nyilatkozat elkészítése & Küldése', 'Generează & Pregătește declarația')}
            </button>
          </form>
          <div id="withdraw-result" class="hidden rounded-xl bg-surface-container-low border border-secondary/30 p-3 flex-col gap-2"></div>
        </section>
      </div>`,
    };
  }

  // 'kapcsolat'
  return {
    pageTitle: tr('Üzemeltetői adatok & Kapcsolat', 'Date Firmă & Contact'),
    bodyHtml: `<div class="max-w-4xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 pb-6 flex flex-col gap-4">
      ${navPills}
      ${box(
        tr('Üzemeltető azonosító adatai (Legea 365/2002)', 'Date de identificare comerciant (Legea nr. 365/2002)'),
        'storefront',
        `<p><strong>${tr('Cégnév', 'Denumire societate')}:</strong> ${esc(LEGAL_OPERATOR.company[lang])}</p>
         <p><strong>CUI / CIF:</strong> ${esc(LEGAL_OPERATOR.cui)}</p>
         <p><strong>${tr('Cégjegyzékszám', 'Nr. Registrul Comerțului')}:</strong> ${esc(LEGAL_OPERATOR.regCom)}</p>
         <p><strong>CAEN:</strong> ${esc(LEGAL_OPERATOR.caen)}</p>
         <p><strong>${tr('Székhely', 'Sediu social')}:</strong> ${esc(LEGAL_OPERATOR.address[lang])}</p>
         <p><strong>E-mail:</strong> <a href="mailto:${LEGAL_OPERATOR.email}" class="underline text-primary">${LEGAL_OPERATOR.email}</a></p>
         <p><strong>${tr('Telefon', 'Telefon')}:</strong> ${LEGAL_OPERATOR.phone} (${esc(LEGAL_OPERATOR.hours[lang])})</p>`
      )}
      ${box(
        tr('Fogyasztóvédelem – ANPC & SAL (Románia)', 'Protecția Consumatorilor – ANPC & SAL'),
        'verified_user',
        `${anpcSalBadgeHtml(lang)}`
      )}
    </div>`,
  };
}
