// Build a single self-contained page (CSS and JS inlined) for claude.ai artifact hosting.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
const assets = readdirSync('dist/assets');
const js = readFileSync(`dist/assets/${assets.find((f) => /^index-.*\.js$/.test(f))}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(`dist/assets/${assets.find((f) => f.endsWith('.css'))}`, 'utf8');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const out = `<title>Night Walker NYC</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bangers&display=swap" rel="stylesheet" />
<style>${css}</style>
${body.trim()}
<script type="module">${js}</script>
`;
writeFileSync('dist/game.html', out.replace('<script type="module">', '<script src="models-embed.js"></script>\n<script type="module">'));
const b64 = (f) => readFileSync(f).toString('base64');
writeFileSync(
  'dist/models-embed.js',
  `window.__NW_MODELS = { avatar: "${b64('dist/models/readyplayer.me.glb')}", motion: "${b64('dist/models/Soldier.glb')}", michelle: "${b64('dist/models/Michelle.glb')}" };\n`,
);
console.log('bytes', out.length, 'script-close occurrences', (js.match(/<\/script/gi) || []).length);
