import { importPresetObject, validatePreset } from './engine/vendor/preset-original.mjs';
import { buildOriginalPipeline } from './engine/vendor/pipeline-original.mjs';

// Source schema: preset-schema-source.json, renderer UTF-16 [466888,474774).
// Keep this document separate from the convenience fields in a BitCrush Project.
export interface OriginalPresetIssue { field: string; message: string; severity: 'error' | 'warning' }
export interface OriginalPresetInstance {
  type: string;
  instanceId: string;
  label: string;
  customLabel?: string;
  settings: Record<string, unknown>;
  isDuplicatable: boolean;
  isOriginal: boolean;
  [extension: string]: unknown;
}
export interface OriginalPresetGraph {
  effectInstances: Record<string, OriginalPresetInstance>;
  pipelineOrder: string[];
  halftone?: Record<string, unknown>;
}
export interface OriginalPreset extends OriginalPresetGraph {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  version: string;
  colorPalette: {
    category: string; paletteId: string; customColors: string[];
    colorDepth: number; orderedCycling?: boolean;
    [extension: string]: unknown;
  };
  dither: {
    category: string; style: string; scale: number;
    luminanceThreshold: number; controls: Record<string, unknown>;
    [extension: string]: unknown;
  };
  [extension: string]: unknown;
}
export interface OriginalPresetEnvelope {
  type: 'dither-boy-preset';
  version: string;
  preset: OriginalPreset;
  exportedAt?: number;
  exportedBy?: string;
  [extension: string]: unknown;
}
type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export interface OriginalPresetDocument {
  readonly originalText: string;
  readonly envelope: DeepReadonly<OriginalPresetEnvelope>;
  readonly issues: readonly OriginalPresetIssue[];
  readonly edited: boolean;
}
export type OriginalPresetPath = readonly (string | number)[];
export type OriginalEffectGroup = 'adjustments' | 'dither' | 'postProcessing' | 'tint' | 'epsilonGlow' | 'jpegGlitch' | 'chromaticEffects' | 'temporalVariation';
export type OriginalFlatFallbacks = Partial<Record<OriginalEffectGroup, Record<string, unknown>>>;
export interface OriginalPipelineStage { id: string; enabled: unknown; params: Record<string, unknown> }

export class OriginalPresetError extends Error {
  readonly issues: readonly OriginalPresetIssue[];
  constructor(message: string, issues: readonly OriginalPresetIssue[] = []) {
    super(message); this.name = 'OriginalPresetError'; this.issues = issues;
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);

function validateEnvelope(input: unknown): OriginalPresetIssue[] {
  // The shipped import helper provides the exact original envelope/size checks.
  // Its sanitized output is deliberately discarded: only its diagnostics are used.
  const result = importPresetObject(input) as { success: boolean; error?: string };
  const issues = object(input) && input.preset
    ? validatePreset(input.preset) as OriginalPresetIssue[] : [];
  if (!result.success) throw new OriginalPresetError(result.error || 'Invalid original preset.', issues);
  return issues;
}

function document(originalText: string, envelope: OriginalPresetEnvelope, edited: boolean): OriginalPresetDocument {
  const issues = validateEnvelope(envelope);
  return freeze({ originalText, envelope, issues, edited });
}

/** Validate the original format while retaining the unsanitized complete input. */
export function parseOriginalPreset(text: string): OriginalPresetDocument {
  let input: unknown;
  try { input = JSON.parse(text); }
  catch { throw new OriginalPresetError('Failed to parse preset file.'); }
  return document(text, input as OriginalPresetEnvelope, false);
}

function assertJson(value: unknown): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach(assertJson); return; }
  if (object(value) && Object.getPrototypeOf(value) === Object.prototype) { Object.values(value).forEach(assertJson); return; }
  throw new OriginalPresetError('Edited preset values must be finite JSON values; unsupported values would lose data.');
}

