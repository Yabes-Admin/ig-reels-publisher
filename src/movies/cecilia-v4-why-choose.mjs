#!/usr/bin/env node
// Cecilia v4 "Why Choose" — minimal-change build over v2 canonical (DZMdFu9Dl44).
//
// Only TWO things differ from v2 canonical:
//   1. Beat 2 VO: "delapan modul" -> "tiga puluh modul"
//   2. Opener: trim 2:5 (keeps last 3s of 5s scene8 clip = preserves heart-touch gesture)
//
// Reuses v2's already-lipsynced beat 1 + beat 3 (script unchanged). Reuses v2's
// silent Seedance source for beat 2 (scene2_tablet_flipped, known good motion)
// and only re-runs sync-lipsync once with the new audio.
//
// Cost: ~$0.55 (1 ElevenLabs call + 1 sync-lipsync call).

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DIST = path.join(ROOT, 'dist');
const CLIPS = path.join(DIST, 'clips_v4');
const LIPSYNC_OUT = path.join(DIST, 'lipsync_out_v4');
const ASSETS_VO = path.join(ROOT, 'assets/lipsync_inputs');

// Load .env
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const FAL_KEY = process.env.FAL_KEY;
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;

const CHARLOTTE = 'XB0fDUnXU5powFXDhCwa';
const BRANCH = 'seedance-rev01';
const REPO = 'Yabes-Admin/ig-reels-publisher';
const RAW = (file) => `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${file}`;

const BEAT2_VO = 'Cloud terintegrasi tiga puluh modul, sesuai regulasi Indonesia, unlimited user, dukungan tim dedicated.';

const log = (...args) => console.log('[cecilia-v4]', ...args);
const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
const shCapture = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
const mkdirp = (p) => fs.mkdirSync(p, { recursive: true });

