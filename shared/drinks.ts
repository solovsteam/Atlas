/**
 * Drinks convert an amount into caffeine. Each value keeps its source, and a value
 * that is not read from the product label is marked as an estimate.
 */
export type DrinkServing = { name: string; ml: number };
export type Drink = {
  id: string;
  name: string;
  /** Other words that mean this drink, for example "coke". */
  aliases: string[];
  caffeineMgPer100Ml: number;
  servings: DrinkServing[];
  source: string;
  estimate: boolean;
  hidden: boolean;
};
/** The conversion stays on the entry, so later edits to the drink list never change past records. */
export type DrinkConversion = {
  drinkId: string;
  name: string;
  amountMl: number;
  /** What the person wrote or chose, for example "1 can" or "250 ml". */
  amountText: string;
  caffeineMgPer100Ml: number;
  source: string;
  estimate: boolean;
};

export const MAX_DRINK_ML = 5000;
export const DEFAULT_DRINKS: readonly Drink[] = [
  { id: 'coca-cola', name: 'Coca-Cola', aliases: ['coke', 'cola'], caffeineMgPer100Ml: 10,
    servings: [{ name: 'can', ml: 330 }, { name: 'bottle', ml: 500 }, { name: 'glass', ml: 200 }],
    source: 'German label value 10 mg per 100 ml. Other sources give 8 to 10 mg. Check your bottle.', estimate: true, hidden: false },
  { id: 'coca-cola-zero', name: 'Coca-Cola Zero', aliases: ['coke zero', 'cola zero'], caffeineMgPer100Ml: 10,
    servings: [{ name: 'can', ml: 330 }, { name: 'bottle', ml: 500 }, { name: 'glass', ml: 200 }],
    source: 'Sources give 9.6 to 12 mg per 100 ml. Check your bottle.', estimate: true, hidden: false },
  { id: 'red-bull', name: 'Red Bull', aliases: [], caffeineMgPer100Ml: 32,
    servings: [{ name: 'can', ml: 250 }],
    source: 'Manufacturer: 80 mg in a 250 ml can.', estimate: false, hidden: false },
  { id: 'club-mate', name: 'Club-Mate', aliases: ['mate', 'club mate'], caffeineMgPer100Ml: 20,
    servings: [{ name: 'bottle', ml: 500 }],
    source: 'Label value 20 mg per 100 ml.', estimate: false, hidden: false },
  { id: 'espresso', name: 'Espresso', aliases: [], caffeineMgPer100Ml: 133,
    servings: [{ name: 'shot', ml: 60 }, { name: 'cup', ml: 60 }],
    source: 'EFSA guide value: 80 mg in 60 ml. Real values vary a lot.', estimate: true, hidden: false },
  { id: 'filter-coffee', name: 'Filter coffee', aliases: ['filter kaffee'], caffeineMgPer100Ml: 45,
    servings: [{ name: 'cup', ml: 200 }, { name: 'mug', ml: 300 }],
    source: 'EFSA guide value: 90 mg in 200 ml. Real values vary a lot.', estimate: true, hidden: false },
];

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const positive = (value: unknown, max = Infinity): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;

export function validDrink(value: unknown): value is Drink {
  const d = object(value);
  return text(d.id) && text(d.name) && Array.isArray(d.aliases) && d.aliases.every(text)
    && typeof d.caffeineMgPer100Ml === 'number' && Number.isFinite(d.caffeineMgPer100Ml) && d.caffeineMgPer100Ml >= 0 && d.caffeineMgPer100Ml <= 2000
    && Array.isArray(d.servings) && d.servings.every(s => text(object(s).name) && positive(object(s).ml, MAX_DRINK_ML))
    && typeof d.source === 'string' && typeof d.estimate === 'boolean' && typeof d.hidden === 'boolean';
}
/** An invalid stored list falls back to the defaults instead of losing the feature. */
export function parseDrinks(value: unknown): Drink[] {
  if (!Array.isArray(value) || !value.every(validDrink) || new Set(value.map(d => d.id)).size !== value.length) {
    return DEFAULT_DRINKS.map(d => ({ ...d, aliases: [...d.aliases], servings: d.servings.map(s => ({ ...s })) }));
  }
  return value.map(d => ({ ...d, aliases: [...d.aliases], servings: d.servings.map(s => ({ ...s })) }));
}

export function validConversion(value: unknown): value is DrinkConversion {
  const c = object(value);
  return text(c.drinkId) && text(c.name) && positive(c.amountMl, MAX_DRINK_ML) && text(c.amountText)
    && typeof c.caffeineMgPer100Ml === 'number' && Number.isFinite(c.caffeineMgPer100Ml) && c.caffeineMgPer100Ml >= 0
    && typeof c.source === 'string' && typeof c.estimate === 'boolean';
}
/** Rounded to 0.1 mg. The stored conversion is the only input. */
export function caffeineMg(conversion: Pick<DrinkConversion, 'amountMl' | 'caffeineMgPer100Ml'>): number {
  return Math.round(conversion.amountMl * conversion.caffeineMgPer100Ml / 10) / 10;
}

const UNIT_ML: Record<string, number> = { ml: 1, milliliter: 1, millilitre: 1, cl: 10, dl: 100, l: 1000, liter: 1000, litre: 1000 };
/** Converts "250 ml", "0.5 l" or "2 cans". Returns null for a unit this drink does not know. */
export function drinkAmountMl(drink: Drink, amount: number, unit: string): number | null {
  if (!positive(amount)) return null;
  const clean = unit.trim().toLowerCase().replace(/\.$/, '');
  const factor = UNIT_ML[clean] ?? UNIT_ML[clean.replace(/s$/, '')];
  const serving = drink.servings.find(s => s.name.toLowerCase() === clean || `${s.name.toLowerCase()}s` === clean);
  const ml = factor ? amount * factor : serving ? amount * serving.ml : null;
  return ml !== null && ml <= MAX_DRINK_ML ? Math.round(ml * 10) / 10 : null;
}
export function amountText(amount: number, unit: string): string {
  const clean = unit.trim().toLowerCase();
  const word = clean === 'ml' || clean === 'l' || clean === 'cl' || clean === 'dl' ? clean
    : amount === 1 ? clean.replace(/s$/, '') : clean.endsWith('s') ? clean : `${clean}s`;
  return `${amount} ${word}`;
}
export function drinkConversion(drink: Drink, amount: number, unit: string): DrinkConversion | null {
  const amountMl = drinkAmountMl(drink, amount, unit);
  if (amountMl === null) return null;
  return { drinkId: drink.id, name: drink.name, amountMl, amountText: amountText(amount, unit),
    caffeineMgPer100Ml: drink.caffeineMgPer100Ml, source: drink.source, estimate: drink.estimate };
}
/** A correction of the amount keeps the original conversion values. */
export function withAmountMl(conversion: DrinkConversion, amountMl: number): DrinkConversion | null {
  if (!positive(amountMl, MAX_DRINK_ML)) return null;
  return { ...conversion, amountMl, amountText: amountText(amountMl, 'ml') };
}
