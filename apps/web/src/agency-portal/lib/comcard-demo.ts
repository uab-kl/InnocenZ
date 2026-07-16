export type ComcardDemoStyle = {
  /** Display name on the comcard plate */
  plate: string;
  bgFrom: string;
  bgMid: string;
  bgTo: string;
  skin: string;
  hair: string;
  outfit: string;
  outfitAccent: string;
  /** Slight body rotation for pose variety */
  poseDeg: number;
  /** Scale tweak for height feel */
  figureScale: number;
};

export const DEMO_COMCARDS: Record<string, ComcardDemoStyle> = {
  p1: {
    plate: 'VICKY',
    bgFrom: 'rgba(88, 28, 135, 0.55)',
    bgMid: 'rgba(22, 18, 38, 0.95)',
    bgTo: 'rgba(217, 185, 122, 0.22)',
    skin: 'rgba(255, 218, 198, 0.92)',
    hair: 'rgba(35, 22, 18, 0.95)',
    outfit: 'rgba(217, 185, 122, 0.72)',
    outfitAccent: 'rgba(255, 240, 210, 0.35)',
    poseDeg: -4,
    figureScale: 1.04,
  },
};

const DEFAULT_COMCARD: ComcardDemoStyle = {
  plate: 'PR',
  bgFrom: 'rgba(88, 28, 135, 0.45)',
  bgMid: 'rgba(30, 27, 46, 0.92)',
  bgTo: 'rgba(217, 185, 122, 0.12)',
  skin: 'rgba(255, 220, 198, 0.85)',
  hair: 'rgba(45, 30, 25, 0.9)',
  outfit: 'rgba(167, 139, 250, 0.65)',
  outfitAccent: 'rgba(255, 255, 255, 0.2)',
  poseDeg: 0,
  figureScale: 1,
};

export function getComcardDemoStyle(
  prId?: string,
  name?: string,
): ComcardDemoStyle {
  if (prId && DEMO_COMCARDS[prId]) return DEMO_COMCARDS[prId];
  if (name) {
    const key = Object.keys(DEMO_COMCARDS).find(
      (id) =>
        DEMO_COMCARDS[id].plate === name.toUpperCase() ||
        DEMO_COMCARDS[id].plate.startsWith(name.toUpperCase()),
    );
    if (key) return DEMO_COMCARDS[key];
  }
  return {
    ...DEFAULT_COMCARD,
    plate: name?.toUpperCase().slice(0, 12) ?? 'PR',
  };
}
