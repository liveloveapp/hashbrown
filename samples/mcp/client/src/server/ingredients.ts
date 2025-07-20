import { faker } from '@faker-js/faker';

type ISODate = `${number}-${number}-${number}`;
type Unit =
  | 'each'
  | 'dozen'
  | 'pound'
  | 'ounce'
  | 'gallon'
  | 'case'
  | 'bag'
  | 'box'
  | 'liter'
  | 'kilogram';

export type IngredientCategory =
  | 'Food'
  | 'Beverage'
  | 'Packaging'
  | 'Cleaning'
  | 'Non-food Supply';

interface DailyReport {
  date: ISODate;
  price: number;
  inventory: number;
  consumption: number;
  wastage: number;
  delivered: number;
}

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  unit: Unit;
  safetyStock: number;
  reorderPoint: number;
  leadTimeDays: number;
  currentInventory: number;
  currentUnitCostUSD: number;
  dailyReports: DailyReport[];
}

interface IngredientSeed {
  name: string;
  unit: Unit;
  category: IngredientCategory;
  dailyConsumption: {
    min: number;
    max: number;
    peakMonths: number[];
    peakMultiplier: number;
  };
  unitCostUSD: {
    min: number;
    max: number;
    pricePeakMonths?: number[];
    pricePeakMultiplier?: number;
  };
  leadTimeDays: { min: number; max: number };
  shelfLifeDays: number;
}
export const INGREDIENT_SEEDS: IngredientSeed[] = [
  {
    name: 'Eggs',
    unit: 'dozen',
    category: 'Food',
    dailyConsumption: {
      min: 10,
      max: 30,
      peakMonths: [11, 12, 1],
      peakMultiplier: 1.25,
    },
    unitCostUSD: {
      min: 1.6,
      max: 3.2,
      pricePeakMonths: [3, 4],
      pricePeakMultiplier: 1.2,
    },
    leadTimeDays: { min: 1, max: 2 },
    shelfLifeDays: 21,
  },
  {
    name: 'Bacon Strips',
    unit: 'pound',
    category: 'Food',
    dailyConsumption: {
      min: 5,
      max: 15,
      peakMonths: [7, 8],
      peakMultiplier: 1.3,
    },
    unitCostUSD: {
      min: 3.0,
      max: 6.0,
      pricePeakMonths: [6, 7],
      pricePeakMultiplier: 1.15,
    },
    leadTimeDays: { min: 2, max: 4 },
    shelfLifeDays: 14,
  },
  {
    name: 'Shredded Potatoes (Frozen)',
    unit: 'pound',
    category: 'Food',
    dailyConsumption: {
      min: 8,
      max: 20,
      peakMonths: [12, 1, 2],
      peakMultiplier: 1.2,
    },
    unitCostUSD: {
      min: 0.6,
      max: 1.1,
      pricePeakMonths: [9, 10],
      pricePeakMultiplier: 1.1,
    },
    leadTimeDays: { min: 5, max: 8 },
    shelfLifeDays: 180,
  },
  {
    name: 'Waffle-Batter Mix (Dry)',
    unit: 'pound',
    category: 'Food',
    dailyConsumption: {
      min: 4,
      max: 10,
      peakMonths: [2, 3, 10, 11],
      peakMultiplier: 1.15,
    },
    unitCostUSD: { min: 0.8, max: 1.2 },
    leadTimeDays: { min: 3, max: 5 },
    shelfLifeDays: 365,
  },
  {
    name: 'Whole Milk',
    unit: 'gallon',
    category: 'Beverage',
    dailyConsumption: {
      min: 2,
      max: 6,
      peakMonths: [6, 7, 8],
      peakMultiplier: 1.25,
    },
    unitCostUSD: { min: 3.0, max: 4.5 },
    leadTimeDays: { min: 1, max: 2 },
    shelfLifeDays: 10,
  },
  {
    name: 'Butter',
    unit: 'pound',
    category: 'Food',
    dailyConsumption: {
      min: 1,
      max: 4,
      peakMonths: [11, 12],
      peakMultiplier: 1.3,
    },
    unitCostUSD: { min: 2.2, max: 3.8 },
    leadTimeDays: { min: 2, max: 3 },
    shelfLifeDays: 90,
  },
  {
    name: 'Coffee Beans',
    unit: 'pound',
    category: 'Beverage',
    dailyConsumption: {
      min: 3,
      max: 8,
      peakMonths: [10, 11, 12, 1],
      peakMultiplier: 1.4,
    },
    unitCostUSD: { min: 4.0, max: 7.0 },
    leadTimeDays: { min: 4, max: 7 },
    shelfLifeDays: 365,
  },
  {
    name: 'Maple Syrup',
    unit: 'liter',
    category: 'Food',
    dailyConsumption: {
      min: 1,
      max: 3,
      peakMonths: [12, 1, 2],
      peakMultiplier: 1.35,
    },
    unitCostUSD: { min: 6.0, max: 9.0 },
    leadTimeDays: { min: 5, max: 10 },
    shelfLifeDays: 730,
  },
  {
    name: 'Sugar Packets (White)',
    unit: 'case',
    category: 'Food',
    dailyConsumption: {
      min: 0.3,
      max: 1.0,
      peakMonths: [11, 12, 1],
      peakMultiplier: 1.2,
    },
    unitCostUSD: { min: 15, max: 22 },
    leadTimeDays: { min: 3, max: 6 },
    shelfLifeDays: 1825,
  },
  {
    name: 'Ketchup Packets',
    unit: 'case',
    category: 'Food',
    dailyConsumption: {
      min: 0.4,
      max: 1.2,
      peakMonths: [5, 6, 7, 8],
      peakMultiplier: 1.3,
    },
    unitCostUSD: { min: 12, max: 18 },
    leadTimeDays: { min: 4, max: 7 },
    shelfLifeDays: 1095,
  },
  {
    name: 'Cooking Oil',
    unit: 'gallon',
    category: 'Food',
    dailyConsumption: { min: 1, max: 3, peakMonths: [], peakMultiplier: 1.0 },
    unitCostUSD: {
      min: 7.0,
      max: 11.0,
      pricePeakMonths: [3, 4, 5],
      pricePeakMultiplier: 1.15,
    },
    leadTimeDays: { min: 2, max: 4 },
    shelfLifeDays: 365,
  },
  {
    name: 'American Cheese Slices',
    unit: 'pound',
    category: 'Food',
    dailyConsumption: {
      min: 2,
      max: 6,
      peakMonths: [6, 7, 8],
      peakMultiplier: 1.25,
    },
    unitCostUSD: { min: 3.5, max: 5.5 },
    leadTimeDays: { min: 2, max: 3 },
    shelfLifeDays: 90,
  },
  {
    name: 'Orange Juice (Carton)',
    unit: 'gallon',
    category: 'Beverage',
    dailyConsumption: {
      min: 1,
      max: 4,
      peakMonths: [5, 6, 7, 8],
      peakMultiplier: 1.4,
    },
    unitCostUSD: { min: 4.0, max: 6.5 },
    leadTimeDays: { min: 2, max: 3 },
    shelfLifeDays: 30,
  },
  {
    name: 'White Bread Loaf',
    unit: 'each',
    category: 'Food',
    dailyConsumption: { min: 8, max: 18, peakMonths: [], peakMultiplier: 1.0 },
    unitCostUSD: { min: 1.2, max: 2.0 },
    leadTimeDays: { min: 1, max: 2 },
    shelfLifeDays: 7,
  },
  {
    name: 'Sausage Links',
    unit: 'pound',
    category: 'Food',
    dailyConsumption: {
      min: 4,
      max: 12,
      peakMonths: [11, 12, 1],
      peakMultiplier: 1.25,
    },
    unitCostUSD: { min: 3.0, max: 5.0 },
    leadTimeDays: { min: 3, max: 5 },
    shelfLifeDays: 60,
  },
  {
    name: 'Ham Steak',
    unit: 'pound',
    category: 'Food',
    dailyConsumption: {
      min: 2,
      max: 6,
      peakMonths: [4, 12],
      peakMultiplier: 1.35,
    },
    unitCostUSD: { min: 4.0, max: 6.5 },
    leadTimeDays: { min: 3, max: 5 },
    shelfLifeDays: 60,
  },
  {
    name: 'Dish Detergent',
    unit: 'gallon',
    category: 'Cleaning',
    dailyConsumption: {
      min: 0.1,
      max: 0.3,
      peakMonths: [],
      peakMultiplier: 1.0,
    },
    unitCostUSD: { min: 8.0, max: 11.0 },
    leadTimeDays: { min: 7, max: 14 },
    shelfLifeDays: 1825,
  },
  {
    name: 'Paper Napkins',
    unit: 'case',
    category: 'Packaging',
    dailyConsumption: {
      min: 0.2,
      max: 0.6,
      peakMonths: [6, 7, 8],
      peakMultiplier: 1.2,
    },
    unitCostUSD: { min: 18, max: 26 },
    leadTimeDays: { min: 7, max: 14 },
    shelfLifeDays: 1825,
  },
  {
    name: 'Paper Cups (Hot)',
    unit: 'case',
    category: 'Packaging',
    dailyConsumption: {
      min: 0.3,
      max: 1.0,
      peakMonths: [10, 11, 12, 1],
      peakMultiplier: 1.5,
    },
    unitCostUSD: { min: 24, max: 32 },
    leadTimeDays: { min: 7, max: 14 },
    shelfLifeDays: 1825,
  },
  {
    name: 'To-Go Clamshell Containers',
    unit: 'case',
    category: 'Packaging',
    dailyConsumption: {
      min: 0.15,
      max: 0.4,
      peakMonths: [5, 6, 7],
      peakMultiplier: 1.3,
    },
    unitCostUSD: { min: 28, max: 38 },
    leadTimeDays: { min: 7, max: 14 },
    shelfLifeDays: 1825,
  },
  {
    name: 'Salt',
    unit: 'pound',
    category: 'Food',
    dailyConsumption: {
      min: 0.2,
      max: 0.6,
      peakMonths: [],
      peakMultiplier: 1.0,
    },
    unitCostUSD: { min: 0.3, max: 0.6 },
    leadTimeDays: { min: 5, max: 10 },
    shelfLifeDays: 3650,
  },
  {
    name: 'Ground Black Pepper',
    unit: 'pound',
    category: 'Food',
    dailyConsumption: {
      min: 0.05,
      max: 0.15,
      peakMonths: [],
      peakMultiplier: 1.0,
    },
    unitCostUSD: { min: 3.5, max: 6.0 },
    leadTimeDays: { min: 5, max: 10 },
    shelfLifeDays: 1095,
  },
  {
    name: 'Half-and-Half Creamers',
    unit: 'case',
    category: 'Food',
    dailyConsumption: {
      min: 0.25,
      max: 0.8,
      peakMonths: [10, 11, 12, 1],
      peakMultiplier: 1.35,
    },
    unitCostUSD: { min: 12, max: 18 },
    leadTimeDays: { min: 2, max: 4 },
    shelfLifeDays: 120,
  },
  {
    name: 'Onions (Yellow)',
    unit: 'pound',
    category: 'Food',
    dailyConsumption: {
      min: 1,
      max: 4,
      peakMonths: [4, 5, 9, 10],
      peakMultiplier: 1.2,
    },
    unitCostUSD: { min: 0.7, max: 1.2 },
    leadTimeDays: { min: 2, max: 3 },
    shelfLifeDays: 30,
  },
  {
    name: 'Strawberry Topping (Frozen)',
    unit: 'pound',
    category: 'Food',
    dailyConsumption: {
      min: 0.5,
      max: 2.0,
      peakMonths: [5, 6],
      peakMultiplier: 1.5,
    },
    unitCostUSD: { min: 2.0, max: 3.5 },
    leadTimeDays: { min: 5, max: 8 },
    shelfLifeDays: 365,
  },
] as const;

