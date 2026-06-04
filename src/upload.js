import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { resolve, basename } from 'node:path';

function runCapture(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'inherit'], shell: false });
    let out = '';
    p.stdout.on('data', d => { out += d.toString(); });
    p.on('error', rej);
    p.on('exit', code => code === 0 ? res(out.trim()) : rej(new Error(`${cmd} exit ${code}`)));
  });
}

// Uploads dist/out.mp4 as a GitHub Release asset and returns the public URL
// that the Instagram Graph API can fetch. Release tag is timestamped so each
// post is uniquely addressable; older releases can be GC'd by hand or with a
// retention workflow.
export async function uploadToRelease(filePath) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo) throw new Error('GITHUB_REPOSITORY not set (use within GHA)');
  if (!token) throw new Error('GITHUB_TOKEN not set');

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tag = `reel-${ts}`;
  const file = resolve(filePath);
  const size = (await stat(file)).size;

  console.log(`gh release create ${tag} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  await runCapture('gh', [
    'release', 'create', tag,
    file,
    '--repo', repo,
    '--title', tag,
    '--notes', 'Auto-generated reel asset',
    '--prerelease'
  ]);

  // GitHub Release asset URL is deterministic from tag + filename.
  const name = basename(file);
  const url = `https://github.com/${repo}/releases/download/${tag}/${name}`;
  console.log(`uploaded: ${url}`);
  return { url, tag };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const { url } = await uploadToRelease('dist/out.mp4');
  console.log(url);
}
