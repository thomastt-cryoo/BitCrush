import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon, Mark } from './Icons';
import { algorithms, allPalettes, categories, grayscale, hex, initialProject, label, validateProject } from './model';
import { defaults, effectNames, makeEffect, processImage } from './engine';
import { chooseImage, isTauri, saveBlob, setWindowAppearance } from './native';
import { desktopSmoke } from './smoke';
import originalControls from './data/original-control-schema.json';
import type { Control, Preset, Project, Value } from './types';

function Button({ children, icon, onClick, title, disabled, className = '' }: { children?: ReactNode; icon?: string; onClick?: () => void; title?: string; disabled?: boolean; className?: string }) {
  return <button className={`button ${className}`} onClick={onClick} title={title} aria-label={title} disabled={disabled}>{icon && <Icon name={icon} />}{children}</button>;
}
function Slider({ name, value, min = 0, max = 100, step = 1, unit = '', onChange }: { name: string; value: number; min?: number; max?: number; step?: number; unit?: string; onChange: (n: number) => void }) {
  return <label className="slider-field"><span>{name}<span className="number-field"><input aria-label={`${name} value`} type="number" min={min} max={max} step={step} value={value} onChange={e => { if (e.currentTarget.value !== '') onChange(Math.max(min, Math.min(max, Number(e.currentTarget.value)))); }} />{unit}</span></span><input aria-label={name} type="range" min={min} max={max} step={step} value={value} style={{ '--fill': `${Math.max(0, Math.min(100, (value - min) / (max - min) * 100))}%` } as React.CSSProperties} onChange={e => onChange(Number(e.currentTarget.value))} /></label>;
}
function Toggle({ name, checked, onChange }: { name: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="toggle-field"><span>{name}</span><input type="checkbox" role="switch" aria-label={name} checked={checked} onChange={e => onChange(e.currentTarget.checked)} /><span className="switch" /></label>;
}
function Parameter({ control, value, onChange }: { control: Control; value: Value; onChange: (v: Value) => void }) {
  if (control.type === 'toggle') return <Toggle name={control.label} checked={!!value} onChange={onChange} />;
  if (control.type === 'dropdown' || control.type === 'select') return <label className="select-field">{control.label}<select value={String(value)} onChange={e => onChange(e.currentTarget.value)}>{control.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
  return <Slider name={control.label} value={Number(value)} min={control.min} max={control.max} step={control.step} unit={control.unit} onChange={onChange} />;
}
function Dialog({ title, subtitle, children, close }: { title: string; subtitle?: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = ref.current!; node.showModal(); return () => node.close(); }, []);
  return <dialog className="dialog" ref={ref} onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}><div className="dialog-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><Button icon="close" title="Close dialog" onClick={close} className="icon-button" /></div>{children}</dialog>;
}

function makeSample() {
  const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 768;
  const ctx = canvas.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, 768); sky.addColorStop(0, '#5f5f5f'); sky.addColorStop(.6, '#e8e8e8'); sky.addColorStop(1, '#292929');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 768);
  ctx.fillStyle = '#f3f3f3'; ctx.beginPath(); ctx.arc(660, 238, 91, 0, Math.PI * 2); ctx.fill();
  for (let hill = 0; hill < 6; hill++) {
    const value = 126 - hill * 20; ctx.fillStyle = `rgb(${value},${value},${value})`;
    ctx.beginPath(); ctx.moveTo(0, 768);
    for (let x = 0; x <= 960; x += 2) ctx.lineTo(x, 420 + hill * 52 + Math.sin(x / (110 + hill * 14) + hill * 1.8) * (82 - hill * 6) + Math.sin(x / 43 + hill * 2) * 12);
    ctx.lineTo(960, 768); ctx.closePath(); ctx.fill();
  }
  return ctx.getImageData(0, 0, 960, 768);
}

