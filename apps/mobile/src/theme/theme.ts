/**
 * InnocenZ PR app theme — 1:1 port of InnocenZ-proto `prototype-theme.css`
 * (Lavender Dream palette, Sora + Manrope + Playfair Display).
 * Values are copied verbatim from the CSS custom properties so the Expo app
 * renders exactly like the prototype's PR phone view.
 */
import { Platform } from 'react-native';

export const C = {
  bg: '#1a1726',
  bg2: '#141120',
  panel: '#211d2e',
  panel2: '#2a2538',
  glass: 'rgba(232,224,245,0.04)',
  glass2: 'rgba(232,224,245,0.07)',
  line: 'rgba(232,224,245,0.11)',
  line2: 'rgba(232,224,245,0.17)',
  violet: '#b79ce8',
  violetL: '#d4c4f5',
  violetInk: 'rgba(183,156,232,0.16)',
  gold: '#b79ce8',
  goldD: '#9b7ed9',
  goldL: '#d4c4f5',
  accent: '#e3b877',
  accentD: '#c99b4e',
  accentL: '#f2d9a0',
  txt: '#ede7f7',
  muted: '#b6aac8',
  muted2: '#8d82a0',
  /** `.iz-pr-app` brighter secondary text on dark panels */
  prMuted: '#c8b8dc',
  prMuted2: '#b4a4c8',
  green: '#5dd9a0',
  greenBg: 'rgba(93,217,160,0.12)',
  red: '#f08a8a',
  redBg: 'rgba(240,138,138,0.12)',
  amber: '#e8c66a',
  amberBg: 'rgba(232,198,106,0.12)',
  blue: '#9bb8ff',
  tabbarH: 64,
  /* Readable type scale — matches --iz-fs-* */
  fsBase: 20,
  fsTiny: 17,
  fsSm: 19,
  fsLabel: 16,
} as const;

/** Font stacks — real webfonts on web, system fallback on native. */
export const F = {
  sora: Platform.OS === 'web' ? "'Sora', sans-serif" : undefined,
  manrope: Platform.OS === 'web' ? "'Manrope', sans-serif" : undefined,
  playfair: Platform.OS === 'web' ? "'Playfair Display', Georgia, serif" : 'serif',
} as const;

/**
 * CSS gradient on web (react-native-web supports `backgroundImage`),
 * solid fallback colour on native.
 */
export function grad(css: string, fallback: string) {
  return Platform.OS === 'web'
    ? ({ backgroundImage: css } as object)
    : ({ backgroundColor: fallback } as object);
}

export const GRADIENTS = {
  /** --iz-grad-accent — champagne gold CTA */
  accent: 'linear-gradient(135deg, #f2d9a0 0%, #e3b877 46%, #c99b4e 100%)',
  /** --iz-grad — lavender */
  violet: 'linear-gradient(135deg, #cdb8f0 0%, #b79ce8 50%, #9b7ed9 100%)',
  /** --iz-grad-gold (violet in this palette) */
  gold: 'linear-gradient(135deg, #cdb8f0 0%, #b79ce8 45%, #9b7ed9 100%)',
  phone: 'linear-gradient(180deg, #1a1726 0%, #141120 100%)',
  topbar: 'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, transparent 100%)',
  card: 'linear-gradient(180deg, rgba(232,224,245,0.06), rgba(232,224,245,0.02))',
  sectionClosed: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01))',
  sectionOpen: 'linear-gradient(180deg, rgba(183,156,232,0.06), rgba(255,255,255,0.01))',
  shiftCard: 'linear-gradient(180deg, rgba(232,194,122,0.1), rgba(255,255,255,0.02))',
  avatarGold: 'linear-gradient(135deg, #C99B4E, #8a5e22)',
  shell:
    'radial-gradient(1100px 700px at 70% -10%, rgba(183,156,232,0.16), transparent 60%), radial-gradient(800px 500px at -10% 110%, rgba(155,126,217,0.08), transparent 55%), radial-gradient(500px 300px at 50% 50%, rgba(0,0,0,0.35), transparent)',
} as const;

/** Minimal DOM surface — the RN tsconfig has no `dom` lib. */
type WebDocument = {
  getElementById(id: string): unknown;
  createElement(tag: string): { id: string; rel: string; href: string; textContent: string };
  head: { appendChild(node: unknown): void };
};

/** Inject Google Fonts once on web so Sora/Manrope/Playfair render exactly. */
export function ensureWebFonts() {
  const doc = (globalThis as { document?: WebDocument }).document;
  if (Platform.OS !== 'web' || !doc) return;
  if (doc.getElementById('iz-fonts')) return;
  const link = doc.createElement('link');
  link.id = 'iz-fonts';
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&family=Playfair+Display:wght@700;800&display=swap';
  doc.head.appendChild(link);
  const style = doc.createElement('style');
  style.textContent =
    'html,body,#root{background:#1a1726;} ::-webkit-scrollbar{display:none;} *{scrollbar-width:none;}';
  doc.head.appendChild(style);
}
