import { useSyncExternalStore } from 'react';

export type UnitSystem = 'metric' | 'dkg';
export type AppLang = 'hu' | 'ro';
export type ChecklistExportMode = 'plain' | 'markdown';

export interface RawRecipeIngredient {
  name: string;
  qty: number | null;
  unit: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  normKey: string;
  qty: number | null;
  unit: string;
  text: string;
  from: string;
  sources: string[];
  recipeQtys: Record<string, number | null>;
  checked: boolean;
  addedAt: number;
}

export interface ShoppingToastPayload {
  id: number;
  message: string;
  actionLabel?: string;
}

export interface ShoppingStoreSnapshot {
  items: ShoppingItem[];
  totalCount: number;
  uncheckedCount: number;
  drawerOpen: boolean;
  pulseSeq: number;
  lang: AppLang;
  unit: UnitSystem;
  exportMode: ChecklistExportMode;
  actionToast: ShoppingToastPayload | null;
}

const STORAGE_KEY = 'etlap-atelier-v1';

const stripDiacritics = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const roundClean = (n: number): number => Math.round(n * 100) / 100;

/**
 * Formats quantities cleanly without destroying fractional steps (e.g. 12,5 dkg or 1,5 ek).
 */
export const formatQtyNumber = (n: number): string => {
  const rounded = roundClean(n);
  if (Number.isInteger(rounded)) return String(rounded);
  return (Math.round(rounded * 100) / 100)
    .toString()
    .replace(/(\.\d*?[1-9])0+$/, '$1')
    .replace(/\.0+$/, '')
    .replace('.', ',');
};

/**
 * Recognized culinary units (diacritic-stripped, without trailing period) for legacy/custom text parsing.
 */
const PARSEABLE_UNIT_KEYS = new Set([
  'g',
  'gramm',
  'dkg',
  'kg',
  'ml',
  'cl',
  'dl',
  'l',
  'liter',
  'db',
  'buc',
  'bucati',
  'ek',
  'tk',
  'kk',
  'mk',
  'lingura',
  'linguri',
  'lingurita',
  'lingurite',
  'gerezd',
  'catel',
  'catei',
  'csokor',
  'legatura',
  'szelet',
  'felie',
  'felii',
  'cana',
  'csipet',
  'praf',
]);

const FRACTIONAL_SPOON_UNITS = new Set([
  'ek',
  'tk',
  'kk',
  'mk',
  'lingura',
  'linguri',
  'lingurita',
  'lingurite',
  'cana',
  'csipet',
  'praf',
  'varf de cutit',
]);

function parseLeadingQuantityText(rawText: string): {
  qty: number | null;
  unit: string;
  name: string;
} {
  const trimmed = String(rawText || '').trim();
  const numMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
  if (!numMatch) {
    return { qty: null, unit: '', name: trimmed };
  }
  const parsedQty = parseFloat(numMatch[1].replace(',', '.'));
  if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
    return { qty: null, unit: '', name: trimmed };
  }
  const rest = numMatch[2].trim();
  const spaceIdx = rest.indexOf(' ');
  if (spaceIdx > 0) {
    const candidateUnit = rest.slice(0, spaceIdx).trim();
    const candidateKey = stripDiacritics(candidateUnit).replace(/\.$/, '');
    const remainingName = rest.slice(spaceIdx + 1).trim();
    if (PARSEABLE_UNIT_KEYS.has(candidateKey) && remainingName) {
      return { qty: roundClean(parsedQty), unit: candidateUnit, name: remainingName };
    }
  }
  return { qty: roundClean(parsedQty), unit: '', name: rest };
}

/**
 * Normalizes compatible metric mass/volume units to base `g` or `ml` so quantities
 * from multiple recipes or unit modes merge cleanly without duplicates.
 */
function toCanonicalQtyAndUnit(
  qty: number | null,
  rawUnit: string
): { qty: number | null; unit: string; unitKey: string } {
  const cleanUnit = String(rawUnit || '').trim();
  if (qty == null || !Number.isFinite(qty) || qty <= 0) {
    return { qty: null, unit: cleanUnit, unitKey: stripDiacritics(cleanUnit) || 'none' };
  }
  const u = stripDiacritics(cleanUnit).replace(/\.$/, '');
  if (u === 'g' || u === 'gramm') return { qty: roundClean(qty), unit: 'g', unitKey: 'g' };
  if (u === 'dkg') return { qty: roundClean(qty * 10), unit: 'g', unitKey: 'g' };
  if (u === 'kg') return { qty: roundClean(qty * 1000), unit: 'g', unitKey: 'g' };
  if (u === 'ml') return { qty: roundClean(qty), unit: 'ml', unitKey: 'ml' };
  if (u === 'cl') return { qty: roundClean(qty * 10), unit: 'ml', unitKey: 'ml' };
  if (u === 'dl') return { qty: roundClean(qty * 100), unit: 'ml', unitKey: 'ml' };
  if (u === 'l' || u === 'liter') return { qty: roundClean(qty * 1000), unit: 'ml', unitKey: 'ml' };
  return { qty: roundClean(qty), unit: cleanUnit, unitKey: u || 'unit' };
}