function randomBetween(min: number, max: number) {
  return faker.number.float({ min, max, fractionDigits: 2 });
}

function getMultiplier(month: number, months: number[] | undefined, m = 1) {
  return months?.includes(month) ? m : 1;
}

export function fabricateDailyConsumption(seed: IngredientSeed, date: Date) {
  const { min, max, peakMonths, peakMultiplier } = seed.dailyConsumption;
  const base = randomBetween(min, max);
  return base * getMultiplier(date.getMonth() + 1, peakMonths, peakMultiplier);
}

export function fabricateUnitCostUSD(seed: IngredientSeed, date: Date) {
  const { min, max, pricePeakMonths, pricePeakMultiplier } = seed.unitCostUSD;
  const base = randomBetween(min, max);
  return (
    base *
    getMultiplier(date.getMonth() + 1, pricePeakMonths, pricePeakMultiplier)
  );
}

export function fabricateLeadTimeDays(seed: IngredientSeed) {
  const { min, max } = seed.leadTimeDays;
  return randomBetween(min, max);
}

// -------------------------------------------------------------------------
// 🎛  Simulation parameters – tweak as you wish
// -------------------------------------------------------------------------
const SIM_DAYS = 365 * 5; // five years of history
const WASTAGE_MIN_PCT = 0.01; // 1 – 5 % of daily usage
const WASTAGE_MAX_PCT = 0.05;
const SAFETY_STOCK_FRACT = 0.5; // 50 % of max daily need × max lead‑time
const REORDER_FRAC = 0.25; // 25 % of same
const DELIVERY_SIZE_DAYS = 7; // cover X days of max demand when we reorder

