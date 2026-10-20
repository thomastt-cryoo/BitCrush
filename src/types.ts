export type Value = string | number | boolean;
export interface Control {
  id: string;
  label: string;
  type: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: Value;
  description?: string;
  tooltip?: string;
  unit?: string;
  options?: Array<{ label: string; value: string | number }>;
}
export interface Algorithm {
  metadata: { id: string; name: string; category: string; description: string; complexity: string; author?: string; year?: number };
  features: Record<string, boolean>;
  controls: Control[];
}
export interface Palette {
  category: string;
  name: string;
  color_count: number;
  colors: Array<{ r: number; g: number; b: number; percentage?: number }>;
}
export interface Stage { id: string; type: string; name: string; enabled: boolean; params: Record<string, any> }
export interface Project {
  version: 1;
  algorithmId: string;
  mode: 'dither' | 'halftone';
  ditherParams: Record<string, any>;
  palette: Palette;
  adjustments: Record<string, any>;
  halftone: Record<string, any>;
  effects: Stage[];
}
export interface Preset { name: string; project: Project }
