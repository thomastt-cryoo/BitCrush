import originalAlgorithms from './data/algorithms.json';
import originalPalettes from './data/palettes.json';
import { defaults } from './engine';
import type { Algorithm, Palette, Project } from './types';
import { projectFromOriginalPreset, restoreOriginalCompatibility } from './original-project';

export const algorithms = originalAlgorithms as Algorithm[];
export const palettes = originalPalettes as Palette[];
export const categories = [
  ['basic', 'Basic'], ['error-diffusion', 'Error diffusion'], ['ordered', 'Ordered'],
  ['patterned', 'Patterned'], ['glitch-effects', 'Glitch effects'], ['polygon', 'Polygon'], ['special-effects', 'Special effects'],
] as const;
export const grayscale: Palette = { name: 'Grayscale', category: 'Simple', color_count: 2, colors: [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }] };
export const allPalettes = [grayscale, ...palettes];
export const initialProject = (): Project => ({
  version: 1, algorithmId: 'none', mode: 'dither',
  ditherParams: { scaleDpi: 45, luminanceThreshold: 50, colorDepth: 8 },
  palette: structuredClone(grayscale), adjustments: structuredClone(defaults.adjustments),
  halftone: structuredClone(defaults.halftone), effects: [],
});

export function validateProject(input: unknown): Project {
  const p = input as Project;
  if (p?.version === 1 && p.originalCompatibility) {
    return { ...structuredClone(p), ...projectFromOriginalPreset(restoreOriginalCompatibility(p.originalCompatibility)) };
  }
  if (!p || p.version !== 1 || !algorithms.some(a => a.metadata.id === p.algorithmId) || !['dither', 'halftone'].includes(p.mode)
    || !Array.isArray(p.palette?.colors) || !p.palette.colors.length || !p.adjustments || !p.ditherParams || !p.halftone || !Array.isArray(p.effects)) {
    throw new Error('This file is not a supported BitCrush project. The original file has not been changed.');
  }
  if (p.palette.colors.length > 1024 || p.effects.length > 100) throw new Error('This project exceeds the supported size.');
  return structuredClone(p);
}

export function label(key: string) { return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()); }
export function hex(color: Palette['colors'][number]) { return '#' + [color.r, color.g, color.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }
