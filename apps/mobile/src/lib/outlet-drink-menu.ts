/**
 * Per-outlet drink menus — port of InnocenZ-proto / agency-portal
 * `outlet-drink-menu.ts` (Velvet 23 self-log list).
 */

export type OutletDrinkPrice = {
  id: string;
  name: string;
  priceRm: number;
};

export const DEFAULT_OUTLET_DRINK_MENU: OutletDrinkPrice[] = [
  { id: 'booking-com', name: 'Booking commission', priceRm: 100 },
  { id: 'cosmo', name: 'Cosmo', priceRm: 150 },
  { id: 'heradura-anejo-ultra', name: 'Heradura anejo ultra', priceRm: 150 },
  { id: 'laddies-drink', name: 'Ladies drink', priceRm: 150 },
  { id: 'dom-perignon', name: 'Dom perignon', priceRm: 200 },
  { id: 'donjulio', name: 'Donjulio', priceRm: 200 },
  { id: 'havoc', name: 'Havoc', priceRm: 1000 },
];

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
};

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
