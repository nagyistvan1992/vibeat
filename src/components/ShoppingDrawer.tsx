import React, { useEffect, useRef, useState } from 'react';
import {
  formatShoppingChecklist,
  formatShoppingQty,
  getSymmetricStep,
  shoppingStore,
  useShoppingList,
  type ChecklistExportMode,
  type ShoppingItem,
} from '../shoppingList';

export function ShoppingDrawerAndToast() {
  const {
    items,
    totalCount,
    uncheckedCount,
    drawerOpen,
    pulseSeq,
    lang,
    unit,
    exportMode,
    actionToast,
  } = useShoppingList();

  const [customInput, setCustomInput] = useState('');
  const [exportStatus, setExportStatus] = useState<'idle' | 'keep' | 'notes'>('idle');
  const [showPreview, setShowPreview] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const tr = (hu: string, ro: string) => (lang === 'ro' ? ro : hu);

  // Strict background scroll-lock with desktop scrollbar compensation & mobile touch-bleed guard
  useEffect(() => {
    if (!drawerOpen) {
      setShowPreview(false);
      return;
    }

    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const scrollbarWidth = Math.max(0, window.innerWidth - htmlEl.clientWidth);
    const fixedBars = Array.from(document.querySelectorAll<HTMLElement>('.fixed-bottom-bar'));

    const prevHtmlOverflow = htmlEl.style.overflow;
    const prevHtmlOverscroll = htmlEl.style.overscrollBehavior;
    const prevBodyOverflow = bodyEl.style.overflow;
    const prevBodyOverscroll = bodyEl.style.overscrollBehavior;
    const prevBodyPaddingRight = bodyEl.style.paddingRight;
    const prevBarPaddings = fixedBars.map(el => el.style.paddingRight);

    htmlEl.style.overflow = 'hidden';
    htmlEl.style.overscrollBehavior = 'none';
    bodyEl.style.overflow = 'hidden';
    bodyEl.style.overscrollBehavior = 'none';

    if (scrollbarWidth > 0) {
      const computedBodyPad = parseFloat(window.getComputedStyle(bodyEl).paddingRight) || 0;
      bodyEl.style.paddingRight = `${computedBodyPad + scrollbarWidth}px`;
      fixedBars.forEach(el => {
        const computedBarPad = parseFloat(window.getComputedStyle(el).paddingRight) || 0;
        el.style.paddingRight = `${computedBarPad + scrollbarWidth}px`;
      });
    }

    const focusTimer = setTimeout(() => closeBtnRef.current?.focus(), 50);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        shoppingStore.closeDrawer();
      }
    };

    // Prevent iOS/Android touch scroll-chaining outside the internal list scroll container
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const scrollEl = listScrollRef.current;
      const target = e.target as Node | null;
      if (!scrollEl || !target || !scrollEl.contains(target)) {
        e.preventDefault();
        return;
      }
      if (scrollEl.scrollHeight <= scrollEl.clientHeight) {
        e.preventDefault();
        return;
      }
      if (e.touches.length === 1) {
        const deltaY = e.touches[0].clientY - touchStartY;
        const atTop = scrollEl.scrollTop <= 0 && deltaY > 0;
        const atBottom =
          scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1 && deltaY < 0;
        if (atTop || atBottom) {
          e.preventDefault();
        }
      }
    };

    const overlayNode = overlayRef.current;
    window.addEventListener('keydown', onKeyDown);
    overlayNode?.addEventListener('touchstart', onTouchStart, { passive: true });
    overlayNode?.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      overlayNode?.removeEventListener('touchstart', onTouchStart);
      overlayNode?.removeEventListener('touchmove', onTouchMove);

      htmlEl.style.overflow = prevHtmlOverflow;
      htmlEl.style.overscrollBehavior = prevHtmlOverscroll;
      bodyEl.style.overflow = prevBodyOverflow;
      bodyEl.style.overscrollBehavior = prevBodyOverscroll;
      bodyEl.style.paddingRight = prevBodyPaddingRight;
      fixedBars.forEach((el, idx) => {
        el.style.paddingRight = prevBarPaddings[idx] ?? '';
      });
    };
  }, [drawerOpen]);

  // Keep DOM badges inside App.tsx innerHTML headers/bars instantaneously synced & pulsed
  useEffect(() => {
    const badgeCount = uncheckedCount;
    document.querySelectorAll<HTMLElement>('[data-shop-badge]').forEach(el => {
      el.textContent = String(badgeCount);
      if (badgeCount > 0) {
        el.classList.remove('hidden');
        el.classList.add('inline-flex');
      } else {
        el.classList.add('hidden');
        el.classList.remove('inline-flex');
      }
      if (pulseSeq > 0 && badgeCount > 0) {
        el.classList.remove('shop-badge-pop');
        void el.offsetWidth;
        el.classList.add('shop-badge-pop');
      }
    });
  }, [uncheckedCount, totalCount, pulseSeq]);

  const uncheckedItems = items.filter(it => !it.checked);
  const checkedItems = items.filter(it => it.checked);
  const checkedCount = checkedItems.length;

  const getFormattedText = (overrideMode?: ChecklistExportMode) =>
    formatShoppingChecklist(items, {
      mode: overrideMode || exportMode,
      unitSystem: unit,
      includeChecked: false,
    });

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = shoppingStore.addCustomItem(
      customInput,
      tr('Saját tétel', 'Articol propriu')
    );
    if (ok) setCustomInput('');
  };

  const handleExportKeep = async () => {
    if (!items.length) return;
    shoppingStore.setExportMode('plain');
    const text = getFormattedText('plain');
    setShowPreview(true);
    try {
      await navigator.clipboard.writeText(text);
      setExportStatus('keep');
      setTimeout(() => setExportStatus('idle'), 2400);
    } catch {
      setExportStatus('keep');
    }
  };

  const handleExportNotesOrShare = async () => {
    if (!items.length) return;
    const text = getFormattedText();
    setShowPreview(true);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      setExportStatus('notes');
      setTimeout(() => setExportStatus('idle'), 2400);
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setExportStatus('notes');
        setTimeout(() => setExportStatus('idle'), 2400);
      } catch {
        // ignore clipboard rejection
      }
    }
  };

  const handleDownloadTxt = () => {
    if (!items.length) return;
    const text = getFormattedText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `vebeat-bevasarlolista-${new Date().toISOString().slice(0, 10)}.txt`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const handleClearAll = () => {
    if (
      window.confirm(
        tr(
          'Törlöd a teljes bevásárlólistát?',
          'Ștergi întreaga listă de cumpărături?'
        )
      )
    ) {
      shoppingStore.clearAll();
    }
  };

  const renderItemRow = (item: ShoppingItem) => {
    const qtyBadge = formatShoppingQty(item.qty, item.unit, unit);
    const step = item.qty != null ? getSymmetricStep(item.unit, unit) : 0;
    const willRemoveOnMinus = item.qty != null && item.qty <= step;

    return (
      <li
        key={item.id}
        className="px-3.5 py-2.5 flex items-center justify-between gap-2.5 hover:bg-surface-container-low/45 transition-colors"
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={item.checked}
          onClick={() => shoppingStore.toggleItemChecked(item.id)}
          className="flex items-start gap-2.5 text-left flex-1 min-w-0 py-0.5 group"
        >
          <span
            className={`mt-0.5 w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0 transition-colors ${
              item.checked
                ? 'bg-primary text-on-primary'
                : 'border-[1.5px] border-outline bg-surface-container-lowest group-hover:border-primary'
            }`}
          >
            {item.checked && (
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                check
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={`block text-[14px] font-medium leading-snug break-words ${
                item.checked ? 'line-through text-outline' : 'text-on-surface'
              }`}
            >
              {item.name}
            </span>
            {item.from && (
              <span className="block text-[11px] text-outline leading-tight mt-0.5 truncate">
                {item.from}
              </span>
            )}
          </span>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {item.qty != null ? (
            <div className="inline-flex items-center bg-surface-container-low rounded-lg p-0.5 border border-outline-variant/35">
              <button
                type="button"
                onClick={() => shoppingStore.adjustItemQty(item.id, -1)}
                aria-label={
                  willRemoveOnMinus
                    ? tr('Tétel eltávolítása (0)', 'Elimină articolul (0)')
                    : tr('Mennyiség csökkentése', 'Scade cantitatea')
                }
                title={
                  willRemoveOnMinus
                    ? tr('Eltávolítás a listáról', 'Elimină din listă')
                    : undefined
                }
                className={`w-6 h-6 rounded-md flex items-center justify-center active:scale-90 transition ${
                  willRemoveOnMinus
                    ? 'hover:bg-error-container/60 text-error'
                    : 'hover:bg-surface-container-high text-primary'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                  {willRemoveOnMinus ? 'delete' : 'remove'}
                </span>
              </button>
              <span className="px-1.5 text-[12px] font-semibold tabular-nums text-primary whitespace-nowrap min-w-[48px] text-center">
                {qtyBadge}
              </span>
              <button
                type="button"
                onClick={() => shoppingStore.adjustItemQty(item.id, 1)}
                aria-label={tr('Mennyiség növelése', 'Crește cantitatea')}
                className="w-6 h-6 rounded-md hover:bg-surface-container-high text-primary flex items-center justify-center active:scale-90 transition"
              >
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                  add
                </span>
              </button>
            </div>
          ) : qtyBadge ? (
            <span className="px-2 py-0.5 rounded-md bg-surface-container-low text-[11px] text-on-surface-variant">
              {qtyBadge}
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => shoppingStore.removeItem(item.id)}
            aria-label={`${tr('Tétel törlése:', 'Șterge:')} ${item.name}`}
            className="w-7 h-7 rounded-full text-outline/75 hover:text-error hover:bg-error-container/35 flex items-center justify-center active:scale-90 transition"
          >
            <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
              close
            </span>
          </button>
        </div>
      </li>
    );
  };

  return (
    <>
      {/* Non-intrusive GPU Action Toast with 1-click "View List" button */}
      <div
        aria-live="polite"
        className={`fixed-floating-overlay bottom-24 z-50 px-4 flex justify-center pointer-events-none no-print transition-[transform,opacity] duration-200 ease-out ${
          actionToast && !drawerOpen
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-2'
        }`}
      >
        {actionToast && !drawerOpen && (
          <div
            role="status"
            className="pointer-events-auto max-w-md w-full sm:w-auto pl-3.5 pr-2 py-2 rounded-full bg-primary text-on-primary shadow-[0_16px_36px_-8px_rgba(23,40,25,0.32)] border border-secondary/35 flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2 min-w-0 text-label-md">
              <span
                className="w-6 h-6 rounded-full bg-secondary text-on-secondary flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <span className="material-symbols-outlined text-[15px]">check</span>
              </span>
              <span className="truncate">{actionToast.message}</span>
            </span>
            {actionToast.actionLabel && (
              <button
                type="button"
                onClick={() => shoppingStore.openDrawer()}
                className="px-3 py-1.5 rounded-full bg-secondary-fixed text-on-secondary-fixed hover:bg-secondary hover:text-on-secondary text-label-sm font-bold whitespace-nowrap flex items-center gap-1 transition-colors shrink-0"
              >
                <span>{actionToast.actionLabel}</span>
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                  arrow_forward
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Quick-Access Slide-Over Shopping List Drawer */}
      <div
        ref={overlayRef}
        className={`fixed inset-0 z-50 no-print overscroll-none ${
          drawerOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
        aria-hidden={!drawerOpen}
      >
        {/* GPU Opacity Backdrop */}
        <div
          onClick={() => shoppingStore.closeDrawer()}
          className={`absolute inset-0 bg-primary/45 backdrop-blur-[2px] touch-none transition-opacity duration-200 ease-out ${
            drawerOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* GPU Translate3d Slide-Over Panel */}
        <aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="shopping-drawer-title"
          className={`absolute right-0 top-0 bottom-0 w-full max-w-[420px] bg-surface shadow-[-16px_0_48px_rgba(23,40,25,0.18)] border-l border-outline-variant/40 flex flex-col overscroll-contain will-change-transform transition-transform duration-250 ease-out ${
            drawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* Sticky Header + Integrated Quick-Add Input */}
          <div className="shrink-0 bg-surface-container-lowest border-b border-outline-variant/35 px-4 pt-3.5 pb-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-full bg-secondary-fixed/80 text-secondary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined fill text-[19px]" aria-hidden="true">
                    shopping_bag
                  </span>
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2
                      id="shopping-drawer-title"
                      className="font-serif text-[19px] font-semibold text-primary leading-tight truncate"
                    >
                      {tr('Bevásárlólista', 'Listă de cumpărături')}
                    </h2>
                    {uncheckedCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-secondary text-on-secondary text-[11px] font-bold leading-none">
                        {uncheckedCount}
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-on-surface-variant leading-tight mt-0.5 truncate">
                    {totalCount === 0
                      ? tr('Üres lista', 'Listă goală')
                      : tr(
                          `${uncheckedCount} beszerzendő${checkedCount ? ` • ${checkedCount} megvan` : ''}`,
                          `${uncheckedCount} de cumpărat${checkedCount ? ` • ${checkedCount} bifate` : ''}`
                        )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <a
                  href="#/profil?t=lista"
                  onClick={() => shoppingStore.closeDrawer()}
                  title={tr(
                    'Megnyitás a teljes Gyűjtemény oldalon',
                    'Deschide în pagina completă Colecție'
                  )}
                  aria-label={tr(
                    'Megnyitás a teljes Gyűjtemény oldalon',
                    'Deschide în pagina completă Colecție'
                  )}
                  className="w-8 h-8 rounded-full hover:bg-surface-container-low text-on-surface-variant hover:text-primary flex items-center justify-center transition"
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    open_in_new
                  </span>
                </a>
                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={() => shoppingStore.closeDrawer()}
                  aria-label={tr('Bevásárlólista bezárása', 'Închide lista de cumpărături')}
                  className="w-8 h-8 rounded-full bg-surface-container-low hover:bg-surface-container text-primary flex items-center justify-center active:scale-95 transition"
                >
                  <span className="material-symbols-outlined text-[19px]" aria-hidden="true">
                    close
                  </span>
                </button>
              </div>
            </div>

            <form onSubmit={handleAddCustom} className="relative flex items-center">
              <input
                type="text"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                maxLength={100}
                placeholder={tr(
                  'Tétel hozzáadása (pl. 250 g vaj, 2 db citrom)...',
                  'Adaugă articol (ex. 250 g unt, 2 buc lămâie)...'
                )}
                className="w-full h-9 pl-3 pr-20 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[13px] text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest focus:border-primary transition-colors"
              />
              <button
                type="submit"
                disabled={!customInput.trim()}
                className="absolute right-1 h-7 px-2.5 rounded-md bg-primary text-on-primary text-[11px] font-semibold flex items-center gap-0.5 disabled:opacity-35 active:scale-95 transition"
              >
                <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                  add
                </span>
                <span>{tr('Hozzáad', 'Adaugă')}</span>
              </button>
            </form>
          </div>

          {/* Strictly Contained Internal Scroll Container */}
          <div
            ref={listScrollRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y px-3.5 sm:px-4 py-3 flex flex-col gap-3"
          >
            {items.length === 0 ? (
              <div className="flex-1 min-h-[200px] flex flex-col items-center justify-center text-center px-4 py-8 gap-2 text-on-surface-variant">
                <span className="w-12 h-12 rounded-full bg-surface-container-low text-outline flex items-center justify-center">
                  <span className="material-symbols-outlined text-[24px]" aria-hidden="true">
                    add_shopping_cart
                  </span>
                </span>
                <p className="font-serif text-title-md text-primary">
                  {tr('Még üres a bevásárlólistád', 'Lista de cumpărături este goală')}
                </p>
                <p className="text-[12.5px] leading-relaxed max-w-xs text-outline">
                  {tr(
                    'A receptoldalon 1 kattintással felveheted a hiányzó hozzávalókat – az azonos tételeket automatikusan összeadjuk.',
                    'Adaugă ingredientele lipsă din orice rețetă cu 1 click – cantitățile identice se cumulează automat.'
                  )}
                </p>
              </div>
            ) : (
              <>
                {uncheckedItems.length > 0 && (
                  <section aria-label={tr('Beszerzendő tételek', 'Articole de cumpărat')}>
                    <ul className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 shadow-sm divide-y divide-outline-variant/30 overflow-hidden">
                      {uncheckedItems.map(renderItemRow)}
                    </ul>
                  </section>
                )}

                {checkedItems.length > 0 && (
                  <section
                    aria-label={tr('Beszerzett tételek', 'Articole bifate')}
                    className="flex flex-col gap-1.5"
                  >
                    <div className="px-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-outline">
                        {tr(`Megvan (${checkedCount})`, `Bifate (${checkedCount})`)}
                      </span>
                      <button
                        type="button"
                        onClick={() => shoppingStore.clearChecked()}
                        className="text-[11px] font-semibold text-secondary hover:underline flex items-center gap-0.5"
                      >
                        <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                          done_all
                        </span>
                        <span>{tr('Kipipáltak törlése', 'Șterge bifate')}</span>
                      </button>
                    </div>
                    <ul className="bg-surface-container-low/65 rounded-xl border border-outline-variant/25 divide-y divide-outline-variant/25 overflow-hidden">
                      {checkedItems.map(renderItemRow)}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>

          {/* Compact Sticky Footer: Checklist Export & Clear */}
          {items.length > 0 && (
            <div className="shrink-0 px-3.5 sm:px-4 py-2.5 pb-safe bg-surface-container-lowest border-t border-outline-variant/35 flex flex-col gap-2">
              {showPreview && (
                <div className="rounded-lg bg-surface-container-low p-2 border border-outline-variant/35 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-secondary font-semibold truncate">
                      {tr(
                        'Vágólapon • Illeszd be lista-jegyzetbe!',
                        'În clipboard • Lipește într-o listă!'
                      )}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href="https://keep.google.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-0.5 rounded bg-secondary text-on-secondary text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <span>{tr('Keep megnyitása', 'Deschide Keep')}</span>
                        <span
                          className="material-symbols-outlined text-[12px]"
                          aria-hidden="true"
                        >
                          open_in_new
                        </span>
                      </a>
                      <button
                        type="button"
                        onClick={() => setShowPreview(false)}
                        aria-label={tr('Előnézet bezárása', 'Închide previzualizarea')}
                        className="w-5 h-5 rounded text-outline hover:text-primary flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                          close
                        </span>
                      </button>
                    </div>
                  </div>
                  <pre className="text-[11.5px] font-mono whitespace-pre-wrap bg-surface-container-lowest p-2 rounded border border-outline-variant/30 max-h-24 overflow-y-auto overscroll-contain text-on-surface">
                    {getFormattedText()}
                  </pre>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
                  <span
                    className="material-symbols-outlined text-[14px] text-secondary"
                    aria-hidden="true"
                  >
                    checklist_rtl
                  </span>
                  <span>{tr('Pipálható export', 'Export listă')}</span>
                </span>
                <div
                  className="inline-flex rounded-full bg-surface-container p-0.5 text-[10px] font-bold border border-outline-variant/30"
                  role="group"
                  aria-label={tr('Export formátum', 'Format export')}
                >
                  <button
                    type="button"
                    aria-pressed={exportMode === 'plain'}
                    onClick={() => shoppingStore.setExportMode('plain')}
                    className={`px-2 py-0.5 rounded-full transition ${
                      exportMode === 'plain'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-on-surface-variant'
                    }`}
                  >
                    Keep / Notes
                  </button>
                  <button
                    type="button"
                    aria-pressed={exportMode === 'markdown'}
                    onClick={() => shoppingStore.setExportMode('markdown')}
                    className={`px-2 py-0.5 rounded-full transition ${
                      exportMode === 'markdown'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-on-surface-variant'
                    }`}
                  >
                    - [ ] MD
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleExportKeep}
                  className="flex-1 min-h-[38px] px-2.5 rounded-lg bg-secondary-fixed text-on-secondary-fixed hover:opacity-90 text-[12px] font-semibold flex items-center justify-center gap-1 shadow-sm active:scale-95 transition"
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    {exportStatus === 'keep' ? 'check' : 'keep'}
                  </span>
                  <span className="truncate">
                    {exportStatus === 'keep' ? tr('Másolva!', 'Copiat!') : 'Google Keep'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleExportNotesOrShare}
                  className="flex-1 min-h-[38px] px-2.5 rounded-lg bg-surface-container-low border border-outline-variant/45 hover:bg-surface-container text-primary text-[12px] font-semibold flex items-center justify-center gap-1 active:scale-95 transition"
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    {exportStatus === 'notes' ? 'check' : 'ios_share'}
                  </span>
                  <span className="truncate">
                    {exportStatus === 'notes'
                      ? tr('Másolva!', 'Copiat!')
                      : tr('Notes / Másol', 'Notes / Copiază')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTxt}
                  title={tr('Mentés .txt fájlként', 'Salvează ca fișier .txt')}
                  aria-label={tr('Mentés .txt fájlként', 'Salvează ca fișier .txt')}
                  className="w-9 h-[38px] rounded-lg bg-surface-container-low border border-outline-variant/45 hover:bg-surface-container text-primary flex items-center justify-center active:scale-95 transition shrink-0"
                >
                  <span className="material-symbols-outlined text-[17px]" aria-hidden="true">
                    download
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  title={tr('Teljes lista ürítése', 'Golește întreaga listă')}
                  aria-label={tr('Teljes lista ürítése', 'Golește întreaga listă')}
                  className="w-9 h-[38px] rounded-lg bg-error-container/70 hover:bg-error-container text-on-error-container flex items-center justify-center active:scale-95 transition shrink-0"
                >
                  <span className="material-symbols-outlined text-[17px]" aria-hidden="true">
                    delete_sweep
                  </span>
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
