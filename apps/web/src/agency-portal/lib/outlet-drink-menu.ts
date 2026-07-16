/** Per-outlet drink menus — no agency/pr imports (safe for pr-demo). */

export interface OutletDrinkPrice {
  id: string;
  name: string;
  priceRm: number;
}

export const DEFAULT_OUTLET_DRINK_MENU: OutletDrinkPrice[] = [
  { id: 'booking-com', name: 'Booking commission', priceRm: 100 },
  { id: 'cosmo', name: 'Cosmo', priceRm: 150 },
  { id: 'heradura-anejo-ultra', name: 'Heradura anejo ultra', priceRm: 150 },
  { id: 'laddies-drink', name: 'Laddies drink', priceRm: 150 },
  { id: 'dom-perignon', name: 'Dom perignon', priceRm: 200 },
  { id: 'donjulio', name: 'Donjulio', priceRm: 200 },
  { id: 'havoc', name: 'Havoc', priceRm: 1000 },
];

/** Per-outlet drink menus — prices differ by venue */
export const OUTLET_DRINK_MENUS: Record<string, OutletDrinkPrice[]> = {
  'Velvet 23': DEFAULT_OUTLET_DRINK_MENU.map((d) => ({ ...d })),
  Mermate: [
    { id: 'mojito', name: 'Mojito', priceRm: 55 },
    { id: 'mermaid-spritz', name: 'Mermaid Spritz', priceRm: 68 },
    { id: 'prosecco', name: 'Prosecco', priceRm: 95 },
    { id: 'hennessy', name: 'Hennessy VSOP', priceRm: 290 },
  ],
  'Bear Lounge': [
    { id: 'lager', name: 'Craft Lager', priceRm: 42 },
    { id: 'old-fashioned', name: 'Old Fashioned', priceRm: 78 },
    { id: 'wine-glass', name: 'House Wine', priceRm: 72 },
    { id: 'champagne', name: 'Champagne', priceRm: 320 },
  ],
  'Onyx KL': [
    { id: 'gin-tonic', name: 'Gin & Tonic', priceRm: 58 },
    { id: 'whisky', name: 'Premium Whisky', priceRm: 135 },
    { id: 'cocktail', name: 'Signature Cocktail', priceRm: 88 },
    { id: 'dom-perignon', name: 'Dom Pérignon', priceRm: 480 },
  ],
  'Urban Soul': [
    { id: 'beer', name: 'Beer', priceRm: 40 },
    { id: 'sake', name: 'Sake', priceRm: 65 },
    { id: 'soju', name: 'Soju', priceRm: 48 },
    { id: 'whisky', name: 'Whisky', priceRm: 110 },
  ],
};

const FALLBACK_DRINK_RM = 120;

export function getDrinkMenuForOutlet(outlet: string): OutletDrinkPrice[] {
  const trimmed = outlet
    .trim()
    .replace(/\s+KL$/i, '')
    .trim();
  return (
    OUTLET_DRINK_MENUS[trimmed] ??
    OUTLET_DRINK_MENUS[outlet.trim()] ??
    DEFAULT_OUTLET_DRINK_MENU.map((d) => ({ ...d }))
  );
}

export function averageDrinkPrice(menu: OutletDrinkPrice[]): number {
  if (menu.length === 0) return FALLBACK_DRINK_RM;
  const total = menu.reduce((sum, d) => sum + d.priceRm, 0);
  return Math.round(total / menu.length);
}

export function drinkMenuPriceRange(menu: OutletDrinkPrice[]): {
  min: number;
  max: number;
} {
  if (menu.length === 0)
    return { min: FALLBACK_DRINK_RM, max: FALLBACK_DRINK_RM };
  const prices = menu.map((d) => d.priceRm);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