/** Replace one explicitly addressed value; never synthesize a missing parent. */
export function patchOriginalPresetLeaf(source: OriginalPresetDocument, path: OriginalPresetPath, value: unknown): OriginalPresetDocument {
  if (!path.length) throw new OriginalPresetError('A preset field path is required.');
  assertJson(value);
  const envelope = structuredClone(source.envelope) as OriginalPresetEnvelope;
  let parent: unknown = envelope;
  for (const key of path.slice(0, -1)) {
    if (!parent || typeof parent !== 'object' || !own(parent, key)) throw new OriginalPresetError(`Cannot patch missing preset parent: ${path.join('.')}`);
    parent = (parent as Record<string | number, unknown>)[key];
  }
  const key = path.at(-1)!;
  if (Array.isArray(parent)) {
    if (typeof key !== 'number' || !Number.isInteger(key) || key < 0 || key >= parent.length) throw new OriginalPresetError('Preset array edits require an existing numeric index.');
    parent[key] = structuredClone(value);
  } else if (object(parent) && typeof key === 'string') {
    // Define an own JSON property, including extension keys, without setters.
    Object.defineProperty(parent, key, { value: structuredClone(value), enumerable: true, writable: true, configurable: true });
  } else throw new OriginalPresetError(`Cannot patch non-object preset parent: ${path.join('.')}`);
  return document(source.originalText, envelope, true);
}

export interface OriginalPresetExportMetadata { updatedAt?: number; exportedAt?: number; exportedBy?: string }
/** Untouched documents are byte-identical. Edited documents retain all JSON fields. */
export function serializeOriginalPreset(source: OriginalPresetDocument, metadata?: OriginalPresetExportMetadata): string {
  if (!source.edited && !metadata) return source.originalText;
  const envelope = structuredClone(source.envelope) as OriginalPresetEnvelope;
  if (metadata?.updatedAt !== undefined) envelope.preset.updatedAt = metadata.updatedAt;
  if (metadata?.exportedAt !== undefined) envelope.exportedAt = metadata.exportedAt;
  if (metadata?.exportedBy !== undefined) envelope.exportedBy = metadata.exportedBy;
  assertJson(envelope);
  validateEnvelope(envelope);
  return JSON.stringify(envelope, null, 2);
}

/** A detached graph for editors; changing it cannot mutate the retained document. */
export function getOriginalPresetGraph(source: OriginalPresetDocument): OriginalPresetGraph {
  const { effectInstances, pipelineOrder, halftone } = source.envelope.preset;
  return structuredClone({ effectInstances, pipelineOrder, ...(halftone === undefined ? {} : { halftone }) }) as OriginalPresetGraph;
}

const groups: Record<string, OriginalEffectGroup> = {
  adjustments: 'adjustments', 'dither-style': 'dither', dither: 'dither',
  'post-processing': 'postProcessing', tint: 'tint', 'epsilon-glow': 'epsilonGlow',
  'jpeg-glitch': 'jpegGlitch', 'chromatic-effects': 'chromaticEffects', 'temporal-variation': 'temporalVariation',
};

/** Resolve the original graph without recreating it from flat Project fields.
 * Missing references need the original flat UI state, supplied explicitly. That
 * state can depend on previous UI values when a preset omits a field; deriving
 * it from defaults or another instance would guess. ID-prefix dispatch follows
 * original worker [30105,32893), including repeated order entries and halftone.
 */
export function buildOriginalPresetPipeline(source: OriginalPresetDocument, flatFallbacks: OriginalFlatFallbacks = {}): OriginalPipelineStage[] {
  const graph = getOriginalPresetGraph(source);
  if (!object(graph.effectInstances)) throw new OriginalPresetError('The original instance map cannot be represented as an object.');
  for (const id of graph.pipelineOrder) {
    const base = id.replace(/-\d+$/, '');
    const group = own(groups, base) ? groups[base] : undefined;
    const instance = own(graph.effectInstances, id) ? graph.effectInstances[id] : undefined;
    if (!instance) {
      if (!group || !own(flatFallbacks, group) || !object(flatFallbacks[group])) {
        throw new OriginalPresetError(`Cannot reconstruct original flat fallback for missing pipeline instance "${id}". Supply its captured flat effect settings explicitly.`);
      }
    } else if (!object(instance.settings)) throw new OriginalPresetError(`Instance "${id}" has no usable settings object.`);
    if (!group && base !== 'halftone' && instance?.settings.enabled) {
      throw new OriginalPresetError(`Enabled original processor "${id}" is not supported; it cannot be silently omitted.`);
    }
  }
  // The original global halftone object replaces dither slots. Do not infer an
  // enabled flag, supersample, fractional unit conversion, or extra stage.
  const settings = { ...structuredClone(flatFallbacks), halftone: graph.halftone };
  return buildOriginalPipeline(settings, graph.effectInstances, graph.pipelineOrder) as OriginalPipelineStage[];
}