export default function App() {
  const [project, setProject] = useState<Project>(initialProject);
  const [appearance, setAppearance] = useState(() => localStorage.getItem('bitcrush-appearance') === 'light' ? 'light' : 'dark');
  const [tab, setTab] = useState('Styles');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('error-diffusion');
  const [filename, setFilename] = useState('Untitled');
  const [source, setSource] = useState<ImageData | null>(null);
  const [output, setOutput] = useState<ImageData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [compare, setCompare] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [dialog, setDialog] = useState('');
  const [format, setFormat] = useState('png');
  const [quality, setQuality] = useState(95);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['pattern', 'palette']));
  const [presets, setPresets] = useState<Preset[]>(() => { try { return JSON.parse(localStorage.getItem('bitcrush-presets') ?? '[]'); } catch { return []; } });
  const [history, setHistory] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const [dragging, setDragging] = useState(false);
  const [presetName, setPresetName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outputRef = useRef<ImageData | null>(null);
  const revision = useRef(0);
  const algorithm = algorithms.find(a => a.metadata.id === project.algorithmId)!;

  const change = useCallback((update: (p: Project) => Project) => {
    setHistory(h => [...h.slice(-49), structuredClone(project)]);
    setProject(update(structuredClone(project)));
    setFuture([]);
  }, [project]);
  const undo = useCallback(() => { if (!history.length) return; setFuture(f => [structuredClone(project), ...f]); setProject(history.at(-1)!); setHistory(h => h.slice(0, -1)); }, [history, project]);
  const redo = useCallback(() => { if (!future.length) return; setHistory(h => [...h, structuredClone(project)]); setProject(future[0]); setFuture(f => f.slice(1)); }, [future, project]);

  useEffect(() => { document.documentElement.dataset.appearance = appearance; localStorage.setItem('bitcrush-appearance', appearance); void setWindowAppearance(appearance as 'dark' | 'light').catch(() => setNotice('The window appearance could not be updated.')); }, [appearance]);
  useEffect(() => { try { localStorage.setItem('bitcrush-presets', JSON.stringify(presets)); } catch { setNotice('Preset storage is full. Save your project to a file before closing.'); } }, [presets]);
  useEffect(() => { void desktopSmoke(); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!source) return;
    const token = ++revision.current;
    setBusy(true); setError(''); setOutput(null); outputRef.current = null;
    const timer = setTimeout(() => {
      processImage(source, project).then(result => { if (token === revision.current) { setOutput(result); outputRef.current = result; } }).catch(e => { if (token === revision.current) setError(e.message); }).finally(() => { if (token === revision.current) setBusy(false); });
    }, 130);
    return () => { clearTimeout(timer); ++revision.current; };
  }, [source, project]);
  useEffect(() => {
    const pixels = compare ? source : output ?? source;
    const canvas = canvasRef.current;
    if (canvas && pixels) { canvas.width = pixels.width; canvas.height = pixels.height; canvas.getContext('2d')!.putImageData(pixels, 0, 0); }
  }, [source, output, compare]);

  async function loadBlob(blob: Blob, name: string) {
    if (blob.size > 120 * 1024 * 1024) throw new Error('Choose an image smaller than 120 MB.');
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (image.width * image.height > 40_000_000) throw new Error('Choose an image below 40 megapixels.');
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(image, 0, 0);
      setSource(ctx.getImageData(0, 0, image.width, image.height)); setFilename(name); setZoom(1);
    } finally { URL.revokeObjectURL(url); }
  }
  async function importImage() {
    if (!isTauri()) { inputRef.current?.click(); return; }
    try { const file = await chooseImage(); if (file) await loadBlob(file.blob, file.name); } catch (e) { setNotice(String(e)); }
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      if (e.key === 'o') { e.preventDefault(); void importImage(); }
      if (e.key === 'e') { e.preventDefault(); if (source) setDialog('export'); }
      if (e.key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });

  function selectAlgorithm(id: string) {
    const spec = algorithms.find(a => a.metadata.id === id)!;
    change(p => ({ ...p, algorithmId: id, mode: 'dither', ditherParams: { scaleDpi: p.ditherParams.scaleDpi, luminanceThreshold: p.ditherParams.luminanceThreshold, colorDepth: p.ditherParams.colorDepth, ...Object.fromEntries(spec.controls.map(c => [c.id, c.defaultValue])) } }));
  }
  function section(id: string) { setOpenSections(s => { const result = new Set(s); if (result.has(id)) result.delete(id); else result.add(id); return result; }); }
  function patch(sectionName: 'adjustments' | 'halftone' | 'ditherParams', key: string, value: Value) { change(p => ({ ...p, [sectionName]: { ...p[sectionName], [key]: value } })); }
  async function exportImage() {
    try {
      const image = outputRef.current;
      if (!image || error) throw new Error('A successful preview is needed before exporting this image.');
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; canvas.getContext('2d')!.putImageData(image, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('This image format is unavailable.')), `image/${format === 'jpg' ? 'jpeg' : format}`, quality / 100));
      const expectedType = `image/${format === 'jpg' ? 'jpeg' : format}`;
      if (blob.type !== expectedType) throw new Error('This image format is unavailable in this system WebView. Choose PNG instead.');
      if (await saveBlob(blob, `${filename.replace(/\.[^.]+$/, '')}-bitcrush.${format}`)) { setDialog(''); setNotice('Image exported'); }
    } catch (e) { setNotice(String(e)); }
  }
  function genericParameters(values: Record<string, any>, changeValue: (key: string, value: any) => void, scope: string): ReactNode {
    return Object.entries(values).filter(([key]) => key !== 'enabled').map(([key, value]) => {
      const path = `${scope}.${key}`;
      if (value && typeof value === 'object') return <fieldset className="nested-parameters" key={key}><legend>{label(key)}</legend>{genericParameters(value, (child, next) => changeValue(key, { ...value, [child]: next, ...(scope === 'jpegGlitch' && child === 'amount' && next > 0 ? { enabled: true } : {}) }), path)}</fieldset>;
      const numeric = (originalControls.numeric as Record<string, { label: string; min: number; max?: number; step: number; storageScale: number }>)[path];
      if (numeric) return <Slider key={key} name={numeric.label} value={Number(value) / numeric.storageScale} min={numeric.min} max={numeric.max} step={numeric.step} onChange={v => changeValue(key, v * numeric.storageScale)} />;
      const boolean = (originalControls.boolean as Record<string, { label: string }>)[path];
      if (boolean) return <Toggle key={key} name={boolean.label} checked={!!value} onChange={v => changeValue(key, v)} />;
      const dropdown = (originalControls.dropdown as Record<string, { label: string; options: Array<{ label: string; value: string }> }>)[path];
      if (dropdown) return <label className="select-field" key={key}>{dropdown.label}<select value={value} onChange={e => changeValue(key, e.currentTarget.value)}>{dropdown.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
      const color = (originalControls.color as Record<string, { label: string }>)[path];
      if (color) return <label className="color-field" key={key}>{color.label}<input type="color" value={value} onChange={e => changeValue(key, e.currentTarget.value)} /><code>{value.toUpperCase()}</code></label>;
      // Unexposed original fields remain in the project payload without invented controls.
      return null;
    });
  }

  const filtered = algorithms.filter(a => a.metadata.name.toLowerCase().includes(query.toLowerCase()));
  const pictureLabel = compare || error ? 'Original image' : project.mode === 'halftone' ? 'Halftone' : algorithm.metadata.name;
  return <div className={`app ${dragging ? 'is-dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files[0]; if (file) void loadBlob(file, file.name).catch(e => setNotice(e.message)); }}>
    <input ref={inputRef} type="file" accept="image/*" hidden aria-label="Choose image" onChange={e => { const file = e.currentTarget.files?.[0]; if (file) void loadBlob(file, file.name).catch(e => setNotice(e.message)); e.currentTarget.value = ''; }} />
    <input ref={projectInputRef} type="file" accept=".json" hidden aria-label="Choose project" onChange={async e => { const file = e.currentTarget.files?.[0]; if (file) { try { const data = JSON.parse(await file.text()); change(() => validateProject(data.project ?? data)); setNotice('Project loaded'); } catch (e) { setNotice(String(e)); } } e.currentTarget.value = ''; }} />
    <header className="topbar"><div className="brand"><Mark /><strong>BitCrush<span>STUDIO</span></strong></div><span className="top-divider" /><div className="document-name"><span>{filename}</span><span className="document-caption">{source ? 'Image workspace' : 'New workspace'}</span></div><div className="topbar-actions"><Button icon={appearance === 'dark' ? 'sun' : 'moon'} title={appearance === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'} onClick={() => setAppearance(a => a === 'dark' ? 'light' : 'dark')} className="icon-button appearance-button" /><div className="history-actions"><Button icon="undo" title="Undo" disabled={!history.length} onClick={undo} className="icon-button" /><Button icon="redo" title="Redo" disabled={!future.length} onClick={redo} className="icon-button" /></div><Button icon="plus" onClick={() => void importImage()}>Import</Button><Button icon="arrow" onClick={() => setDialog('export')} disabled={!source} className="primary">Export</Button></div></header>

    <aside className="library"><div className="panel-title"><h2>Library</h2><span className="counter">{tab === 'Styles' ? '73' : tab === 'Palettes' ? allPalettes.length : presets.length}</span></div><div className="library-tabs" role="tablist" aria-label="Library">{['Styles', 'Palettes', 'Presets'].map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'selected' : ''} onClick={() => { setTab(t); setQuery(''); }}>{t}</button>)}</div><label className="search"><Icon name="search" size={16} /><input aria-label={`Search ${tab.toLowerCase()}`} placeholder={`Search ${tab.toLowerCase()}…`} value={query} onChange={e => setQuery(e.currentTarget.value)} /><kbd>⌕</kbd></label>
      <div className="library-scroll">{tab === 'Styles' && categories.map(([id, name]) => {
        const list = filtered.filter(a => a.metadata.category === id);
        if (!list.length) return null;
        return <section className="category" key={id}><button className="category-heading" aria-expanded={category === id || !!query} onClick={() => setCategory(c => c === id ? '' : id)}><span>{name}</span><span>{list.length}<Icon name="down" size={12} /></span></button>{(category === id || query) && <div className="style-list">{list.map((a, i) => <button key={a.metadata.id} title={a.metadata.description} className={`style-item ${project.mode === 'dither' && project.algorithmId === a.metadata.id ? 'active' : ''}`} onClick={() => selectAlgorithm(a.metadata.id)}><span className={`pattern pattern-${i % 4}`} /><span>{a.metadata.name}</span>{project.mode === 'dither' && project.algorithmId === a.metadata.id && <Icon name="check" size={15} />}</button>)}</div>}</section>;
      })}
      {tab === 'Palettes' && <div className="palette-list">{allPalettes.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase())).map(p => <button className={`palette-item ${project.palette.name === p.name ? 'active' : ''}`} key={`${p.category}-${p.name}`} onClick={() => change(current => ({ ...current, palette: structuredClone(p) }))}><span className="palette-preview">{p.colors.map((c, i) => <i key={i} style={{ background: hex(c) }} />)}</span><span>{p.name}<small>{p.category} · {p.colors.length} colors</small></span>{project.palette.name === p.name && <Icon name="check" size={14} />}</button>)}</div>}
      {tab === 'Presets' && <><div className="library-note"><Icon name="layers" size={26} /><h3>Your starting points.</h3><p>Save a look to use it again, with every setting in place.</p><Button icon="plus" onClick={() => { setPresetName(''); setDialog('preset'); }}>Save current look</Button></div>{presets.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).map((p, i) => <div className="preset-row" key={`${p.name}-${i}`}><button onClick={() => { try { change(() => validateProject(p.project)); } catch (e) { setNotice(String(e)); } }}><Icon name="layers" /><span>{p.name}</span></button><Button icon="close" title={`Delete ${p.name}`} className="icon-button" onClick={() => setPresets(ps => ps.filter((_, index) => index !== i))} /></div>)}<Button icon="folder" onClick={() => projectInputRef.current?.click()} className="full-width">Open project</Button></>}
      </div><div className="library-bottom"><Button icon="sliders" onClick={() => setDialog('settings')} className="settings-button">Settings<Icon name="chevron" size={14} /></Button><span className="local-label"><i />All yours. All offline.</span></div>
    </aside>

    <main className="workspace"><div className="canvas-toolbar"><div className="workspace-label"><span className="status-dot" />{project.mode === 'halftone' ? 'Halftone workspace' : 'Image workspace'}</div><button className={`compare-button ${compare ? 'active' : ''}`} onClick={() => setCompare(c => !c)} disabled={!source} aria-pressed={compare}><Icon name="compare" size={17} />{compare ? 'Showing original' : 'Compare original'}</button></div>
      <div className="canvas-area">{source ? <div className="canvas-mat" style={{ transform: `scale(${zoom})` }}><canvas ref={canvasRef} aria-label="Image preview" /><span className="image-caption">{pictureLabel}</span></div> : <div className="empty-state"><div className="empty-symbol"><Mark /></div><span className="eyebrow">A LITTLE TEXTURE GOES A LONG WAY</span><h1>Start with an image.<br /><span>Make it your own.</span></h1><p>Drop an image here, or pick one to begin.</p><Button icon="plus" className="primary" onClick={() => void importImage()}>Import an image</Button><button className="sample-link" onClick={() => { setSource(makeSample()); setFilename('Contour study.png'); change(p => ({ ...p, mode: 'halftone' })); }}>Try a sample<Icon name="arrow" size={13} /></button><span className="supported-formats">PNG, JPG, WEBP, BMP · PROCESSED ON YOUR DEVICE</span></div>}{busy && source && <div className="processing-pill"><span className="spinner" />Updating preview</div>}{error && <div className="processing-error" role="status"><span>Preview unavailable</span><p>{error}</p><button onClick={() => selectAlgorithm('none')}>Show original</button></div>}</div>
      <div className="canvas-footer"><span>{source ? `${source.width.toLocaleString()} × ${source.height.toLocaleString()}` : 'Ready when you are'}<small>{source ? 'PX' : ''}</small></span><div className="zoom-controls"><Button icon="minus" title="Zoom out" onClick={() => setZoom(z => Math.max(.25, z - .25))} disabled={!source} className="icon-button" /><button className="zoom-value" onClick={() => setZoom(1)} disabled={!source}>{zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`}</button><Button icon="plus" title="Zoom in" onClick={() => setZoom(z => Math.min(4, z + .25))} disabled={!source} className="icon-button" /></div><Button icon="fit" title="Fit image" onClick={() => setZoom(1)} disabled={!source} className="icon-button" /></div>
    </main>

    <aside className="inspector"><div className="panel-title"><h2>Inspector</h2><Button icon="reset" title="Reset all settings" className="icon-button" onClick={() => change(initialProject)} /></div><div className="mode-tabs" role="tablist" aria-label="Processing mode">{(['dither', 'halftone'] as const).map(mode => <button key={mode} role="tab" aria-selected={project.mode === mode} className={project.mode === mode ? 'selected' : ''} onClick={() => change(p => ({ ...p, mode }))}>{mode === 'dither' ? 'Dither' : 'Halftone'}</button>)}</div>
      <div className="inspector-scroll"><div className="selected-style"><span className="eyebrow">{project.mode === 'dither' ? 'SELECTED STYLE' : 'PRINT TEXTURE'}</span><h1>{project.mode === 'dither' ? algorithm.metadata.name : 'Halftone'}</h1><p>{project.mode === 'dither' ? algorithm.metadata.description : 'Classic print texture, down to the last dot.'}</p></div>
      <section className="inspector-section"><button className="section-heading" onClick={() => section('pattern')} aria-expanded={openSections.has('pattern')}><span>Pattern</span><Icon name="down" size={14} /></button>{openSections.has('pattern') && <div className="section-content">{project.mode === 'dither' ? <>{algorithm.features.supportsDpiScale && <Slider name="Scale (DPI)" min={1} max={50} value={project.ditherParams.scaleDpi} onChange={v => patch('ditherParams', 'scaleDpi', v)} />}{algorithm.features.supportsLuminanceThreshold && <Slider name="Luminance threshold" value={project.ditherParams.luminanceThreshold} onChange={v => patch('ditherParams', 'luminanceThreshold', v)} />}{algorithm.controls.map(c => <Parameter key={c.id} control={c} value={project.ditherParams[c.id] ?? c.defaultValue} onChange={v => patch('ditherParams', c.id, v)} />)}{!algorithm.controls.length && !algorithm.features.supportsLuminanceThreshold && <p className="muted-note">{project.algorithmId === 'none' ? 'Your image, exactly as it is. Choose a style from the library to explore.' : 'This style has no extra pattern controls.'}</p>}</> : <><label className="select-field">Color mode<select value={project.halftone.mode} onChange={e => patch('halftone', 'mode', e.currentTarget.value)}><option value="grayscale">Grayscale</option><option value="cmyk">CMYK</option></select></label><Slider name="Cell size" min={4} max={50} value={project.halftone.cellSize} onChange={v => patch('halftone', 'cellSize', v)} /><Slider name="Dot gain" value={Math.round(project.halftone.dotGain * 100)} unit="%" onChange={v => patch('halftone', 'dotGain', v / 100)} />{(project.halftone.mode === 'grayscale' ? ['grayAngle'] : ['cyanAngle', 'magentaAngle', 'yellowAngle', 'blackAngle']).map(key => <Slider key={key} name={label(key)} max={360} unit="°" value={project.halftone[key]} onChange={v => patch('halftone', key, v)} />)}{project.halftone.mode === 'cmyk' && <><Slider name="Gray component replacement" value={project.halftone.gcr * 100} unit="%" onChange={v => patch('halftone', 'gcr', v / 100)} /><Toggle name="Phase offsets" checked={project.halftone.usePhaseOffsets} onChange={v => patch('halftone', 'usePhaseOffsets', v)} /></>}</>}</div>}</section>
      <section className="inspector-section"><button className="section-heading" onClick={() => section('palette')} aria-expanded={openSections.has('palette')}><span>Color palette</span><Icon name="down" size={14} /></button>{openSections.has('palette') && <div className="section-content"><label className="select-field"><select aria-label="Color palette" value={project.palette.name} onChange={e => { const p = allPalettes.find(p => p.name === e.currentTarget.value); if (p) change(current => ({ ...current, palette: structuredClone(p) })); }}>{!allPalettes.some(p => p.name === project.palette.name) && <option>{project.palette.name}</option>}{allPalettes.map(p => <option key={`${p.category}-${p.name}`}>{p.name}</option>)}</select></label><div className="swatches">{project.palette.colors.map((c, i) => <label key={i} title={hex(c)}><input type="color" aria-label={`Palette color ${i + 1}`} value={hex(c)} onChange={e => { const color = e.currentTarget.value; change(p => { p.palette.name = 'Custom'; p.palette.colors[i] = { ...p.palette.colors[i], r: parseInt(color.slice(1, 3), 16), g: parseInt(color.slice(3, 5), 16), b: parseInt(color.slice(5, 7), 16) }; return p; }); }} /></label>)}</div><div className="palette-meta"><span>{project.palette.colors.length} colors</span><button onClick={() => setTab('Palettes')}>Browse palettes<Icon name="arrow" size={12} /></button></div>{project.mode === 'halftone' && <p className="muted-note">Halftone uses its own grayscale or CMYK channels.</p>}</div>}</section>
      <section className="inspector-section"><button className="section-heading" onClick={() => section('adjustments')} aria-expanded={openSections.has('adjustments')}><span>Adjustments</span><Icon name={openSections.has('adjustments') ? 'minus' : 'plus'} size={15} /></button>{openSections.has('adjustments') && <div className="section-content">{Object.entries(project.adjustments).map(([key, value]) => { const range = (defaults.ranges.adjustments as Record<string, { min: number; max: number }>)[key]; return <Slider key={key} name={label(key)} value={value} min={range?.min} max={range?.max} onChange={v => patch('adjustments', key, v)} />; })}<button className="text-button" onClick={() => change(p => ({ ...p, adjustments: structuredClone(defaults.adjustments) }))}>Reset adjustments</button></div>}</section>
      <section className="inspector-section"><button className="section-heading" onClick={() => section('effects')} aria-expanded={openSections.has('effects')}><span>Effects{project.effects.length > 0 && <small>{project.effects.length}</small>}</span><Icon name={openSections.has('effects') ? 'minus' : 'plus'} size={15} /></button>{openSections.has('effects') && <div className="section-content effects-content">{project.effects.map((stage, index) => <div className="effect-card" key={stage.id}><div className="effect-title"><Toggle name={stage.name} checked={stage.enabled} onChange={enabled => change(p => { p.effects[index].enabled = enabled; return p; })} /><Button icon="close" title={`Remove ${stage.name}`} className="icon-button" onClick={() => change(p => ({ ...p, effects: p.effects.filter(s => s.id !== stage.id) }))} /></div><div className="effect-actions"><button disabled={index === 0} onClick={() => change(p => { [p.effects[index - 1], p.effects[index]] = [p.effects[index], p.effects[index - 1]]; return p; })}>Move up</button><button onClick={() => change(p => { p.effects.splice(index + 1, 0, { ...structuredClone(stage), id: crypto.randomUUID() }); return p; })}>Duplicate</button><button onClick={() => change(p => { const reset = structuredClone((originalControls.reset as Record<string, any>)[stage.type]); p.effects[index].enabled = reset.enabled; delete reset.enabled; p.effects[index].params = { ...p.effects[index].params, ...reset }; return p; })}>Reset</button></div>{stage.enabled && genericParameters(stage.params, (key, value) => change(p => { p.effects[index].params[key] = value; return p; }), stage.type)}</div>)}<Button icon="plus" onClick={() => setDialog('effect')} className="full-width dashed-button">Add effect</Button></div>}</section>
      </div><div className="inspector-bottom"><Icon name="layers" size={14} /><span>{project.effects.filter(e => e.enabled).length} effects in your stack</span><button onClick={() => { setPresetName(''); setDialog('preset'); }}>Save look</button></div>
    </aside>
    <footer className="statusbar"><span><i className={busy ? 'busy' : ''} />{busy ? 'Processing' : error ? 'Original shown' : 'Ready'}<b>/</b>{project.mode === 'halftone' ? 'Halftone' : algorithm.metadata.name}</span><span>BITCRUSH STUDIO<span className="version">0.1 PREVIEW</span></span><span><Icon name="image" size={13} />{source ? 'Still image' : 'Offline workspace'}</span></footer>

    {dialog === 'settings' && <Dialog title="Settings" subtitle="A workspace that feels like yours." close={() => setDialog('')}><div className="settings-group"><span>Appearance</span><div className="appearance-choice">{['dark', 'light'].map(a => <button key={a} className={appearance === a ? 'active' : ''} onClick={() => setAppearance(a)}><Icon name={a === 'dark' ? 'moon' : 'sun'} />{label(a)}{appearance === a && <Icon name="check" size={14} />}</button>)}</div></div><div className="settings-group"><span>Projects</span><div className="settings-projects"><Button icon="folder" onClick={() => { setDialog(''); projectInputRef.current?.click(); }}>Open project</Button><Button icon="download" onClick={() => void saveBlob(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), 'untitled.bitcrush.json')}>Save project</Button></div></div><div className="keyboard-shortcuts"><span>Import image<kbd>Ctrl / ⌘ O</kbd></span><span>Export image<kbd>Ctrl / ⌘ E</kbd></span><span>Undo<kbd>Ctrl / ⌘ Z</kbd></span><span>Redo<kbd>Ctrl / ⌘ Shift Z</kbd></span></div></Dialog>}
    {dialog === 'export' && <Dialog title="Export image" subtitle="The final touch. Then it’s yours." close={() => setDialog('')}><div className="export-summary"><Icon name="image" size={26} /><div><strong>{filename}</strong><span>{source?.width} × {source?.height} px</span></div></div><label className="select-field">File format<select value={format} onChange={e => setFormat(e.currentTarget.value)}><option value="png">PNG · lossless</option><option value="jpg">JPEG · smaller file</option><option value="webp">WebP</option></select></label>{format !== 'png' && <Slider name="Quality" value={quality} min={1} unit="%" onChange={setQuality} />}{error && <p className="dialog-error">This style has no successful preview yet. Choose Original or Halftone to export.</p>}<div className="dialog-actions"><Button onClick={() => setDialog('')}>Cancel</Button><Button icon="download" className="primary" disabled={!output || busy || !!error} onClick={() => void exportImage()}>Export image</Button></div></Dialog>}
    {dialog === 'effect' && <Dialog title="Add an effect" subtitle="Build your look, one layer at a time." close={() => setDialog('')}><div className="effect-picker">{Object.entries(effectNames).map(([type, name], index) => <button key={type} onClick={() => { change(p => ({ ...p, effects: [...p.effects, makeEffect(type)] })); setOpenSections(s => new Set([...s, 'effects'])); setDialog(''); }}><span className={`pattern pattern-${index % 4}`} /><span><strong>{name}</strong><small>{['Sharpen, blur, invert and hue', 'Blend a color into your image', 'Soft, luminous light diffusion', 'Digital blocks and channel distortion', 'Offset individual color channels', 'Movement through changing patterns'][index]}</small></span><Icon name="plus" size={18} /></button>)}</div></Dialog>}
    {dialog === 'preset' && <Dialog title="Save this look" subtitle="Every setting, ready for your next image." close={() => setDialog('')}><label className="select-field">Preset name<input autoFocus placeholder="Give your look a name" value={presetName} onChange={e => setPresetName(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter' && presetName.trim()) { setPresets(p => [...p, { name: presetName.trim(), project: structuredClone(project) }]); setDialog(''); setNotice('Look saved to your presets'); } }} /></label><div className="dialog-actions"><Button onClick={() => setDialog('')}>Cancel</Button><Button className="primary" disabled={!presetName.trim()} onClick={() => { setPresets(p => [...p, { name: presetName.trim(), project: structuredClone(project) }]); setDialog(''); setNotice('Look saved to your presets'); }}>Save look</Button></div></Dialog>}
    {notice && <div className="toast" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="close" size={15} /></button></div>}
    {dragging && <div className="drop-overlay"><Icon name="image" size={42} /><h2>Drop it here.</h2><p>Let’s make something.</p></div>}
  </div>;
}
