import { execFile } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import manifest from '../package.json' with { type: 'json' };

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const temporary = await mkdtemp(path.join(root, '.website-build-'));
const stage = path.join(temporary, 'dist');

try {
  await cp(path.join(root, 'website'), stage, { recursive: true });
  const download = path.join(stage, 'download');
  await mkdir(download);
  // Use the same npm CLI that launched the build, including on Windows.
  const args = ['pack', '--offline', '--ignore-scripts', '--pack-destination', download, '--cache', path.join(temporary, 'npm-cache')];
  const npm = process.env.npm_execpath;
  await promisify(execFile)(npm ? process.execPath : 'npm', npm ? [npm, ...args] : args, {
    cwd: root,
    encoding: 'utf8',
  });
  const archives = await readdir(download);
  if (archives.length !== 1 || !archives[0].endsWith('.tgz')) throw new Error('Expected npm pack to create one .tgz file.');
  const [archive] = archives;
  const lib = path.join(stage, 'lib');
  for (const filename of [...manifest.files.filter(name => !name.endsWith('.d.ts')), 'LICENSE']) {
    const destination = path.join(lib, filename);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(root, filename), destination);
  }
  const demo = path.join(stage, 'demo');
  await mkdir(demo);
  const demoHtml = await readFile(path.join(root, 'demo', 'index.html'), 'utf8');
  await writeFile(path.join(demo, 'index.html'), demoHtml
    .replace('src="../auto.js"', 'src="../lib/auto.js"')
    .replace('href="../assets/badge.css"', 'href="../lib/assets/badge.css"'));
  for (const page of ['index.html', 'docs/index.html']) {
    const index = path.join(stage, page);
    const html = await readFile(index, 'utf8');
    await writeFile(index, html
      .replaceAll('{{VERSION}}', manifest.version)
      .replaceAll('{{TARBALL}}', archive)
      .replaceAll('{{HOMEPAGE}}', manifest.homepage));
  }

  // Keep a failed build from replacing the last complete preview.
  await rm(dist, { recursive: true, force: true });
  await rename(stage, dist);
  console.log(`Built dist/ with ${archive}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
