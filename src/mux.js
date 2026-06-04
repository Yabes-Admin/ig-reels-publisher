import { spawn } from 'node:child_process';
import { readFile, access, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: false });
    p.on('error', rej);
    p.on('exit', code => code === 0 ? res() : rej(new Error(`${cmd} exit ${code}`)));
  });
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

export async function mux(specPath, videoPath, voSegments, outPath) {
  const spec = JSON.parse(await readFile(specPath, 'utf8'));
  await mkdir(dirname(outPath), { recursive: true });

  const musicPath = resolve(spec.music.file);
  const hasMusic = await exists(musicPath);

  // Each VO segment is delayed to its scene start, all summed into one track.
  const voInputs = voSegments.flatMap(seg => ['-i', seg.file]);
  const voDelayChains = voSegments.map((seg, i) =>
    `[${i + 1}:a]adelay=${Math.round(seg.start * 1000)}|${Math.round(seg.start * 1000)},apad[vo${i}]`
  ).join(';');
  const voMixInputs = voSegments.map((_, i) => `[vo${i}]`).join('');
  const voMix = `${voMixInputs}amix=inputs=${voSegments.length}:duration=longest:normalize=0[voall]`;

  let filter, mapAudio;
  if (hasMusic) {
    const musicIdx = 1 + voSegments.length;
    const musicChain =
      `[${musicIdx}:a]aloop=loop=-1:size=2e+09,atrim=duration=${spec.duration},` +
      `volume=${spec.music.volume},afade=t=in:st=0:d=0.5,afade=t=out:st=${spec.duration - 0.8}:d=0.8[bgm]`;
    const finalMix = `[voall][bgm]amix=inputs=2:duration=first:normalize=0,dynaudnorm=p=0.85[aout]`;
    filter = [voDelayChains, voMix, musicChain, finalMix].join(';');
    mapAudio = '[aout]';
  } else {
    console.log('NOTE: assets/music.mp3 missing — rendering with VO only.');
    filter = [voDelayChains, voMix].join(';');
    mapAudio = '[voall]';
  }

  const args = [
    '-y',
    '-i', resolve(videoPath),
    ...voInputs,
    ...(hasMusic ? ['-stream_loop', '-1', '-i', musicPath] : []),
    '-filter_complex', filter,
    '-map', '0:v',
    '-map', mapAudio,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',
    '-t', String(spec.duration),
    resolve(outPath)
  ];

  console.log(`mux ${hasMusic ? 'video+vo+music' : 'video+vo (no music)'} → ${outPath}`);
  await run('ffmpeg', args);
  return outPath;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const spec = JSON.parse(await readFile('spec/reel.json', 'utf8'));
  const segs = spec.scenes.map(s => ({
    id: s.id, start: s.start, file: resolve(`dist/vo/vo_${s.id}.mp3`)
  }));
  await mux('spec/reel.json', 'dist/video.mp4', segs, 'dist/out.mp4');
}
