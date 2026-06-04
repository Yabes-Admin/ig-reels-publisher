import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: false });
    p.on('error', rej);
    p.on('exit', code => code === 0 ? res() : rej(new Error(`${cmd} exit ${code}`)));
  });
}

async function ttsEdge(text, voice, rate, outPath) {
  // edge-tts is a python CLI installed via pip. Free, no key, unofficial.
  // Args: --voice <name> --rate <pct> --text <str> --write-media <file>
  await run('edge-tts', [
    '--voice', voice,
    '--rate', rate,
    '--text', text,
    '--write-media', outPath
  ]);
}

async function ttsAzure(text, voice, rate, outPath) {
  // Azure Speech REST API. Requires AZURE_SPEECH_KEY + AZURE_SPEECH_REGION envs.
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error('AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set');

  const ssml = `<speak version="1.0" xml:lang="id-ID">
  <voice name="${voice}">
    <prosody rate="${rate}">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</prosody>
  </voice>
</speak>`;

  const resp = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
      'User-Agent': 'ig-reels-publisher'
    },
    body: ssml
  });
  if (!resp.ok) throw new Error(`azure tts ${resp.status}: ${await resp.text()}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await writeFile(outPath, buf);
}

export async function synthesizeAll(specPath, outDir) {
  const spec = JSON.parse(await readFile(specPath, 'utf8'));
  const provider = spec.voice.provider;
  const cfg = spec.voice[provider];
  if (!cfg) throw new Error(`no voice config for provider "${provider}"`);

  await mkdir(outDir, { recursive: true });
  const synth = provider === 'azure' ? ttsAzure : ttsEdge;

  const segments = [];
  for (const scene of spec.scenes) {
    const out = resolve(outDir, `vo_${scene.id}.mp3`);
    console.log(`tts scene ${scene.id} (${provider}) → ${out}`);
    await synth(scene.vo, cfg.voice, cfg.rate, out);
    segments.push({ id: scene.id, start: scene.start, file: out });
  }
  return segments;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const segs = await synthesizeAll('spec/reel.json', 'dist/vo');
  console.log(`synthesized ${segs.length} segments`);
}
