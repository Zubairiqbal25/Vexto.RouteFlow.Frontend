/**
 * Checks the brand assets on disk.
 *
 *   npm run brand:verify
 *
 * The unit tests cover what the components render; this covers what the *files* say, which no
 * jsdom test can see: that the committed SVGs still draw the approved geometry, that they are true
 * vectors rather than a wrapped PNG, that every app serves the icons its manifest promises, and
 * that no old template branding has crept back in.
 *
 * Exits non-zero with a list of failures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { FAVICON_OVERRIDES, ROUTE, WAYPOINT, routePath } from './geometry.mjs';

const FRONTEND = path.resolve(import.meta.dirname, '../..');
const REPO = path.resolve(FRONTEND, '..');
const BRANDING = path.join(REPO, 'branding');
const APPS = ['operator', 'driver', 'passenger'];

const failures = [];
const fail = (message) => failures.push(message);
const read = (file) => fs.readFileSync(file, 'utf8');

/* ------------------------------------------------- the masters exist and are true vectors */

const MASTERS = [
  'vexto-mark.svg',
  'vexto-mark-light.svg',
  'vexto-mark-dark.svg',
  'vexto-mark-monochrome-dark.svg',
  'vexto-mark-monochrome-light.svg',
  'vexto-wordmark.svg',
  'vexto-wordmark-dark.svg',
  'vexto-logo-horizontal.svg',
  'vexto-logo-horizontal-dark.svg',
  'vexto-logo-monochrome-dark.svg',
  'vexto-logo-monochrome-light.svg',
  'vexto-app-icon.svg',
  'vexto-app-icon-maskable.svg',
  'favicon.svg',
];

for (const name of MASTERS) {
  const file = path.join(BRANDING, name);

  if (!fs.existsSync(file)) {
    fail(`branding/${name} is missing`);
    continue;
  }

  const svg = read(file);

  if (!svg.includes('viewBox=')) {
    fail(`branding/${name} has no viewBox, so it will not scale`);
  }

  // A logo that embeds a bitmap is not a vector logo, whatever its file extension says.
  if (/<image\b/.test(svg) || /data:image\/(png|jpe?g|gif|webp)/.test(svg)) {
    fail(`branding/${name} embeds a raster image`);
  }

  for (const junk of ['inkscape:', 'sodipodi:', '<metadata', 'Adobe Illustrator', '<!DOCTYPE']) {
    if (svg.includes(junk)) {
      fail(`branding/${name} carries editor junk (${junk})`);
    }
  }

  // Six decimal places in a path is a sign of an exported file nobody has looked at.
  const overlyPrecise = svg.match(/\d+\.\d{5,}/g);
  if (overlyPrecise) {
    fail(`branding/${name} has excessive path precision (${overlyPrecise[0]})`);
  }

  if (!svg.includes('<title>')) {
    fail(`branding/${name} has no <title> for assistive technology`);
  }
}

/* ------------------------------------------------------ the masters draw the approved mark */

const APPROVED = routePath(ROUTE);
const FAVICON_APPROVED = routePath(FAVICON_OVERRIDES.route);

const marksWithTheRoute = [
  'vexto-mark.svg',
  'vexto-mark-light.svg',
  'vexto-mark-dark.svg',
  'vexto-mark-monochrome-dark.svg',
  'vexto-mark-monochrome-light.svg',
  'vexto-logo-horizontal.svg',
  'vexto-logo-horizontal-dark.svg',
  'vexto-logo-monochrome-dark.svg',
  'vexto-logo-monochrome-light.svg',
  'vexto-app-icon.svg',
  'vexto-app-icon-maskable.svg',
];

for (const name of marksWithTheRoute) {
  const svg = read(path.join(BRANDING, name));

  if (!svg.includes(APPROVED)) {
    fail(`branding/${name} no longer draws the approved route — re-run tools/brand/generate.mjs`);
  }

  if (!svg.includes(`r="${WAYPOINT.r}"`)) {
    fail(`branding/${name} has lost the waypoint node`);
  }

  // Two primitives, no more: one route path and one circle.
  const shapes = (svg.match(/<(path|circle|rect|ellipse|polygon|polyline|line)\b/g) ?? []).filter(
    // The app icons legitimately add their container rectangle.
    (tag) => !(name.startsWith('vexto-app-icon') && tag === '<rect'),
  );
  const expected = name.startsWith('vexto-logo') ? 3 : 2; // lockups add the wordmark path

  if (shapes.length !== expected) {
    fail(`branding/${name} draws ${shapes.length} shapes, expected ${expected}`);
  }
}