// -------------------------------------------------------------------------
// 📐  Helper functions
// -------------------------------------------------------------------------
function formatISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10) as ISODate; // YYYY‑MM‑DD
}

function fabricateUnitPrice(seed: IngredientSeed, date: Date): number {
  const {
    min,
    max,
    pricePeakMonths,
    pricePeakMultiplier = 1,
  } = seed.unitCostUSD;
  const base = randomBetween(min, max);
  return Number(
    (
      base *
      getMultiplier(date.getMonth() + 1, pricePeakMonths, pricePeakMultiplier)
    ).toFixed(2),
  );
}

function fabricateWastage(consumption: number): number {
  const pct = faker.number.float({
    min: WASTAGE_MIN_PCT,
    max: WASTAGE_MAX_PCT,
    fractionDigits: 2,
  });
  return Number((consumption * pct).toFixed(2));
}

// -------------------------------------------------------------------------
// 🏭  Core generator – turns a single seed into a full Ingredient entity
// -------------------------------------------------------------------------
function generateIngredient(
  seed: IngredientSeed,
  start: Date,
  days: number,
): Ingredient {
  // ---------- static properties ----------
  const id = faker.string.uuid();
  const safetyStock = Math.round(
    seed.dailyConsumption.max * seed.leadTimeDays.max * SAFETY_STOCK_FRACT,
  );
  const reorderPoint = Math.round(
    seed.dailyConsumption.max * seed.leadTimeDays.max * REORDER_FRAC,
  );

  // ---------- time series ----------
  const dailyReports: DailyReport[] = [];

  // ---------- rolling state ----------
  let inventory = Math.round(seed.dailyConsumption.max * seed.leadTimeDays.max); // day‑0 stock

  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    const iso = formatISO(day);

    // ---- price ----
    const unitPrice = fabricateUnitPrice(seed, day);

    // ---- consumption + wastage ----
    const used = fabricateDailyConsumption(seed, day);
    const wasted = fabricateWastage(used);

    // ---- inventory update ----
    inventory -= used + wasted;

    let deliveryQty = 0;

    // ---- reorder logic ----
    if (inventory < reorderPoint) {
      deliveryQty = Math.round(seed.dailyConsumption.max * DELIVERY_SIZE_DAYS);
      inventory += deliveryQty;
    }

    // ---- snapshot EOD inventory ----
    dailyReports.push({
      date: iso,
      price: unitPrice,
      inventory,
      consumption: used,
      wastage: wasted,
      delivered: deliveryQty,
    });
  }

  return {
    id,
    name: seed.name,
    category: seed.category,
    unit: seed.unit,
    safetyStock,
    reorderPoint,
    leadTimeDays: faker.number.int(seed.leadTimeDays), // pick a concrete lead‑time inside the range
    currentInventory: inventory,
    currentUnitCostUSD: dailyReports[dailyReports.length - 1].price,
    dailyReports,
  };
}

// -------------------------------------------------------------------------
// 🚀  Generate the full dataset & export
// -------------------------------------------------------------------------
const SIM_START = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setFullYear(d.getFullYear() - 5); // back‑date by one year
  return d;
})();

export const INGREDIENTS: Ingredient[] = INGREDIENT_SEEDS.map((seed) =>
  generateIngredient(seed, SIM_START, SIM_DAYS),
);