/**
 * Returns a strictly symmetric, unit-aware step size (in canonical item units)
 * that NEVER depends on the item's current quantity:
 * - Mass (`g`): 10 g (= 1 dkg) in both metric and dkg modes
 * - Volume (`ml`): 50 ml (= 0,5 dl) in both metric and dkg modes
 * - Spoons/pinches (`ek`, `tk`, `lingură`, etc.): 0.5
 * - Countable items (`db`, `buc.`, `gerezd`, `szelet`, etc.): 1
 */
export function getSymmetricStep(unit: string, _unitSystem: UnitSystem = 'metric'): number {
  const u = stripDiacritics(unit).replace(/\.$/, '');
  if (u === 'g' || u === 'gramm') return 10;
  if (u === 'ml') return 50;
  if (FRACTIONAL_SPOON_UNITS.has(u)) return 0.5;
  return 1;
}

export function formatShoppingQty(
  qty: number | null,
  unit: string,
  unitSystem: UnitSystem = 'metric'
): string {
  if (qty == null || !Number.isFinite(qty)) return unit || '';
  let q = qty;
  let u = unit;
  if (unitSystem === 'dkg') {
    if (u === 'g' && q >= 10) {
      q = q / 10;
      u = 'dkg';
    } else if (u === 'ml' && q >= 100) {
      q = q / 100;
      u = 'dl';
    }
  }
  return `${formatQtyNumber(q)}${u ? ' ' + u : ''}`.trim();
}

export function buildDisplayText(
  name: string,
  qty: number | null,
  unit: string,
  unitSystem: UnitSystem = 'metric'
): string {
  const cleanName = String(name || '').trim();
  if (qty == null || !Number.isFinite(qty)) {
    return unit ? `${cleanName} (${unit})` : cleanName;
  }
  const formatted = formatShoppingQty(qty, unit, unitSystem);
  return `${formatted} ${cleanName}`.trim();
}

/**
 * Formats shopping list items for native checklist paste into Google Keep & mobile Notes:
 * - `'plain'` (default, optimal for Google Keep & Apple/Samsung Notes):
 *   Clean newline-delimited `[Quantity] [Unit] [Ingredient]` lines with zero headers,
 *   bullets, or blank lines so Google Keep's "Show checkboxes" / list-paste creates
 *   clean checkable rows without literal `[ ]` or `•` text artifacts.
 * - `'markdown'` (optimal for Notion, Obsidian, Bear, GitHub):
 *   `- [ ] [Quantity] [Unit] [Ingredient]` lines with no extra headers or blank lines.
 * - Exports unchecked items by default (falls back to all items if every item is checked).
 */
export function formatShoppingChecklist(
  items: ShoppingItem[],
  options?: {
    mode?: ChecklistExportMode;
    unitSystem?: UnitSystem;
    includeChecked?: boolean;
  }
): string {
  if (!items.length) return '';
  const mode = options?.mode || 'plain';
  const unitSystem = options?.unitSystem || 'metric';
  const unchecked = items.filter(it => !it.checked);
  const targetItems = options?.includeChecked ? items : unchecked.length > 0 ? unchecked : items;

  return targetItems
    .map(it => {
      const line = buildDisplayText(it.name, it.qty, it.unit, unitSystem)
        .replace(/\s+/g, ' ')
        .trim();
      if (!line) return '';
      if (mode === 'markdown') {
        return `- [${it.checked && options?.includeChecked ? 'x' : ' '}] ${line}`;
      }
      return line;
    })
    .filter(Boolean)
    .join('\n');
}

function formatSourcesLabel(sources: string[]): string {
  if (!sources.length) return '';
  if (sources.length === 1) return sources[0];
  return `${sources[0]} +${sources.length - 1}`;
}

/**
 * Hydrates legacy `{ text, from }` shopping entries into normalized `ShoppingItem` records.
 */
