// The Settings tab: graphics presets, effect switches and sliders, saved in the browser.

export const PRESETS = {
  low: { ratio: 1, shadows: false, shadowRes: 2048, ao: false, reflections: false, bloom: true, shafts: false, cones: true },
  medium: { ratio: 1.25, shadows: true, shadowRes: 2048, ao: false, reflections: true, bloom: true, shafts: true, cones: true },
  high: { ratio: 1.5, shadows: true, shadowRes: 3072, ao: true, reflections: true, bloom: true, shafts: true, cones: true },
  ultra: { ratio: 2, shadows: true, shadowRes: 4096, ao: true, reflections: true, bloom: true, shafts: true, cones: true },
};

export const DEFAULTS = {
  preset: 'high', ...PRESETS.high,
  lensRain: true, print: true, hatch: true, boil: true, lut: true, words: true, twos: true, realMap: true, panels: false,
  fov: 58, camera: 'cinematic', sensitivity: 1, volume: 0.8,
};

const ROWS = [
  { group: 'Graphics' },
  { key: 'preset', label: 'Quality', type: 'choice', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']] },
  { key: 'shadows', label: 'Sun shadows', type: 'toggle' },
  { key: 'ao', label: 'Contact shadows (AO)', type: 'toggle' },
  { key: 'reflections', label: 'Wet street reflections', type: 'toggle' },
  { key: 'bloom', label: 'Bloom glow', type: 'toggle' },
  { key: 'shafts', label: 'Sun shafts', type: 'toggle' },
  { key: 'cones', label: 'Lamp light cones', type: 'toggle' },
  { group: 'Comic style' },
  { key: 'print', label: 'Misprinted color plates', type: 'toggle' },
  { key: 'hatch', label: 'Halftone and hatching', type: 'toggle' },
  { key: 'boil', label: 'Hand-drawn wobbly lines', type: 'toggle' },
  { key: 'lut', label: 'Color grade (texture pack)', type: 'toggle' },
  { key: 'twos', label: 'Animate on twos', type: 'toggle' },
  { key: 'words', label: 'Sound-effect words', type: 'toggle' },
  { key: 'lensRain', label: 'Rain on the lens', type: 'toggle' },
  { key: 'panels', label: 'Comic panel lines in the sky', type: 'toggle' },
  { group: 'World' },
  { key: 'realMap', label: 'Real OpenStreetMap streets', type: 'toggle' },
  { group: 'Camera and sound' },
  { key: 'camera', label: 'Camera', type: 'choice', options: [['cinematic', 'Cinematic'], ['classic', 'Classic']] },
  { key: 'fov', label: 'Field of view', type: 'range', min: 45, max: 100, step: 1, unit: '°' },
  { key: 'sensitivity', label: 'Mouse sensitivity', type: 'range', min: 0.3, max: 2.5, step: 0.1, unit: '×' },
  { key: 'volume', label: 'Volume', type: 'range', min: 0, max: 1, step: 0.05, pct: true },
];

/** Render the settings rows into `root`; onChange(key, value) fires on every edit. */
export function buildSettings(root, values, onChange) {
  const render = () => {
    root.replaceChildren();
    for (const row of ROWS) {
      if (row.group) {
        const h = document.createElement('h3');
        h.textContent = row.group;
        root.append(h);
        continue;
      }
      const el = document.createElement('div');
      el.className = 'set-row';
      const label = document.createElement('span');
      label.className = 'set-label';
      label.textContent = row.label;
      el.append(label);
      if (row.type === 'toggle') {
        const b = document.createElement('button');
        b.className = 'set-toggle';
        b.classList.toggle('on', !!values[row.key]);
        b.textContent = values[row.key] ? 'On' : 'Off';
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          onChange(row.key, !values[row.key]);
          render();
        });
        el.append(b);
      } else if (row.type === 'choice') {
        const seg = document.createElement('div');
        seg.className = 'set-seg';
        for (const [v, name] of row.options) {
          const b = document.createElement('button');
          b.textContent = name;
          b.classList.toggle('on', values[row.key] === v);
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            onChange(row.key, v);
            render();
          });
          seg.append(b);
        }
        if (values.preset === 'custom') {
          const c = document.createElement('em');
          c.textContent = 'Custom';
          seg.append(c);
        }
        el.append(seg);
      } else if (row.type === 'range') {
        const wrap = document.createElement('div');
        wrap.className = 'set-range';
        const input = document.createElement('input');
        Object.assign(input, { type: 'range', min: row.min, max: row.max, step: row.step, value: values[row.key] });
        const out = document.createElement('output');
        const show = (v) => (out.textContent = row.pct ? `${Math.round(v * 100)}%` : `${Number(v).toFixed(row.step < 1 ? 1 : 0)}${row.unit ?? ''}`);
        show(values[row.key]);
        input.addEventListener('input', (e) => {
          e.stopPropagation();
          show(input.value);
          onChange(row.key, Number(input.value));
        });
        input.addEventListener('pointerdown', (e) => e.stopPropagation());
        wrap.append(input, out);
        el.append(wrap);
      }
      root.append(el);
    }
  };
  render();
  return { render };
}