async function falPost(modelPath, body) {
  const res = await fetch(`https://fal.run/${modelPath}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(900_000),
  });
  if (!res.ok) throw new Error(`Fal ${modelPath} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function downloadTo(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} -> ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

// ─── Phase 1: ElevenLabs Charlotte for beat 2 ───────────────────────────────
async function genVO() {
  const outFile = path.join(ASSETS_VO, 'vo_beat2_v4.mp3');
  if (fs.existsSync(outFile)) { log('beat2 VO exists, skipping'); return; }
  log(`Generating beat 2 VO (${BEAT2_VO.length} chars)...`);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${CHARLOTTE}`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: BEAT2_VO,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.55, similarity_boost: 0.80, style: 0.15, use_speaker_boost: true },
      output_format: 'mp3_44100_128',
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outFile, buf);
  log(`  -> ${outFile} (${buf.length} bytes)`);
}

// ─── Phase 2: commit + push VO + v2 silent beat 2 source ────────────────────
function pushAssets() {
  log('Committing + pushing VO and silent v2 beat2 source to seedance-rev01...');
  // Also commit the silent v2 source so we can give Fal a public URL for it.
  fs.copyFileSync(
    path.join(CLIPS, 'beat2_silent_v2source.mp4'),
    path.join(ASSETS_VO, 'seedance_beat2_v2.mp4'),
  );
  sh('git add assets/lipsync_inputs/vo_beat2_v4.mp3 assets/lipsync_inputs/seedance_beat2_v2.mp4 src/movies/cecilia-v4-why-choose.mjs');
  try {
    sh(`git commit -m "Cecilia v4: beat 2 VO with 'tiga puluh' (30) + v2 silent source for re-sync"`);
    sh('git push origin seedance-rev01');
  } catch (e) {
    log('  (commit/push skipped — likely nothing new to commit)');
  }
  log('  waiting 5s for raw.githubusercontent.com propagation');
  return new Promise(r => setTimeout(r, 5000));
}

// ─── Phase 3: sync-lipsync beat 2 only ──────────────────────────────────────
async function lipsyncBeat2() {
  mkdirp(LIPSYNC_OUT);
  const outFile = path.join(LIPSYNC_OUT, 'beat2_synced.mp4');
  if (fs.existsSync(outFile)) { log('beat2 already synced, skipping'); return; }
  const videoUrl = RAW('assets/lipsync_inputs/seedance_beat2_v2.mp4');
  const audioUrl = RAW('assets/lipsync_inputs/vo_beat2_v4.mp3');
  log(`sync-lipsync beat2:`);
  log(`  video: ${videoUrl}`);
  log(`  audio: ${audioUrl}`);
  log('  (this takes ~4-5 min)');
  const result = await falPost('fal-ai/sync-lipsync', {
    video_url: videoUrl,
    audio_url: audioUrl,
    sync_mode: 'cut_off',
  });
  const url = result.video?.url || result.video_url || result.url;
  if (!url) throw new Error(`sync-lipsync: no URL in ${JSON.stringify(result).slice(0, 200)}`);
  log(`  result URL: ${url}`);
  await downloadTo(url, outFile);
  log(`  -> ${outFile}`);
}

// ─── Phase 4: ffmpeg concat with 2:5 opener trim ────────────────────────────
function compose() {
  const opener = path.join(CLIPS, 'opener_with_silence.mp4');
  const beat1 = path.join(CLIPS, 'beat1_synced.mp4');
  const beat2 = path.join(LIPSYNC_OUT, 'beat2_synced.mp4');
  const beat3 = path.join(CLIPS, 'beat3_synced.mp4');

  const dur = (f) => parseFloat(shCapture(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`));
  // Opener trim window: 2.0s -> 5.0s (= 3s of content, last 3s of source clip = preserves heart-touch)
  const O_START = 2.0;
  const O_END = 5.0;
  const dOpener = O_END - O_START; // 3.0
  const d1 = dur(beat1);
  const d2 = dur(beat2);
  const d3 = dur(beat3);
  log(`durations: opener=3.0 (trimmed ${O_START}-${O_END}) | b1=${d1.toFixed(2)} | b2=${d2.toFixed(2)} | b3=${d3.toFixed(2)}`);

  const x = 0.3;
  const o1 = dOpener - x;             // opener->b1 xfade start
  const o2 = o1 + d1;                 // b1->b2 xfade start
  const o3 = o2 + d2;                 // b2->b3 xfade start

  // Total composed length = dOpener + d1 + d2 + d3 - 3x

  const filter = `
[0:v]trim=${O_START}:${O_END},setpts=PTS-STARTPTS,scale=1080:1920:flags=lanczos,setsar=1,format=yuv420p[v0];
[1:v]scale=1080:1920:flags=lanczos,setsar=1,format=yuv420p[v1];
[2:v]scale=1080:1920:flags=lanczos,setsar=1,format=yuv420p[v2];
[3:v]scale=1080:1920:flags=lanczos,setsar=1,format=yuv420p[v3];
[v0][v1]xfade=transition=fade:duration=${x}:offset=${o1.toFixed(3)}[v01];
[v01][v2]xfade=transition=fade:duration=${x}:offset=${o2.toFixed(3)}[v012];
[v012][v3]xfade=transition=fade:duration=${x}:offset=${o3.toFixed(3)}[vout];
[0:a]atrim=${O_START}:${O_END},asetpts=PTS-STARTPTS,aresample=44100[a0];
[1:a]aresample=44100,asetpts=PTS-STARTPTS[a1];
[2:a]aresample=44100,asetpts=PTS-STARTPTS[a2];
[3:a]aresample=44100,asetpts=PTS-STARTPTS[a3];
[a0][a1]acrossfade=d=${x}[a01];
[a01][a2]acrossfade=d=${x}[a012];
[a012][a3]acrossfade=d=${x}[aout]
`.replace(/\n\s*/g, '');

  const out = path.join(DIST, 'out_cecilia_v4.mp4');
  const cmd = [
    'ffmpeg -y',
    `-i "${opener}"`,
    `-i "${beat1}"`,
    `-i "${beat2}"`,
    `-i "${beat3}"`,
    `-filter_complex "${filter}"`,
    `-map "[vout]" -map "[aout]"`,
    `-c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -r 30`,
    `-c:a aac -ar 48000 -ac 2 -b:a 128k`,
    `-movflags +faststart`,
    `"${out}"`,
  ].join(' ');
  log(`composing -> ${out}`);
  sh(cmd);
}

// ─── Main ───────────────────────────────────────────────────────────────────
const phase = process.argv.find((a) => a.startsWith('--phase='))?.split('=')[1] || 'all';
if (phase === 'vo' || phase === 'all') await genVO();
if (phase === 'push' || phase === 'all') await pushAssets();
if (phase === 'lipsync' || phase === 'all') await lipsyncBeat2();
if (phase === 'compose' || phase === 'all') compose();
log('Done.');