export function normalizeStoredShoppingList(
  rawList: any[],
  unitSystem: UnitSystem = 'metric'
): ShoppingItem[] {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter(item => item && (typeof item.text === 'string' || typeof item.name === 'string'))
    .map((item, idx) => {
      if (item.normKey && typeof item.name === 'string') {
        const sources =
          Array.isArray(item.sources) && item.sources.length
            ? item.sources
            : item.from
              ? [String(item.from)]
              : [];
        const rawQty =
          typeof item.qty === 'number' && Number.isFinite(item.qty) && item.qty > 0
            ? roundClean(item.qty)
            : null;
        const unit = typeof item.unit === 'string' ? item.unit : '';
        return {
          id: String(item.id || `shop_${idx}_${Date.now().toString(36)}`),
          name: item.name,
          normKey: String(item.normKey),
          qty: rawQty,
          unit,
          text: buildDisplayText(item.name, rawQty, unit, unitSystem),
          from: formatSourcesLabel(sources) || String(item.from || ''),
          sources,
          recipeQtys:
            item.recipeQtys && typeof item.recipeQtys === 'object' ? { ...item.recipeQtys } : {},
          checked: Boolean(item.checked),
          addedAt: Number(item.addedAt) || Date.now(),
        };
      }

      // Legacy `{ text: "200 g Csirkemell", from: "Recept" }` fallback parser
      const parsed = parseLeadingQuantityText(String(item.text || ''));
      const canon = toCanonicalQtyAndUnit(parsed.qty, parsed.unit);
      const normKey = `${stripDiacritics(parsed.name)}::${canon.unitKey}`;
      const fromStr = String(item.from || '').trim();
      const sources = fromStr ? [fromStr] : [];

      return {
        id: `shop_${idx}_${stripDiacritics(parsed.name).slice(0, 12)}`,
        name: parsed.name,
        normKey,
        qty: canon.qty,
        unit: canon.unit,
        text: buildDisplayText(parsed.name, canon.qty, canon.unit, unitSystem),
        from: fromStr,
        sources,
        recipeQtys: fromStr ? { [fromStr]: canon.qty } : {},
        checked: Boolean(item.checked),
        addedAt: Date.now() - idx,
      };
    });
}

export interface MergeResult {
  items: ShoppingItem[];
  addedCount: number;
  mergedCount: number;
  unchangedCount: number;
}

/**
 * Pure helper for adjusting an item's quantity symmetrically:
 * - Applies `direction * getSymmetricStep(item.unit, unitSystem)`.
 * - If resulting quantity `<= 0`, removes the item cleanly (never clamps asymmetrically).
 */
export function applySymmetricQtyStep(
  items: ShoppingItem[],
  id: string,
  direction: 1 | -1,
  unitSystem: UnitSystem = 'metric'
): ShoppingItem[] {
  const result: ShoppingItem[] = [];
  for (const it of items) {
    if (it.id !== id || it.qty == null) {
      result.push(it);
      continue;
    }
    const step = getSymmetricStep(it.unit, unitSystem);
    const updatedQty = roundClean(it.qty + direction * step);
    if (updatedQty <= 0) {
      // At <= 0, remove item cleanly from shopping list
      continue;
    }
    result.push({
      ...it,
      qty: updatedQty,
      text: buildDisplayText(it.name, updatedQty, it.unit, unitSystem),
      recipeQtys: {},
    });
  }
  return result;
}

/**
 * Merges missing ingredients from a recipe into the shopping list:
 * - Prevents duplicates from repeated clicks on the same recipe at the same serving count.
 * - Updates the recipe's contributed quantity if the user changed servings and clicked again.
 * - Sums quantities across different recipes sharing the same ingredient & compatible unit.
 */
