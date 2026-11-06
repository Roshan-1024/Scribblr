import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 20, ...p }: P) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p,
});

export const IconSelect = (p: P) => <svg {...base(p)}><path d="M5 3l14 8-6 1.5L10 19z" /></svg>;
export const IconPen = (p: P) => <svg {...base(p)}><path d="M4 20l1-4L16 5l3 3L8 19z" /><path d="M14 7l3 3" /></svg>;
export const IconHighlighter = (p: P) => <svg {...base(p)}><path d="M9 14l-4 4v2h5l4-4" /><path d="M9 14l7-9 4 4-9 7z" /></svg>;
export const IconEraser = (p: P) => <svg {...base(p)}><path d="M16 4l5 5-10 10H6l-3-3z" /><path d="M11 9l5 5M6 19h14" /></svg>;
export const IconLasso = (p: P) => <svg {...base(p)}><ellipse cx="12" cy="9" rx="8" ry="5" strokeDasharray="3 2.5" /><path d="M7 13c-1 2 0 4 2 4s2 3 0 4" /></svg>;
export const IconUndo = (p: P) => <svg {...base(p)}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 010 10h-3" /></svg>;
export const IconRedo = (p: P) => <svg {...base(p)}><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 000 10h3" /></svg>;
export const IconLock = (p: P) => <svg {...base(p)}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>;
export const IconUnlock = (p: P) => <svg {...base(p)}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 017.5-2" /></svg>;
export const IconChevronDown = (p: P) => <svg {...base({ size: 16, ...p })}><path d="M6 9l6 6 6-6" /></svg>;
export const IconChevronRight = (p: P) => <svg {...base({ size: 16, ...p })}><path d="M9 6l6 6-6 6" /></svg>;
export const IconChevronLeft = (p: P) => <svg {...base(p)}><path d="M15 6l-6 6 6 6" /></svg>;
export const IconPlus = (p: P) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>;
export const IconMinus = (p: P) => <svg {...base(p)}><path d="M5 12h14" /></svg>;
export const IconTarget = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;
export const IconBoard = (p: P) => <svg {...base(p)}><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 21h8" /></svg>;
export const IconTrash = (p: P) => <svg {...base(p)}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;
export const IconSend = (p: P) => <svg {...base(p)}><path d="M4 12l16-8-6 16-3-7z" /></svg>;
export const IconClose = (p: P) => <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const IconCopy = (p: P) => <svg {...base(p)}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" /></svg>;
export const IconGrid = (p: P) => <svg {...base(p)}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>;
export const IconLogout = (p: P) => <svg {...base(p)}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>;
export const IconEye = (p: P) => <svg {...base(p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
export const IconEyeOff = (p: P) => <svg {...base(p)}><path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0112 5c6.5 0 10 7 10 7a17.6 17.6 0 01-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.3" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></svg>;
export const IconCrown = (p: P) => <svg {...base(p)} fill="currentColor" stroke="none"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5z" /></svg>;