if (!read(path.join(BRANDING, 'favicon.svg')).includes(FAVICON_APPROVED)) {
  fail('branding/favicon.svg no longer draws the favicon variant of the approved route');
}

/* ---------------------------------------------------------- each app serves what it promises */

const SERVED = [
  'favicon.svg',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-192.png',
  'icon-maskable-512.png',
];

for (const app of APPS) {
  const publicDir = path.join(FRONTEND, 'apps', app, 'public');

  for (const name of SERVED) {
    if (!fs.existsSync(path.join(publicDir, name))) {
      fail(`apps/${app}/public/${name} is missing`);
    }
  }

  // The served favicon must be the master, not a stale copy.
  const served = path.join(publicDir, 'favicon.svg');
  if (fs.existsSync(served) && read(served) !== read(path.join(BRANDING, 'favicon.svg'))) {
    fail(`apps/${app}/public/favicon.svg differs from branding/favicon.svg`);
  }

  const indexPath = path.join(FRONTEND, 'apps', app, 'src/index.html');
  const html = read(indexPath);

  for (const required of [
    'rel="icon" href="favicon.svg"',
    'rel="apple-touch-icon"',
    'vexto:boot-screen:start',
    'class="vexto-boot"',
  ]) {
    if (!html.includes(required)) {
      fail(`apps/${app}/src/index.html is missing ${required}`);
    }
  }

  if (!html.includes(APPROVED)) {
    fail(`apps/${app}/src/index.html boot screen does not draw the approved route`);
  }

  const manifestPath = path.join(publicDir, 'manifest.webmanifest');

  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(read(manifestPath));

    for (const icon of manifest.icons ?? []) {
      if (!fs.existsSync(path.join(publicDir, icon.src))) {
        fail(`apps/${app}: manifest references missing icon ${icon.src}`);
      }
    }

    if (!(manifest.icons ?? []).some((icon) => icon.purpose?.includes('maskable'))) {
      fail(`apps/${app}: manifest declares no maskable icon`);
    }
  }
}

/* ------------------------------------------------------------- no old branding left behind */

/**
 * Traces of the identity this replaced. The docs deliberately keep a written assessment of the
 * TailAdmin reference project, so only application and library source is scanned.
 */
const FORBIDDEN = [
  { pattern: /tailadmin/i, why: 'TailAdmin template branding' },
  {
    pattern: /linear-gradient\(135deg, var\(--vexto-primary\) 0%, var\(--vexto-primary-active\) 100%\)[\s\S]{0,120}>V</,
    why: 'the old letter-V gradient badge',
  },
  { pattern: /M9 9l7 15 7-15/, why: 'the old plain-V favicon path' },
  { pattern: /angular\.(svg|png)|angular-logo/i, why: 'the Angular starter logo' },
];

const SCAN_ROOTS = [path.join(FRONTEND, 'apps'), path.join(FRONTEND, 'libs')];

function* sourceFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'generated') {
      continue;
    }

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      yield* sourceFiles(full);
    } else if (/\.(ts|html|css|json|webmanifest|svg)$/.test(entry.name)) {
      yield full;
    }
  }
}

for (const root of SCAN_ROOTS) {
  for (const file of sourceFiles(root)) {
    const contents = read(file);

    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(contents)) {
        fail(`${path.relative(FRONTEND, file)} still contains ${why}`);
      }
    }
  }
}

/* -------------------------------------------------------------------------------- report */

if (failures.length > 0) {
  console.error(`brand:verify — ${failures.length} problem(s):\n`);
  for (const message of failures) {
    console.error(`  ✗ ${message}`);
  }
  process.exit(1);
}

console.log(
  'brand:verify — ok\n' +
    `  ${MASTERS.length} vector masters, all drawing the approved geometry\n` +
    `  ${APPS.length} apps serving ${SERVED.length} icons each, with boot screens\n` +
    '  no old template branding in apps/ or libs/',
);