export function mergeRecipeIngredientsIntoList(params: {
  existing: ShoppingItem[];
  ingredients: RawRecipeIngredient[];
  checkedIndices: number[];
  recipeId: string;
  recipeTitle: string;
  servingsMultiplier: number;
  unitSystem: UnitSystem;
}): MergeResult {
  const {
    existing,
    ingredients,
    checkedIndices,
    recipeId,
    recipeTitle,
    servingsMultiplier,
    unitSystem,
  } = params;

  const next = existing.map(it => ({
    ...it,
    sources: [...it.sources],
    recipeQtys: { ...it.recipeQtys },
  }));

  let addedCount = 0;
  let mergedCount = 0;
  let unchangedCount = 0;
  const freshItems: ShoppingItem[] = [];

  const missing = ingredients.filter((_, idx) => !checkedIndices.includes(idx));

  for (const ing of missing) {
    const rawName = String(ing.name || '').trim();
    if (!rawName) continue;

    const scaledQty =
      ing.qty == null || ing.qty <= 0 ? null : roundClean(ing.qty * servingsMultiplier);
    const canon = toCanonicalQtyAndUnit(scaledQty, ing.unit);
    const normKey = `${stripDiacritics(rawName)}::${canon.unitKey}`;

    const matchIdx = next.findIndex(it => it.normKey === normKey && !it.checked);
    const freshIdx = freshItems.findIndex(it => it.normKey === normKey);

    if (matchIdx === -1 && freshIdx === -1) {
      const sources = recipeTitle ? [recipeTitle] : [];
      freshItems.push({
        id: `shop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: rawName,
        normKey,
        qty: canon.qty,
        unit: canon.unit,
        text: buildDisplayText(rawName, canon.qty, canon.unit, unitSystem),
        from: formatSourcesLabel(sources),
        sources,
        recipeQtys: { [recipeId]: canon.qty },
        checked: false,
        addedAt: Date.now(),
      });
      addedCount++;
      continue;
    }

    const target = matchIdx !== -1 ? next[matchIdx] : freshItems[freshIdx];
    const hasRecipeAlready = Object.prototype.hasOwnProperty.call(target.recipeQtys, recipeId);
    const prevRecipeQty = target.recipeQtys[recipeId];

    if (hasRecipeAlready) {
      const sameQty =
        (prevRecipeQty == null && canon.qty == null) ||
        (prevRecipeQty != null &&
          canon.qty != null &&
          Math.abs(prevRecipeQty - canon.qty) < 0.05);

      if (sameQty) {
        unchangedCount++;
        continue;
      }

      if (target.qty != null && canon.qty != null) {
        const baseWithoutPrev = Math.max(0, target.qty - (prevRecipeQty || 0));
        target.qty = roundClean(baseWithoutPrev + canon.qty);
      } else {
        target.qty = canon.qty;
      }
      target.recipeQtys[recipeId] = canon.qty;
      if (recipeTitle && !target.sources.includes(recipeTitle)) {
        target.sources.push(recipeTitle);
      }
      target.from = formatSourcesLabel(target.sources);
      target.text = buildDisplayText(target.name, target.qty, target.unit, unitSystem);
      mergedCount++;
    } else {
      if (target.qty != null && canon.qty != null) {
        target.qty = roundClean(target.qty + canon.qty);
      } else if (target.qty == null && canon.qty != null) {
        target.qty = canon.qty;
      }
      target.recipeQtys[recipeId] = canon.qty;
      if (recipeTitle && !target.sources.includes(recipeTitle)) {
        target.sources.push(recipeTitle);
      }
      target.from = formatSourcesLabel(target.sources);
      target.text = buildDisplayText(target.name, target.qty, target.unit, unitSystem);
      mergedCount++;
    }
  }

  return { items: [...freshItems, ...next], addedCount, mergedCount, unchangedCount };
}

/* ---------- External Reactive Store (Synced between App.tsx & React Components) ---------- */

type Listener = () => void;
const listeners = new Set<Listener>();
let toastClearTimer: ReturnType<typeof setTimeout> | null = null;

function readInitialSnapshot(): ShoppingStoreSnapshot {
  try {
    if (typeof window === 'undefined') {
      return {
        items: [],
        totalCount: 0,
        uncheckedCount: 0,
        drawerOpen: false,
        pulseSeq: 0,
        lang: 'hu',
        unit: 'metric',
        exportMode: 'plain',
        actionToast: null,
      };
    }
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const unit: UnitSystem = raw.unit === 'dkg' ? 'dkg' : 'metric';
    const lang: AppLang = raw.lang === 'ro' ? 'ro' : 'hu';
    const items = normalizeStoredShoppingList(raw.shopping || [], unit);
    return {
      items,
      totalCount: items.length,
      uncheckedCount: items.filter(i => !i.checked).length,
      drawerOpen: false,
      pulseSeq: 0,
      lang,
      unit,
      exportMode: 'plain',
      actionToast: null,
    };
  } catch {
    return {
      items: [],
      totalCount: 0,
      uncheckedCount: 0,
      drawerOpen: false,
      pulseSeq: 0,
      lang: 'hu',
      unit: 'metric',
      exportMode: 'plain',
      actionToast: null,
    };
  }
}

let state: ShoppingStoreSnapshot = readInitialSnapshot();
let onExternalMutate: ((items: ShoppingItem[]) => void) | null = null;

function emit() {
  listeners.forEach(fn => fn());
}

function persistItemsToStorage(items: ShoppingItem[]) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    raw.shopping = items;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
  } catch {
    // ignore storage quota errors here; App.tsx handles user warning
  }
  onExternalMutate?.(items);
}

export const shoppingStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): ShoppingStoreSnapshot {
    return state;
  },

  registerAppBridge(cb: ((items: ShoppingItem[]) => void) | null) {
    onExternalMutate = cb;
  },

  syncFromApp(rawItems: any[], lang: AppLang, unit: UnitSystem, triggerPulse = false) {
    const normalized = normalizeStoredShoppingList(rawItems, unit).map(it => ({
      ...it,
      text: buildDisplayText(it.name, it.qty, it.unit, unit),
    }));
    state = {
      ...state,
      items: normalized,
      totalCount: normalized.length,
      uncheckedCount: normalized.filter(i => !i.checked).length,
      lang,
      unit,
      pulseSeq: triggerPulse ? state.pulseSeq + 1 : state.pulseSeq,
    };
    emit();
  },

  setExportMode(mode: ChecklistExportMode) {
    if (state.exportMode === mode) return;
    state = { ...state, exportMode: mode };
    emit();
  },

  setItems(nextItems: ShoppingItem[], opts?: { pulse?: boolean }) {
    const formatted = nextItems.map(it => ({
      ...it,
      text: buildDisplayText(it.name, it.qty, it.unit, state.unit),
    }));
    state = {
      ...state,
      items: formatted,
      totalCount: formatted.length,
      uncheckedCount: formatted.filter(i => !i.checked).length,
      pulseSeq: opts?.pulse ? state.pulseSeq + 1 : state.pulseSeq,
    };
    persistItemsToStorage(formatted);
    emit();
  },

  openDrawer() {
    if (state.drawerOpen) return;
    state = { ...state, drawerOpen: true, actionToast: null };
    emit();
  },

  closeDrawer() {
    if (!state.drawerOpen) return;
    state = { ...state, drawerOpen: false };
    emit();
  },

  toggleDrawer() {
    state = {
      ...state,
      drawerOpen: !state.drawerOpen,
      actionToast: !state.drawerOpen ? null : state.actionToast,
    };
    emit();
  },

  showActionToast(message: string, actionLabel?: string, durationMs = 4200) {
    if (toastClearTimer) clearTimeout(toastClearTimer);
    const id = Date.now();
    state = {
      ...state,
      actionToast: { id, message, actionLabel },
    };
    emit();
    toastClearTimer = setTimeout(() => {
      if (state.actionToast?.id === id) {
        state = { ...state, actionToast: null };
        emit();
      }
    }, durationMs);
  },

  dismissActionToast() {
    if (!state.actionToast) return;
    if (toastClearTimer) clearTimeout(toastClearTimer);
    state = { ...state, actionToast: null };
    emit();
  },

  toggleItemChecked(id: string) {
    const next = state.items.map(it => (it.id === id ? { ...it, checked: !it.checked } : it));
    this.setItems(next);
  },

  removeItem(id: string) {
    const next = state.items.filter(it => it.id !== id);
    this.setItems(next);
  },

  adjustItemQty(id: string, direction: 1 | -1) {
    const next = applySymmetricQtyStep(state.items, id, direction, state.unit);
    this.setItems(next);
  },

  addCustomItem(rawInput: string, customLabel: string) {
    const trimmed = rawInput.trim();
    if (!trimmed) return false;
    const parsed = parseLeadingQuantityText(trimmed);
    const canon = toCanonicalQtyAndUnit(parsed.qty, parsed.unit);
    const normKey = `${stripDiacritics(parsed.name)}::${canon.unitKey}`;

    const existingIdx = state.items.findIndex(it => it.normKey === normKey && !it.checked);
    const next = [...state.items];
    if (existingIdx >= 0) {
      const cur = next[existingIdx];
      const mergedQty =
        cur.qty != null && canon.qty != null
          ? roundClean(cur.qty + canon.qty)
          : canon.qty ?? cur.qty;
      next[existingIdx] = {
        ...cur,
        qty: mergedQty,
      };
    } else {
      next.unshift({
        id: `shop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: parsed.name,
        normKey,
        qty: canon.qty,
        unit: canon.unit,
        text: buildDisplayText(parsed.name, canon.qty, canon.unit, state.unit),
        from: customLabel,
        sources: [customLabel],
        recipeQtys: {},
        checked: false,
        addedAt: Date.now(),
      });
    }
    this.setItems(next, { pulse: true });
    return true;
  },

  clearChecked() {
    const next = state.items.filter(it => !it.checked);
    this.setItems(next);
  },

  clearAll() {
    this.setItems([]);
  },
};

export function useShoppingList(): ShoppingStoreSnapshot {
  return useSyncExternalStore(
    shoppingStore.subscribe,
    shoppingStore.getSnapshot,
    shoppingStore.getSnapshot
  );
}
