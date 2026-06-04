import { spawn } from 'node:child_process';
import { readFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: false });
    p.on('error', rej);
    p.on('exit', code => code === 0 ? res() : rej(new Error(`${cmd} exit ${code}`)));
  });
}

function buildKenBurns(sceneIdx, duration, fps, width, height) {
  const frames = Math.round(duration * fps);
  return [
    `[${sceneIdx}:v]scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase`,
    `crop=${width * 2}:${height * 2}`,
    `zoompan=z='min(zoom+0.0008,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${fps}`,
    `setsar=1`,
    `format=yuv420p`,
    `fade=t=in:st=0:d=0.4`,
    `fade=t=out:st=${duration - 0.4}:d=0.4`
  ].join(',') + `[s${sceneIdx}]`;
}

function escapeFilterPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

export async function render(specPath, captionsPath, outPath) {
  const spec = JSON.parse(await readFile(specPath, 'utf8'));
  const { fps, width, height, scenes } = spec;
  await mkdir(dirname(outPath), { recursive: true });

  const inputs = scenes.flatMap(s => [
    '-loop', '1',
    '-t', String(s.end - s.start),
    '-i', resolve(s.image)
  ]);

  const sceneFilters = scenes.map((s, i) => buildKenBurns(i, s.end - s.start, fps, width, height));

  // xfade chain between consecutive scenes (0.5s overlap)
  const xfadeDur = 0.5;
  let xfadeChain = '';
  let cursor = scenes[0].end - scenes[0].start - xfadeDur;
  let lastLabel = 's0';
  for (let i = 1; i < scenes.length; i++) {
    const nextLabel = i === scenes.length - 1 ? 'vfaded' : `vx${i}`;
    xfadeChain += `;[${lastLabel}][s${i}]xfade=transition=fade:duration=${xfadeDur}:offset=${cursor.toFixed(2)}[${nextLabel}]`;
    cursor += (scenes[i].end - scenes[i].start) - xfadeDur;
    lastLabel = nextLabel;
  }

  const subPath = escapeFilterPath(resolve(captionsPath));
  const filterComplex =
    sceneFilters.join(';') +
    xfadeChain +
    `;[vfaded]subtitles='${subPath}'[vout]`;

  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-r', String(fps),
    '-t', String(spec.duration),
    resolve(outPath)
  ];

  console.log(`ffmpeg ${args.length} args, ${scenes.length} scenes, ${spec.duration}s output`);
  await run('ffmpeg', args);
  return outPath;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  await render('spec/reel.json', 'dist/captions.ass', 'dist/video.mp4');
  console.log('video rendered: dist/video.mp4');
}
