import { readFile } from 'node:fs/promises';
import { generateCaptions } from './captions.js';
import { render } from './render.js';
import { synthesizeAll } from './tts.js';
import { mux } from './mux.js';
import { uploadToRelease } from './upload.js';
import { publishReel } from './publish.js';

const SPEC = 'spec/reel.json';
const CAPS = 'dist/captions.ass';
const SILENT_VIDEO = 'dist/video.mp4';
const VO_DIR = 'dist/vo';
const FINAL = 'dist/out.mp4';

const args = new Set(process.argv.slice(2));
const skipUpload = args.has('--no-upload');
const skipPublish = args.has('--no-publish');

console.log('=== ig-reels-publisher ===');

console.log('\n[1/6] captions');
await generateCaptions(SPEC, CAPS);

console.log('\n[2/6] tts');
const voSegments = await synthesizeAll(SPEC, VO_DIR);

console.log('\n[3/6] render video (silent)');
await render(SPEC, CAPS, SILENT_VIDEO);

console.log('\n[4/6] mux audio');
await mux(SPEC, SILENT_VIDEO, voSegments, FINAL);

if (skipUpload) {
  console.log('\n[5/6] upload — skipped (--no-upload)');
  console.log(`\n✓ Final output: ${FINAL}`);
  process.exit(0);
}

console.log('\n[5/6] upload to GH release');
const { url, tag } = await uploadToRelease(FINAL);

if (skipPublish) {
  console.log('\n[6/6] publish — skipped (--no-publish)');
  console.log(`\n✓ Uploaded but not published. URL: ${url}`);
  process.exit(0);
}

console.log('\n[6/6] publish to Instagram');
const spec = JSON.parse(await readFile(SPEC, 'utf8'));
const caption = process.env.CAPTION_OVERRIDE || spec.publish.captionTemplate;
const result = await publishReel({
  videoUrl: url,
  caption,
  thumbOffsetMs: spec.publish.thumbOffsetMs
});

console.log(`\n✓ Reel published: media_id=${result.mediaId}, release=${tag}`);
