import defaults from './engine/vendor/original-defaults.json';
import algorithmData from './data/algorithms.json';
import { createPreset, exportPresetObject } from './engine/vendor/preset-original.mjs';
import {
  buildOriginalPresetPipeline, getOriginalPresetGraph, OriginalPresetError,
  parseOriginalPreset, patchOriginalPresetLeaf, serializeOriginalPreset,
  type OriginalPresetDocument, type OriginalPresetInstance,
} from './original-preset';
import type { Project, Stage } from './types';

const prefixes: Record<string, string> = { postProcessing: 'post-processing', tint: 'tint', epsilonGlow: 'epsilon-glow', jpegGlitch: 'jpeg-glitch', chromaticEffects: 'chromatic-effects', temporalVariation: 'temporal-variation' };
const groups: Record<string, string> = { adjustments: 'adjustments', 'dither-style': 'dither', dither: 'dither', ...Object.fromEntries(Object.entries(prefixes).map(([type, prefix]) => [prefix, type])) };
const names: Record<string, string> = { postProcessing: 'Post processing', tint: 'Tint', epsilonGlow: 'Epsilon glow', jpegGlitch: 'JPEG glitch', chromaticEffects: 'Chromatic effects', temporalVariation: 'Temporal variation' };
const reserved = new Set(['scaleDpi', 'colorDepth', 'luminanceThreshold', 'orderedCycling']);
const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const groupOf = (id: string) => { const base = id.replace(/-\d+$/, ''); return own(groups, base) ? groups[base] : ''; };
const hex = (color: { r: number; g: number; b: number }) => '#' + [color.r, color.g, color.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const rgb = (value: string) => ({ r: parseInt(value.slice(1, 3), 16), g: parseInt(value.slice(3, 5), 16), b: parseInt(value.slice(5, 7), 16) });

/** Revalidate a document after JSON/localStorage, without trusting its edited flag. */
export function restoreOriginalCompatibility(value: unknown): OriginalPresetDocument {
  if (!record(value) || typeof value.originalText !== 'string' || typeof value.edited !== 'boolean') throw new OriginalPresetError('Original preset compatibility data is incomplete.');
  const original = parseOriginalPreset(value.originalText);
  const current = parseOriginalPreset(JSON.stringify(value.envelope));
  if (!value.edited && !equal(original.envelope, current.envelope)) throw new OriginalPresetError('Untouched original preset data differs from its retained source.');
  return Object.freeze({ originalText: value.originalText, envelope: current.envelope, issues: current.issues, edited: value.edited });
}

function firstInstance(document: OriginalPresetDocument, group: string): string | undefined {
  const graph = document.envelope.preset;
  return graph.pipelineOrder.find(id => groupOf(id) === group && own(graph.effectInstances, id))
    ?? Object.keys(graph.effectInstances).find(id => groupOf(id) === group);
}

/** UI values are projections only; all processing/export uses the retained graph. */
export function projectFromOriginalPreset(input: OriginalPresetDocument): Project {
  const document = restoreOriginalCompatibility(input), raw = document.envelope.preset;
  const ditherId = firstInstance(document, 'dither'), adjustmentId = firstInstance(document, 'adjustments');
  const dither = ditherId ? raw.effectInstances[ditherId].settings : {};
  const adjustments = adjustmentId ? raw.effectInstances[adjustmentId].settings : {};
  const colors = Array.isArray(dither.palette) && dither.palette.every(value => typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value)) ? dither.palette as string[] : [...raw.colorPalette.customColors];
  const occurrence = new Map<string, number>();
  const effects: Stage[] = [];
  for (const id of raw.pipelineOrder) {
    const type = groupOf(id), instance = raw.effectInstances[id];
    if (!prefixes[type] || !instance) continue;
    const ordinal = occurrence.get(id) ?? 0; occurrence.set(id, ordinal + 1);
    const repeated = raw.pipelineOrder.filter(other => other === id).length > 1;
    const params = { ...structuredClone((defaults as Record<string, any>)[type]), ...structuredClone(instance.settings) };
    delete params.enabled; delete params.visible;
    effects.push({ id: repeated ? `${id}::occurrence-${ordinal}` : id, originalInstanceId: id, type, name: String(instance.customLabel ?? instance.label ?? names[type]), enabled: !!instance.settings.enabled, params });
  }
  return {
    version: 1, algorithmId: typeof dither.style === 'string' ? dither.style : raw.dither.style,
    mode: raw.halftone?.enabled ? 'halftone' : 'dither',
    ditherParams: {
      ...(record(dither.controls) ? structuredClone(dither.controls) : structuredClone(raw.dither.controls)),
      scaleDpi: dither.scale ?? raw.dither.scale, colorDepth: dither.colorDepth ?? raw.colorPalette.colorDepth,
      luminanceThreshold: dither.luminanceThreshold ?? raw.dither.luminanceThreshold,
      orderedCycling: dither.orderedCycling ?? raw.colorPalette.orderedCycling ?? false,
    },
    palette: { name: raw.colorPalette.paletteId, category: raw.colorPalette.category, color_count: colors.length, colors: colors.map(rgb) },
    adjustments: Object.fromEntries(Object.entries(defaults.adjustments).map(([key, value]) => [key, adjustments[key] ?? value])),
    halftone: { ...structuredClone(defaults.halftone), ...structuredClone(raw.halftone ?? {}) },
    effects, originalCompatibility: document,
  };
}

