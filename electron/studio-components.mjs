// Studio views consume the original renderer's controlled values and callbacks.
// The original hooks and processing graph stay authoritative; no second editor model.
import {createStudioMediaViews} from './studio-media.mjs';
export function createStudioComponents(React) {
    const h = React.createElement, Context = React.createContext(null);
    const iconPaths = { plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', down: 'm6 9 6 6 6-6', arrow: 'M7 17 17 7M7 7h10v10', close: 'm5 5 14 14M5 19 19 5', undo: 'm8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7v3', redo: 'm16 4 5 5-5 5m5-5H11a7 7 0 0 0-7 7v3', reset: 'M3 4v6h6M3.5 10a8.5 8.5 0 1 1 .5 6', sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5', moon: 'M20 14a8 8 0 0 1-10-10A8.5 8.5 0 1 0 20 14Z', search: 'm16 16 4 4', check: 'm5 12 4 4L19 6', compare: 'M12 4v16', fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5', sliders: 'M4 7h4m4 0h8M4 17h8m4 0h4', layers: 'm12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5', lock: 'M7 10V7a5 5 0 0 1 10 0v3M6 10h12v11H6Z' };
    function Icon({ name, size = 16 }) { return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.65, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, name === 'sun' && h('circle', { cx: 12, cy: 12, r: 4 }), name === 'search' && h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }), name === 'compare' && h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }), h('path', { d: iconPaths[name] || iconPaths.sliders })); }
    function Button({ children, icon, title, onClick, disabled = false, primary = false, className = '', ...rest }) { return h('button', { ...rest, type: 'button', title, 'aria-label': title, onClick, disabled, className: `bc-button ${primary ? 'primary' : ''} ${className}` }, icon && h(Icon, { name: icon }), children); }
    const text = node => Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
    function walk(node, visit) { if (Array.isArray(node)) {
        node.forEach(n => walk(n, visit));
        return;
    } if (!node || typeof node !== 'object')
        return; if (visit(node) === false)
        return; walk(node.props?.children ?? node.children, visit); }
    function find(node, predicate) { let found; walk(node, n => { if (!found && predicate(n))
        found = n; }); return found; }
    function fields(node) { const found = []; function visit(n, label) { if (Array.isArray(n)) {
        n.forEach(v => visit(v, label));
        return;
    } if (!n?.props)
        return; const p = n.props; if (n.type === 'label')
        label = React.Children.toArray(p.children).filter(v => typeof v === 'string').join('').trim(); if (typeof n.type === 'function' && typeof p.onChange === 'function' && (('value' in p && ('min' in p || Array.isArray(p.options) || /^#[0-9a-f]{6}$/i.test(p.value))) || ('checked' in p && p.label))) {
        found.push({ ...p, label: p.label || label });
        return;
    } visit(p.children, label); } visit(node); return found; }
    const titleOf = node => text(find(node, n => n.type === 'h3')) || find(node, n => typeof n.type === 'function' && n.props?.title && n.props?.children)?.props.title;
    const action = (node, title) => find(node, n => n.props?.title === title)?.props;
    function overlays(node) { const result = []; walk(node, n => { if (n.$$typeof === Symbol.for('react.portal')) {
        result.push(n);
        return false;
    } if (typeof n.type === 'function' && typeof n.props?.onClose === 'function' && ('isOpen' in n.props || 'open' in n.props)) {
        result.push(n);
        return false;
    } }); return result; }
    function Section({ title, children, defaultOpen = true, extra, onShuffle }) { const [open, setOpen] = React.useState(defaultOpen); return h('section', { className: 'bc-section' }, h('div', { className: 'bc-section-title' }, h('button', { className: 'bc-section-heading', 'aria-expanded': open, onClick: () => setOpen(!open) }, h('span', null, title), h('span', null, extra, h(Icon, { name: 'down', size: 12 }))), onShuffle && h(Button, { icon: 'sliders', title: `Randomize ${title.toLowerCase()}`, className: 'icon bc-shuffle', onClick: onShuffle })), open && h('div', { className: 'bc-section-body' }, children)); }
    function Field({ field: p }) {
        const name = p.ariaLabel || p.label || p.title || 'Parameter';
        const disabled = !!(p.disabled || p.animationLocked);
        if ('checked' in p)
            return h('label', { className: 'bc-toggle', title: p.title }, h('span', null, p.label || name), h('input', { type: 'checkbox', role: 'switch', 'aria-label': name, checked: !!p.checked, disabled, onChange: e => p.onChange(e.target.checked) }), h('i', { className: 'bc-switch' }));
        if (/^#[0-9a-f]{6}$/i.test(p.value))
            return h('label', { className: 'bc-color-field' }, h('span', null, p.label || name), h('input', { type: 'color', 'aria-label': name, value: p.value, disabled, onChange: e => p.onChange(e.target.value) }), h('code', null, p.value));
        if (p.options) {
            const optionValue = v => typeof p.value === 'number' ? Number(v) : v;
            return h('label', { className: 'bc-select-field' }, p.label && h('span', null, p.label), h('select', { 'aria-label': name, value: p.value, disabled, onChange: e => p.onChange(optionValue(e.target.value)) }, ...p.options.filter(o => !String(o.value).startsWith('---divider')).map((o, i) => h('option', { key: i, value: o.value, disabled: o.disabled }, o.label))));
        }
        const min = Number(p.min ?? 0), max = Number(p.max ?? 100), step = Number(p.step ?? 1), value = Number(p.value ?? min), fill = Math.max(0, Math.min(100, (value - min) / (max - min) * 100));
        const change = raw => { if (raw === '')
            return; const next = Number(raw); if (Number.isFinite(next))
            p.onChange(Math.max(min, Math.min(max, next))); };
        return h('div', { className: 'bc-field', onMouseEnter: p.onMouseEnter, onMouseLeave: p.onMouseLeave, 'data-property-path': p.propertyPath }, h('label', { className: 'bc-field-top' }, h('span', null, p.label || name), h('span', { className: 'bc-field-value' }, h('input', { type: 'number', 'aria-label': `${name} value`, min, max, step, value, disabled, onChange: e => change(e.target.value) }), p.unit && h('small', null, p.unit), p.onToggleLock && h(Button, { icon: 'lock', title: `${p.locked ? 'Unlock' : 'Lock'} ${name}`, className: `icon ${p.locked ? 'locked' : ''}`, onClick: () => p.onToggleLock(p.lockId) }))), h('input', { type: 'range', 'aria-label': name, title: p.title, min, max, step, value, disabled, style: { '--fill': fill + '%' }, onChange: e => change(e.target.value) }), p.animationLocked && h('small', { className: 'bc-note' }, 'Controlled by an animation layer'));
    }
    function Palette({ p, legacy }) {
        const colors = p.paletteColors || [], palette = (p.allPalettes || []).find(v => v.id === p.selectedPaletteId);
        const originalColors = !p.isHalftoneMode && p.ditherStyle === 'none';
        const originalOption = '__original_colors__';
        const preferences = React.useContext(Context)?.libraryPreferences;
        const available = (p.allPalettes || []).filter(v => !preferences?.isHidden('palettes', v.id) && !preferences?.isHidden('paletteCategories', v.category));
        const categories = [...new Set(available.map(v => v.category))].sort((a, b) => (a === 'Monochrome' ? -1 : b === 'Monochrome' ? 1 : a === 'Source' ? -1 : b === 'Source' ? 1 : a.localeCompare(b)));
        const section = find(legacy, n => n.props?.className === 'control-section' && titleOf(n) === 'Color Palette');
        const paletteField = fields(section).find(v => v.options && v.value === p.selectedPaletteId);
        const rows = [];
        walk(section, n => { if (n.props?.className?.split(' ').includes('palette-color-item')) {
            rows.push(n);
            return false;
        } });
        const select = id => {
            if (id === originalOption) {
                // The original renderer's Original style passes source colors through.
                // Keep the stored palette, adjustments and other effect instances intact.
                window.__bitcrushControls.selectOriginalColors();
                return;
            }
            const selected = p.allPalettes.find(v => v.id === id);
            if (!selected && id !== p.selectedPaletteId) return;
            if (selected) {
                p.setPaletteCategory(selected.category);
                if (paletteField) paletteField.onChange(id);
                else {
                    p.setSelectedPaletteId(selected.id);
                    p.setPaletteColors(selected.hexColors);
                    p.setDepth(selected.hexColors.length);
                }
            }
            if (originalColors) {
                p.setDitherCategory('basic');
                p.setDitherStyle('color-separation');
            }
        };
        const originalButton = label => find(legacy, n => n.type === 'button' && text(n.props.children).trim() === label)?.props;
        const input = (index, type) => find(rows[index], n => n.type === 'input' && n.props.type === type)?.props;
        const buttons = node => { const found = []; walk(node, n => { if (n.type === 'button') {
            found.push(n.props);
            return false;
        } }); return found; };
        return h(React.Fragment, null,
            h('label', { className: 'bc-select-field' }, h('select', { 'aria-label': 'Color palette', value: originalColors ? originalOption : p.selectedPaletteId, onChange: e => select(e.target.value) },
                !p.isHalftoneMode && h('option', { value: originalOption }, 'Original colors'),
                !palette && h('option', { value: p.selectedPaletteId }, 'Custom colors'),
                ...categories.map(category => h('optgroup', { key: category, label: category }, ...available.filter(v => v.category === category).map(v => h('option', { key: v.id, value: v.id, disabled: !originalColors && paletteField?.disabled }, v.name)))))),
            originalColors && h('p', { className: 'bc-note bc-original-colors-note' }, 'Using the source colors. Your palette and other effects are kept.'),
            h('div', { className: 'bc-swatches' }, ...colors.map((c, i) => h('label', { key: i, title: c }, h('input', { ...input(i, 'color'), className: 'bc-color-picker', type: 'color', 'aria-label': `Palette color ${i + 1}`, value: c })))),
            h('div', { className: 'bc-palette-meta' }, h('span', null, `${colors.length} ${originalColors ? 'stored palette colors' : 'colors'}`), h('button', { onClick: () => window.dispatchEvent(new CustomEvent('bitcrush-open-library', { detail: 'Palettes' })) }, 'Browse palettes', h(Icon, { name: 'arrow', size: 12 }))), h('details', { className: 'bc-palette-advanced' }, h('summary', null, 'Edit colors & import'), h('div', null, ...rows.map((row, i) => h('div', { className: 'bc-color-row', key: i }, h('input', { ...input(i, 'text'), className: 'bc-color-hex' }), ...buttons(row).map((b, j) => h(Button, { key: j, title: b.title, onClick: b.onClick, disabled: b.disabled, icon: b.className?.includes('lock') ? 'lock' : b.className?.includes('delete') ? 'close' : undefined }, b.className?.includes('move') ? (j === 1 ? '↑' : '↓') : null)))), h('div', { className: 'bc-inline-actions' }, ...['Add Color', 'Import Palette', 'Export Palette'].map(label => { const b = originalButton(label); return h(Button, { key: label, title: label, onClick: b?.onClick, disabled: b?.disabled }, label); })), h('div', { className: 'bc-palette-options' }, ...fields(section).filter(v => !v.options).map((field, i) => h(Field, { key: i, field }))))));
    }
    function Effects() {
        const a = React.useContext(Context);
        if (!a)
            return null;
        const items = (a.order || []).map(id => a.instances[id]).filter(v => v && v.settings?.visible !== false && !['adjustments', 'dither', 'dither-style', 'color-palette'].includes(v.type));
        return h(Section, { title: 'Effects', defaultOpen: false, extra: items.length ? h('small', null, items.length) : null }, ...items.map((v, index) => h('article', { className: 'bc-effect-card', key: v.instanceId }, h('div', { className: 'bc-effect-name' }, h('button', { onClick: () => a.onTab(v.instanceId) }, v.customLabel || v.label), h('span', null, v.settings?.enabled ? 'On' : 'Off'), h(Button, { icon: 'close', title: `Remove ${v.label}`, onClick: () => a.onRemoveEffect(v.instanceId) })), h('div', { className: 'bc-inline-actions' }, h('button', { onClick: () => a.onTab(v.instanceId) }, 'Edit settings'), h('button', { onClick: () => a.onMoveEffect(v.instanceId, 'down'), disabled: index === 0 }, 'Earlier'), h('button', { onClick: () => a.onMoveEffect(v.instanceId, 'up'), disabled: index === items.length - 1 }, 'Later'), v.isDuplicatable && h('button', { onClick: () => a.onDuplicateEffect(v.instanceId) }, 'Duplicate')))), h(Button, { icon: 'plus', title: 'Add effect', className: 'full dashed', onClick: a.onAddEffect, disabled: !a.media }, 'Add effect'), h('button', { className: 'bc-text-action', onClick: () => a.onTab('custom') }, 'Edit processing order'));
    }
    function Primary({ legacy, ...p }) {
        const sections = [];
        for (const node of React.Children.toArray(legacy?.props?.children)) {
            if (!node?.props)
                continue;
            const title = titleOf(node)?.trim();
            if (!title || ['Style', 'Presets', 'Color Palette'].includes(title))
                continue;
            const controls = fields(node);
            if (controls.length)
                sections.push({ title: /dither|halftone/i.test(title) ? 'Pattern' : title.charAt(0) + title.slice(1).toLowerCase(), fields: controls, onShuffle: find(node, n => n.props?.onShuffle)?.props.onShuffle });
        }
        return h('div', { className: 'bc-primary' }, ...sections.filter(s => s.title !== 'Adjustments').map((section, i) => h(Section, { key: i, title: section.title, onShuffle: section.onShuffle }, p.isHalftoneMode && h(Field, { field: { label: 'Color mode', value: p.halftoneMode, onChange: p.setHalftoneMode, options: [{ value: 'grayscale', label: 'Grayscale' }, { value: 'cmyk', label: 'CMYK' }] } }), ...section.fields.map((field, index) => h(Field, { key: index, field })))), h(Section, { title: 'Color palette' }, h(Palette, { p, legacy }), p.isHalftoneMode && h('p', { className: 'bc-note' }, 'Halftone uses its own grayscale or CMYK channels.')), ...sections.filter(s => s.title === 'Adjustments').map((section, i) => h(Section, { key: 'adjustments' + i, title: 'Adjustments', defaultOpen: false, onShuffle: section.onShuffle }, ...section.fields.map((field, index) => h(Field, { key: index, field })))), h(Effects), h(Button, { title: 'Reset all controls to default values', className: 'full', onClick: action(legacy, 'Reset all controls to default values')?.onClick }, 'Reset style settings'), ...overlays(legacy));
    }
    function Effect({ legacy, ...p }) { const a = React.useContext(Context), groups = []; for (const node of React.Children.toArray(legacy?.props?.children)) {
        if (!node?.props)
            continue;
        const controls = fields(node);
        if (!controls.length)
            continue;
        groups.push({ title: titleOf(node) || 'Settings', fields: controls });
    } if (!groups.length)
        groups.push({ title: 'Settings', fields: fields(legacy) }); return h('div', { className: 'bc-effect-editor' }, h('button', { className: 'bc-back', onClick: () => a.onTab('controls') }, '← Back to style'), ...groups.map((group, i) => h(Section, { key: i, title: group.title }, ...group.fields.map((field, index) => h(Field, { key: index, field })))), h(Button, { title: 'Reset to default values', className: 'full', onClick: action(legacy, 'Reset to default values')?.onClick }, 'Reset effect settings'), ...overlays(legacy)); }
    function Picker({ legacy, ...p }) { const buttons = []; walk(legacy, n => { if (n.type === 'button' && n.props.onClick && text(n).trim() !== 'Cancel') {
        buttons.push(n.props);
        return false;
    } }); return h('div', { className: 'bc-picker' }, h('div', { className: 'bc-picker-heading' }, h('h3', null, 'Add an effect'), h(Button, { icon: 'close', title: 'Cancel effect selection', onClick: p.onCancel })), h('p', { className: 'bc-note' }, 'Build your look, one layer at a time.'), ...buttons.map((button, i) => h('button', { className: 'bc-picker-row', key: i, onClick: button.onClick, disabled: button.disabled }, h('span', null, text(button.children)), h(Icon, { name: 'plus' })))); }
    function Pipeline({ legacy, ...p }) { const a = React.useContext(Context); return h('div', { className: 'bc-pipeline' }, h('button', { className: 'bc-back', onClick: () => a.onTab('controls') }, '← Back to style'), h('h3', null, 'Processing order'), h('p', { className: 'bc-note' }, 'Your image passes through these stages in order.'), ...[...p.pipelineStages].filter(v => v.enabled).reverse().map((v, i) => h('article', { className: 'bc-pipeline-card', key: v.id }, h('small', null, String(i + 1).padStart(2, '0')), h('input', { 'aria-label': `Name ${v.label}`, defaultValue: v.label, onBlur: e => { if (e.target.value.trim() !== v.label)
            p.onRenameInstance?.(v.id, e.target.value.trim()); } }), h('div', null, ...['up', 'down'].map(direction => { const button = find(legacy, n => n.props?.['aria-label'] === `Move ${v.label} ${direction}`)?.props; return h(Button, { key: direction, title: `Move ${v.label} ${direction}`, onClick: button?.onClick, disabled: !button || button.disabled }, direction === 'up' ? '↑' : '↓'); })))), h(Button, { className: 'full', title: 'Reset pipeline order and all effect settings to defaults', onClick: action(legacy, 'Reset pipeline order and all effect settings to defaults')?.onClick }, 'Reset processing order')); }
    function Footer({ legacy }) { const a = React.useContext(Context), button = title => find(legacy, n => n.props?.['aria-label'] === title)?.props; const zoomButton = title => ({ onClick: button(title)?.onClick, disabled: button(title)?.disabled ?? true }); const zoom = find(legacy, n => n.props?.className === 'status-zoom-level')?.props; return h('div', { className: 'studio-canvas-footer' }, h('span', null, a.dimensions ? `${a.dimensions.width} × ${a.dimensions.height}` : 'No media', h('small', null, 'px')), h('div', { className: 'bc-zoom' }, h(Button, { icon: 'minus', title: 'Zoom out', className: 'icon', ...zoomButton('Zoom out') }), h('button', { title: 'Reset zoom', 'aria-label': 'Reset zoom', onClick: zoom?.onClick }, text(zoom?.children) === '100 %' ? 'Fit' : text(zoom?.children) || 'Fit'), h(Button, { icon: 'plus', title: 'Zoom in', className: 'icon', ...zoomButton('Zoom in') })), h('details', { className: 'studio-more' }, h('summary', { 'aria-label': 'Preview options' }, h(Icon, { name: 'fit' })), h('div', { className: 'studio-menu' }, ...['Cycle preview quality', 'Toggle slider debounce', 'Toggle animation mode', 'Toggle loop mode', 'Toggle playback mode'].map(name => { const p = button(name); return p && h(Button, { key: name, title: name, onClick: p.onClick, disabled: p.disabled }, text(p.children)); })))); }
    function Presets({ legacy }) { const cards = []; walk(legacy, n => { if (n.props?.className === 'preset-item') {
        cards.push(n);
        return false;
    } }); const input = find(legacy, n => n.props?.className === 'preset-file-input'); const importing = find(legacy, n => n.props?.className === 'preset-import-button')?.props; return h('div', { className: 'bc-presets' }, h('p', { className: 'bc-note' }, 'Your saved looks, ready for another image.'), h(Button, { title: 'Import preset from file', className: 'full', onClick: importing?.onClick, icon: 'plus' }, 'Import preset'), input, ...['preset-message-error', 'preset-message-success'].map(kind => { const message = find(legacy, n => n.props?.className?.includes(kind)); return message && h('p', { key: kind, className: 'bc-preset-message ' + kind }, text(message)); }), !cards.length && h('p', { className: 'bc-library-empty' }, 'No saved looks yet. Save a preset to keep your colors, effects, and settings together.'), ...cards.map((card, i) => { const editing = find(card, n => n.props?.className === 'preset-edit-form'); if (editing)
        return h('article', { className: 'bc-preset-card', key: i }, ...React.Children.toArray(editing.props.children).map((node, index) => { if (['input', 'textarea'].includes(node.type))
            return React.cloneElement(node, { key: index, className: 'bc-text-input' }); const buttons = []; walk(node, n => { if (n.type === 'button')
            buttons.push(n.props); }); return h('div', { key: index, className: 'bc-inline-actions' }, ...buttons.map((p, j) => h(Button, { key: j, onClick: p.onClick, disabled: p.disabled, title: p.title }, text(p.children)))); })); return h('article', { className: 'bc-preset-card preset-item', key: i }, h('h3', null, text(find(card, n => n.props?.className === 'preset-name'))), h('p', null, text(find(card, n => n.props?.className === 'preset-description'))), h('small', null, text(find(card, n => n.props?.className === 'preset-details'))), h('div', { className: 'bc-inline-actions' }, ...['load', 'edit', 'export', 'delete'].map(kind => { const p = find(card, n => n.props?.className?.split(' ').includes('preset-' + kind))?.props; return p && h(Button, { key: kind, title: p.title, className: 'preset-' + kind, onClick: p.onClick }, kind.charAt(0).toUpperCase() + kind.slice(1)); }))); })); }
    function SavePreset({ legacy }) { if (!legacy)
        return null; const close = action(legacy, 'Close (ESC)'), name = find(legacy, n => n.type === 'input')?.props, description = find(legacy, n => n.type === 'textarea')?.props, save = find(legacy, n => n.props?.className === 'save-preset-button save-preset-save')?.props, error = find(legacy, n => n.props?.className === 'save-preset-error'); return h('div', { className: 'bc-dialog-backdrop', onClick: close?.onClick }, h('section', { className: 'bc-dialog save-preset-modal', role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'studio-save-title', onClick: e => e.stopPropagation() }, h('header', null, h('div', null, h('h2', { id: 'studio-save-title' }, 'Save your look'), h('p', null, 'Keep this combination of color, texture, and effects.')), h(Button, { title: 'Close (ESC)', icon: 'close', className: 'icon', onClick: close?.onClick, disabled: close?.disabled })), h('form', { onSubmit: e => { e.preventDefault(); if (!save.disabled)
            save.onClick(); } }, h('label', null, 'Preset name', h('input', { ...name, className: 'bc-text-input' })), h('label', null, 'Description', h('textarea', { ...description, className: 'bc-text-input' })), error && h('p', { className: 'bc-note', role: 'alert' }, text(error)), h('p', { className: 'bc-note' }, 'Includes your exact colors, style parameters, effects, and processing order.'), h('footer', null, h(Button, { onClick: close?.onClick, disabled: close?.disabled }, 'Cancel'), h(Button, { title: 'Save Preset', className: 'save-preset-save', primary: true, onClick: save.onClick, disabled: save.disabled }, text(save.children)))))); }
    function Settings({ legacy }) { if (!legacy)
        return null; const close = action(legacy, 'Close settings (ESC)'), tabs = find(legacy, n => n.props?.className === 'settings-modal-tabs'), content = find(legacy, n => n.props?.className === 'settings-modal-content'); return h('div', { className: 'bc-dialog-backdrop', onClick: close?.onClick }, h('section', { className: 'bc-dialog bc-settings-dialog settings-modal', role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'studio-settings-title', onClick: e => e.stopPropagation() }, h('header', null, h('div', null, h('h2', { id: 'studio-settings-title' }, 'Settings'), h('p', null, 'Make the workspace work for you.')), h(Button, { icon: 'close', className: 'icon', title: 'Close settings (ESC)', onClick: close?.onClick })), h('nav', { className: 'bc-settings-tabs' }, ...React.Children.toArray(tabs?.props.children).filter(n => n?.props).map((n, i) => h('button', { key: i, title: n.props.title, 'aria-label': n.props.title, 'aria-current': n.props.className.includes('active') ? 'page' : undefined, onClick: n.props.onClick }, text(n)))), h('div', { className: 'bc-settings-content' }, content?.props.children))); }
    function SettingsPane({ legacy }) {
        const classes = { 'settings-section': 'bc-settings-section', 'settings-section-header': 'bc-settings-heading', 'settings-section-content': 'bc-settings-body', 'settings-label': 'bc-settings-label', 'settings-description': 'bc-settings-description', 'settings-description-list': 'bc-settings-description-list', 'settings-section-title': 'bc-settings-section-title', 'general-tab': 'bc-settings-pane', 'export-tab': 'bc-settings-pane' };
        function render(node, label, key) { if (Array.isArray(node))
            return node.map((v, i) => render(v, label, i)); if (!React.isValidElement(node))
            return node; const p = node.props; if (node.type === 'label')
            label = React.Children.toArray(p.children).filter(v => typeof v === 'string').join('').trim() || text(find(p.children, n => n.type === 'span')); if (node.type === 'label' && React.Children.toArray(p.children).some(v => typeof v?.type === 'function' && typeof v.props?.onChange === 'function')) {
                return h('div', { key, className: 'bc-settings-label' }, ...React.Children.toArray(p.children).filter(v => typeof v !== 'string' && v.type !== 'span').map((v, i) => render(v, label, i)));
            }
            if (typeof node.type === 'function' && typeof p.onChange === 'function' && ('value' in p || 'checked' in p))
            return h(Field, { key, field: { ...p, label: p.label || label } }); if (node.type === 'button')
            return h(Button, { key, onClick: p.onClick, disabled: p.disabled, title: p.title }, text(p.children) || p.title); if (node.type === 'input' || node.type === 'textarea')
            return React.cloneElement(node, { key, className: 'bc-text-input', 'aria-label': p['aria-label'] || label }); return React.cloneElement(node, { key, className: p.className?.split(' ').map(v => classes[v] || v).join(' ') }, render(p.children, label)); }
        return render(legacy);
    }
    return { Context, Primary, Effect, Picker, Pipeline, Footer, Presets, SavePreset, Settings, SettingsPane, Icon, Button, Section, Field, ...createStudioMediaViews(React, {Field, Icon, Button}) };
}
