// Reads every landmark aloud with Kokoro (open-source TTS, Apache-2.0, runs locally, no key) and saves
// small AAC files: public/voices/<id>-<pageid>.m4a. Needs `npm i kokoro-js` and ffmpeg (both in the
// GitHub runner via the Stories workflow). Skips files that already exist.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { KokoroTTS } from 'kokoro-js';

const wikiDir = 'public/wiki';
const out = 'public/voices';
mkdirSync(out, { recursive: true });
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
// a few American voices, one per neighborhood so each place sounds like its own narrator
const VOICES = ['af_heart', 'am_michael', 'af_bella', 'am_fenrir', 'af_nicole', 'am_puck'];

let made = 0;
for (const f of readdirSync(wikiDir)) {
  const id = f.replace(/\.json$/, '');
  const list = JSON.parse(readFileSync(`${wikiDir}/${f}`, 'utf8'));
  const voice = VOICES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % VOICES.length];
  let changed = false;
  for (const it of list) {
    const text = it.story ?? it.summary.split(/(?<=\.)\s/).slice(0, 2).join(' ');
    // named by the words, so new words get a new recording
    const hash = [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
    const file = `${id}-${it.pageid}-${hash}.m4a`;
    if (!existsSync(`${out}/${file}`)) {
      const wav = '/tmp/voice.wav'; // outside the repo, so a failure never gets committed
      try {
        const audio = await tts.generate(text, { voice });
        audio.save(wav);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-c:a', 'aac', '-b:a', '40k', `${out}/${file}`]);
        made++;
      } catch (e) {
        console.log(`voice: ${id} ${it.title}: ${e.message}`);
        continue;
      } finally {
        if (existsSync(wav)) unlinkSync(wav);
      }
    }
    if (it.voice !== file) {
      it.voice = file;
      changed = true;
    }
  }
  if (changed) writeFileSync(`${wikiDir}/${f}`, JSON.stringify(list));
  console.log(`voice: ${id} done (${voice})`);
}
console.log(`voice: ${made} new recordings`);
process.exit(0);