export interface OriginalProjectCapabilities {
  warnings: string[]; processingErrors: string[]; canProcess: boolean; canBuildPipeline: boolean;
  firstDitherId?: string; firstAdjustmentId?: string;
  duplicateBaseStages: boolean; repeatedIds: boolean; inactiveInstances: number;
}
export function originalProjectCapabilities(project: Project): OriginalProjectCapabilities {
  if (!project.originalCompatibility) return { warnings: [], processingErrors: [], canProcess: true, canBuildPipeline: true, duplicateBaseStages: false, repeatedIds: false, inactiveInstances: 0 };
  const document = restoreOriginalCompatibility(project.originalCompatibility), raw = document.envelope.preset;
  const firstDitherId = firstInstance(document, 'dither'), firstAdjustmentId = firstInstance(document, 'adjustments');
  const warnings: string[] = [], processingErrors: string[] = [];
  const duplicateBaseStages = ['dither', 'adjustments'].some(group => raw.pipelineOrder.filter(id => groupOf(id) === group).length > 1);
  const repeatedIds = new Set(raw.pipelineOrder).size !== raw.pipelineOrder.length;
  if (duplicateBaseStages) warnings.push('This preset has multiple base stages. Pattern and adjustment controls edit only the first matching instance; all original slots still process.');
  if (raw.pipelineOrder.some((id, index) => prefixes[groupOf(id)] && raw.pipelineOrder.slice(index + 1).some(next => ['adjustments', 'dither'].includes(groupOf(next))))) warnings.push('Base stages are interleaved with post effects. Reordering effects reuses their original slots; base stages retain their relative order.');
  if (repeatedIds) warnings.push('Repeated instance IDs share settings. Editing one occurrence updates every occurrence of that original instance.');
  const inactiveInstances = Object.keys(raw.effectInstances).filter(id => !raw.pipelineOrder.includes(id)).length;
  if (inactiveInstances) warnings.push(`${inactiveInstances} inactive original instance(s) are retained for export.`);
  if (firstDitherId && !raw.effectInstances[firstDitherId].settings.enabled) warnings.push('The projected original dither instance is disabled; changing its values does not enable it.');
  if (firstAdjustmentId && !raw.effectInstances[firstAdjustmentId].settings.enabled) warnings.push('The projected original adjustment instance is disabled.');
  if (!firstDitherId) warnings.push('No dither instance exists. Pattern or palette edits require an explicit new base stage.');
  for (const [key, instance] of Object.entries(raw.effectInstances)) {
    if (key !== instance.instanceId || groupOf(key) && groupOf(key) !== instance.type) warnings.push(`Instance "${key}" has differing original ID/type metadata; processing follows its map-key prefix.`);
  }
  if (firstDitherId) {
    const d = raw.effectInstances[firstDitherId].settings;
    if (d.style !== raw.dither.style || d.scale !== raw.dither.scale || d.palette && !equal(d.palette, raw.colorPalette.customColors)) warnings.push('Top-level selectors differ from instance settings. Processing uses the instance; only edited selector fields are synchronized.');
    if (record(d.controls) && Object.keys(d.controls).some(key => reserved.has(key))) warnings.push('Some algorithm controls collide with the simplified editor fields and require direct instance editing.');
  }
  let canBuildPipeline = true;
  try {
    const stages = buildOriginalPresetPipeline(document);
    if (stages.some(stage => stage.id === 'dither' && stage.enabled && stage.params.style !== 'none')) processingErrors.push('The original dithering engine has not yet been ported to this runtime.');
  } catch (error) { canBuildPipeline = false; processingErrors.push((error as Error).message); }
  return { warnings, processingErrors, canBuildPipeline, canProcess: !processingErrors.length, firstDitherId, firstAdjustmentId, duplicateBaseStages, repeatedIds, inactiveInstances };
}

