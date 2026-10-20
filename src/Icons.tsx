import type { CSSProperties } from 'react';
import logo from '../icon.svg';

const paths: Record<string, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  down: <path d="m6 9 6 6 6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 3-6 6 8" /></>,
  sliders: <><path d="M4 7h4m4 0h8M4 17h8m4 0h4" /><circle cx="10" cy="7" r="2" /><circle cx="14" cy="17" r="2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  moon: <path d="M20 14a8 8 0 0 1-10-10A8.5 8.5 0 1 0 20 14Z" />,
  compare: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></>,
  undo: <><path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7v3" /></>,
  redo: <><path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0-7 7v3" /></>,
  fit: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5" /><rect x="7" y="7" width="10" height="10" rx="1" /></>,
  minus: <path d="M5 12h14" />,
  reset: <><path d="M3 4v6h6M3.5 10a8.5 8.5 0 1 1 .5 6" /></>,
  close: <path d="m5 5 14 14M5 19 19 5" />,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" /></>,
  folder: <path d="M3 7V4h6l3 3h9v13H3Z" />,
  layers: <><path d="m12 3 10 5-10 5L2 8Z" /><path d="m2 12 10 5 10-5M2 16l10 5 10-5" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  star: <path d="m12 3 3 6 6 1-4.5 4.5 1 6.5L12 18l-5.5 3 1-6.5L3 10l6-1Z" />,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
};

export function Icon({ name, size = 18, style }: { name: string; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name] ?? paths.grid}</svg>;
}

export function Mark() {
  return <img className="mark" src={logo} alt="" aria-hidden="true" />;
}