/** Selected raw-instance edit, including non-projected base stages. */
export function editOriginalProjectInstance(project: Project, instanceId: string, path: readonly string[], value: unknown): Project {
  if (!project.originalCompatibility || !own(project.originalCompatibility.envelope.preset.effectInstances, instanceId)) throw new OriginalPresetError(`Original instance "${instanceId}" does not exist.`);
  return projectFromOriginalPreset(patchOriginalPresetLeaf(restoreOriginalCompatibility(project.originalCompatibility), ['preset', 'effectInstances', instanceId, 'settings', ...path], value));
}

/** Reconcile an ordinary immutable UI edit into the original document.
 * Base entries retain their relative order. Post-stage permutations reuse their
 * original slots; additions extend after the last post slot (or append when none).
 */
export function commitOriginalProjectEdit(before: Project, after: Project): Project {
  if (!before.originalCompatibility) return after;
  if (!after.originalCompatibility) throw new OriginalPresetError('Replace or detach the original preset explicitly before discarding its retained graph.');
  const original = restoreOriginalCompatibility(before.originalCompatibility);
  if (!equal(before.originalCompatibility.envelope, after.originalCompatibility.envelope)) return projectFromOriginalPreset(restoreOriginalCompatibility(after.originalCompatibility));
  let document = original;
  const patch = (path: readonly (string | number)[], value: unknown) => { document = patchOriginalPresetLeaf(document, path, value); };
  const patchChanged = (path: readonly (string | number)[], old: any, next: any) => {
    if (equal(old, next)) return;
    if (record(old) && record(next)) {
      let raw: any = document.envelope; for (const key of path) raw = raw?.[key];
      if (!record(raw)) { patch(path, next); return; }
      for (const key of Object.keys(next)) if (!equal(old[key], next[key])) patchChanged([...path, key], old[key], next[key]);
    } else patch(path, next);
  };
  const requireBase = (group: string) => {
    const id = firstInstance(document, group);
    if (!id) throw new OriginalPresetError(`This original preset has no ${group} instance. Add that base stage explicitly instead of inserting it silently.`);
    return ['preset', 'effectInstances', id, 'settings'] as const;
  };
  if (before.algorithmId !== after.algorithmId) {
    const base = requireBase('dither'); patch([...base, 'style'], after.algorithmId); patch(['preset', 'dither', 'style'], after.algorithmId);
    const category = algorithmData.find(a => a.metadata.id === after.algorithmId)?.metadata.category;
    if (category) { patch([...base, 'category'], category); patch(['preset', 'dither', 'category'], category); }
  }
  const parameterMapping: Record<string, [string, 'dither' | 'colorPalette']> = { scaleDpi: ['scale', 'dither'], luminanceThreshold: ['luminanceThreshold', 'dither'], colorDepth: ['colorDepth', 'colorPalette'], orderedCycling: ['orderedCycling', 'colorPalette'] };
  for (const [key, value] of Object.entries(after.ditherParams)) {
    if (equal(before.ditherParams[key], value)) continue;
    const base = requireBase('dither'), mapped = parameterMapping[key];
    if (mapped) { patch([...base, mapped[0]], value); patch(['preset', mapped[1], mapped[0]], value); }
    else {
      if (!record(document.envelope.preset.effectInstances[base[2]].settings.controls)) patch([...base, 'controls'], {});
      patch([...base, 'controls', key], value);
      patch(['preset', 'dither', 'controls', key], value);
    }
  }
  if (!equal(before.palette, after.palette)) {
    const base = requireBase('dither');
    if (!equal(before.palette.colors, after.palette.colors)) {
      const old = document.envelope.preset.effectInstances[base[2]].settings.palette;
      const retainColor = (list: unknown, index: number, color: Project['palette']['colors'][number]) => equal(before.palette.colors[index], color) && Array.isArray(list) && typeof list[index] === 'string' ? list[index] : hex(color);
      patch([...base, 'palette'], after.palette.colors.map((color, index) => retainColor(old, index, color)));
      patch(['preset', 'colorPalette', 'customColors'], after.palette.colors.map((color, index) => retainColor(document.envelope.preset.colorPalette.customColors, index, color)));
    }
    if (before.palette.category !== after.palette.category) patch(['preset', 'colorPalette', 'category'], after.palette.category);
    if (before.palette.name !== after.palette.name) patch(['preset', 'colorPalette', 'paletteId'], `${after.palette.category.toLowerCase().replace(/\s+/g, '-')}-${after.palette.name.toLowerCase().replace(/\s+/g, '-')}`);
  }
  if (!equal(before.adjustments, after.adjustments)) patchChanged(requireBase('adjustments'), before.adjustments, after.adjustments);
  if (!equal(before.halftone, after.halftone) || before.mode !== after.mode) {
    if (!record(document.envelope.preset.halftone)) patch(['preset', 'halftone'], { ...structuredClone(after.halftone), enabled: after.mode === 'halftone', supersample: 4 });
    else patchChanged(['preset', 'halftone'], before.halftone, after.halftone);
    if (before.mode !== after.mode) patch(['preset', 'halftone', 'enabled'], after.mode === 'halftone');
  }
  const beforeRows = new Map(before.effects.map(stage => [stage.id, stage]));
  const aliases = new Map<string, string>(), updatedLeaves = new Map<string, unknown>();
  const graph = getOriginalPresetGraph(document);
  const allocateId = (type: string) => { let n = 1; while (own(document.envelope.preset.effectInstances, `${prefixes[type]}-${n}`)) n++; return `${prefixes[type]}-${n}`; };
  const update = (id: string, path: readonly string[], value: unknown) => {
    const key = JSON.stringify([id, ...path]);
    if (updatedLeaves.has(key) && !equal(updatedLeaves.get(key), value)) throw new OriginalPresetError('Repeated occurrences of one original instance cannot receive conflicting edits.');
    updatedLeaves.set(key, value); patch(['preset', 'effectInstances', id, ...path], value);
  };
  for (const stage of after.effects) {
    if (aliases.has(stage.id)) throw new OriginalPresetError('Editor stage IDs must be unique.');
    const old = beforeRows.get(stage.id);
    if (!old) {
      if (!prefixes[stage.type]) throw new OriginalPresetError(`Cannot add unknown original effect type "${stage.type}".`);
      const id = allocateId(stage.type), template = stage.originalInstanceId ? graph.effectInstances[stage.originalInstanceId] : undefined;
      const params = { ...structuredClone(stage.params), enabled: stage.enabled, visible: true };
      patch(['preset', 'effectInstances', id], { ...(template ? structuredClone(template) : {}), type: stage.type, instanceId: id, label: stage.name, settings: params, isDuplicatable: template?.isDuplicatable ?? true, isOriginal: false });
      aliases.set(stage.id, id); continue;
    }
    if (stage.type !== old.type) throw new OriginalPresetError('Changing an original instance processor type requires an explicit replacement.');
    const id = old.originalInstanceId ?? old.id; aliases.set(stage.id, id);
    if (stage.enabled !== old.enabled) update(id, ['settings', 'enabled'], stage.enabled);
    if (stage.name !== old.name) update(id, ['customLabel'], stage.name);
    if (!equal(stage.params, old.params)) {
      // Leaf patches retain unknown nested siblings; repeated shared instances
      // are refreshed together when the returned project is projected again.
      const observe = (path: string[], previous: any, next: any) => {
        if (equal(previous, next)) return;
        if (record(previous) && record(next)) { for (const key of Object.keys(next)) observe([...path, key], previous[key], next[key]); return; }
        const key = JSON.stringify([id, 'settings', ...path]);
        if (updatedLeaves.has(key) && !equal(updatedLeaves.get(key), next)) throw new OriginalPresetError('Repeated occurrences of one original instance cannot receive conflicting edits.');
        updatedLeaves.set(key, next);
      };
      observe([], old.params, stage.params);
      patchChanged(['preset', 'effectInstances', id, 'settings'], old.params, stage.params);
    }
  }
  if (!equal(before.effects.map(stage => stage.id), after.effects.map(stage => stage.id))) {
    const desired = after.effects.map(stage => aliases.get(stage.id)!);
    const knownPost = (id: string) => !!prefixes[groupOf(id)] && own(graph.effectInstances, id);
    const order: string[] = []; let index = 0, lastPostEnd = -1;
    for (const id of graph.pipelineOrder) {
      if (knownPost(id)) { if (index < desired.length) order.push(desired[index++]); lastPostEnd = order.length; }
      else order.push(id);
    }
    if (index < desired.length) order.splice(lastPostEnd < 0 ? order.length : lastPostEnd, 0, ...desired.slice(index));
    patch(['preset', 'pipelineOrder'], order);
    for (const id of new Set(before.effects.map(stage => stage.originalInstanceId ?? stage.id))) if (!order.includes(id)) {
      patch(['preset', 'effectInstances', id, 'settings', 'enabled'], false);
      patch(['preset', 'effectInstances', id, 'settings', 'visible'], false);
    }
  }
  return { ...after, ...projectFromOriginalPreset(document) };
}

/** Construct a new original-format preset from a native flat project. */
export function createOriginalProjectPreset(project: Project, name: string, description?: string): OriginalPresetDocument {
  const { scaleDpi = 45, colorDepth = 8, luminanceThreshold = 50, orderedCycling = false, ...controls } = project.ditherParams;
  const colors = project.palette.colors.map(hex), category = algorithmData.find(a => a.metadata.id === project.algorithmId)?.metadata.category ?? 'all';
  const effectInstances: Record<string, OriginalPresetInstance> = {};
  const make = (id: string, type: string, label: string, settings: Record<string, unknown>, isOriginal: boolean) => ({ type, instanceId: id, label, settings, isDuplicatable: type !== 'adjustments' && type !== 'dither', isOriginal });
  effectInstances.adjustments = make('adjustments', 'adjustments', 'Adjustments', { ...structuredClone(project.adjustments), enabled: true }, true);
  effectInstances['dither-style'] = make('dither-style', 'dither', 'Dither', { enabled: true, category, style: project.algorithmId, scale: scaleDpi, luminanceThreshold, colorDepth, palette: colors, orderedCycling, controls }, true);
  for (const [type, prefix] of Object.entries(prefixes)) effectInstances[`${prefix}-1`] = make(`${prefix}-1`, type, names[type], { ...structuredClone((defaults as Record<string, any>)[type]), enabled: false, visible: false }, true);
  const pipelineOrder = ['adjustments', 'dither-style'], counts: Record<string, number> = {};
  for (const stage of project.effects) {
    if (!prefixes[stage.type]) throw new OriginalPresetError(`Cannot export unknown original processor "${stage.type}".`);
    const n = (counts[stage.type] ?? 0) + 1; counts[stage.type] = n;
    const id = `${prefixes[stage.type]}-${n}`;
    effectInstances[id] = make(id, stage.type, stage.name, { ...structuredClone(stage.params), enabled: stage.enabled, visible: true }, n === 1);
    pipelineOrder.push(id);
  }
  const preset = createPreset(name, description, {
    colorPalette: { category: project.palette.category, paletteId: `${project.palette.category.toLowerCase().replace(/\s+/g, '-')}-${project.palette.name.toLowerCase().replace(/\s+/g, '-')}`, customColors: colors, colorDepth, orderedCycling },
    dither: { category, style: project.algorithmId, scale: scaleDpi, luminanceThreshold, controls },
    halftone: { ...structuredClone(project.halftone), enabled: project.mode === 'halftone', supersample: 4 }, effectInstances, pipelineOrder,
  });
  return parseOriginalPreset(JSON.stringify(exportPresetObject(preset), null, 2));
}

export function exportOriginalProject(project: Project, name?: string, description?: string): string {
  if (!project.originalCompatibility) return serializeOriginalPreset(createOriginalProjectPreset(project, name ?? 'Untitled', description));
  let document = restoreOriginalCompatibility(project.originalCompatibility);
  if (name !== undefined && name !== document.envelope.preset.name) document = patchOriginalPresetLeaf(document, ['preset', 'name'], name);
  if (description !== undefined && description !== document.envelope.preset.description) document = patchOriginalPresetLeaf(document, ['preset', 'description'], description);
  return serializeOriginalPreset(document, document.edited ? { updatedAt: Date.now(), exportedAt: Date.now(), exportedBy: 'BitCrush' } : undefined);
}
