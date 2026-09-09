/**
 * Generates every Vexto brand asset from `geometry.mjs` and `wordmark.generated.mjs`.
 *
 *   node tools/brand/generate.mjs
 *
 * Writes:
 *   ../branding/*.svg                              the canonical masters
 *   ../branding/icons/*.png                        raster app icons, via Playwright's Chromium
 *   apps/<app>/public/                             the copies each application serves
 *   libs/ui/src/lib/brand/vexto-mark.geometry.ts   the geometry the inline Angular mark draws
 *
 * Committing the output means the apps never depend on this script at build time. Re-run it after
 * changing `geometry.mjs`; nothing else may hand-edit a coordinate.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  BOX,
  COLORS,
  FAVICON_OVERRIDES,
  ROUTE,
  ROUTE_WIDTH,
  WAYPOINT,
  inkBounds,
  routePath,
} from './geometry.mjs';
import { WORDMARK } from './wordmark.generated.mjs';

const FRONTEND = path.resolve(import.meta.dirname, '../..');
const REPO = path.resolve(FRONTEND, '..');
const BRANDING = path.join(REPO, 'branding');
const ICONS = path.join(BRANDING, 'icons');

const round = (value) => Number(value.toFixed(3));

/**
 * The wordmark's cap height as a share of the mark's ink height.
 *
 * Matching a font's em box or bounding box to a geometric mark makes the type look too small; cap
 * height is what the eye compares, and 0.59 is where the two stop competing.
 */
const WORDMARK_CAP_RATIO = 0.59;

const STANDARD = { route: ROUTE, routeWidth: ROUTE_WIDTH, waypoint: WAYPOINT };
const FAVICON = {
  route: FAVICON_OVERRIDES.route,
  routeWidth: FAVICON_OVERRIDES.routeWidth,
  waypoint: FAVICON_OVERRIDES.waypoint,
};

/* --------------------------------------------------------------------- the mark */

/**
 * The mark's two primitives, centred inside a square of `box` units.
 *
 * Centring is computed from the ink bounds rather than written down, so the mark stays optically
 * centred — the waypoint pushes the ink right of the geometric centre — whatever the geometry
 * does next.
 */
function markBody(variant, { box = BOX, color, indent = '  ', tight = false } = {}) {
  const ink = inkBounds(variant);
  // `tight` puts the ink's top-left at the origin, for a lockup that carries no padding of its
  // own. Otherwise the ink is centred in the square.
  const dx = round(tight ? -ink.x1 : (box - ink.width) / 2 - ink.x1);
  const dy = round(tight ? -ink.y1 : (box - ink.height) / 2 - ink.y1);
  const paint = color ?? 'currentColor';

  return [
    indent + '<g transform="translate(' + dx + ' ' + dy + ')">',
    indent + '  <path d="' + routePath(variant.route) + '" fill="none" stroke="' + paint + '"',
    indent +
      '    stroke-width="' +
      variant.routeWidth +
      '" stroke-linecap="round" stroke-linejoin="round"/>',
    indent +
      '  <circle cx="' +
      variant.waypoint.cx +
      '" cy="' +
      variant.waypoint.cy +
      '" r="' +
      variant.waypoint.r +
      '" fill="' +
      paint +
      '"/>',
    indent + '</g>',
  ].join('\n');
}

function svgOpen(viewBox, label) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
    viewBox +
    '" role="img" aria-label="' +
    label +
    '">\n  <title>' +
    label +
    '</title>\n'
  );
}

function markSvg(color, { variant = STANDARD } = {}) {
  return (
    svgOpen('0 0 ' + BOX + ' ' + BOX, 'Vexto') +
    markBody(variant, { color }) +
    '\n</svg>\n'
  );
}

/* ------------------------------------------------------------------ the lockups */

/**
 * The horizontal lockup: mark, then a gap of one waypoint diameter, then the wordmark.
 *
 * The wordmark is sized by **cap height**, at 59% of the mark's ink height. Matching a font's em
 * box or bounding box to a geometric mark makes the type look too small; cap height is what the
 * eye actually compares.
 */
function lockup({ markColor, wordColor }) {
  const ink = inkBounds(STANDARD);
  const capHeight = round(ink.height * WORDMARK_CAP_RATIO);
  const scale = capHeight / WORDMARK.capHeight;
  const gap = WAYPOINT.r * 2;

  const wordInkWidth = round((WORDMARK.box.x2 - WORDMARK.box.x1) * scale);
  const wordLeft = round(ink.width + gap - WORDMARK.box.x1 * scale);
  // Centre the cap box on the mark's ink centre, then put the baseline under it.
  const baseline = round((ink.height - capHeight) / 2 + capHeight);

  const width = round(ink.width + gap + wordInkWidth);
  const height = round(ink.height);

  return (
    svgOpen('0 0 ' + width + ' ' + height, 'Vexto') +
    markBody(STANDARD, { color: markColor, tight: true }) +
    '\n  <g transform="translate(' +
    wordLeft +
    ' ' +
    baseline +
    ') scale(' +
    round(scale) +
    ')">\n    <path d="' +
    WORDMARK.path +
    '" fill="' +
    wordColor +
    '"/>\n  </g>\n</svg>\n'
  );
}

function wordmarkSvg(color) {
  const width = round(WORDMARK.box.x2 - WORDMARK.box.x1);
  const height = round(WORDMARK.box.y2 - WORDMARK.box.y1);

  return (
    svgOpen('0 0 ' + width + ' ' + height, 'Vexto') +
    '  <g transform="translate(' +
    round(-WORDMARK.box.x1) +
    ' ' +
    WORDMARK.capHeight +
    ')">\n    <path d="' +
    WORDMARK.path +
    '" fill="' +
    color +
    '"/>\n  </g>\n</svg>\n'
  );
}

/* ----------------------------------------------------------------- the app icon */

/**
 * The app icon: the mark reversed out of a brand-coloured rounded square.
 *
 * The rounded square lives only here. Baking a container into the primary mark would turn every
 * inline use — sidebar, favicon, avatar — into a badge, and the mark would stop working on a
 * coloured surface.
 *
 * `inset` is the share of the icon left as padding. A maskable icon needs its ink inside the
 * central 80% safe circle, so it takes a larger inset and no corner radius: the platform supplies
 * the shape, and a pre-rounded maskable icon gets its corners clipped twice.
 */
function appIconSvg({ size = 512, radiusRatio = 0.22, inset = 0.21 } = {}) {
  const ink = inkBounds(STANDARD);
  const available = size * (1 - inset * 2);
  const scale = available / ink.height;
  const dx = round((size - ink.width * scale) / 2 - ink.x1 * scale);
  const dy = round((size - available) / 2 - ink.y1 * scale);
  const radius = round(size * radiusRatio);

  return (
    svgOpen('0 0 ' + size + ' ' + size, 'Vexto') +
    '  <rect width="' +
    size +
    '" height="' +
    size +
    '"' +
    (radius ? ' rx="' + radius + '" ry="' + radius + '"' : '') +
    ' fill="' +
    COLORS.brand +
    '"/>\n  <g transform="translate(' +
    dx +
    ' ' +
    dy +
    ') scale(' +
    round(scale) +
    ')">\n    <path d="' +
    routePath(ROUTE) +
    '" fill="none" stroke="' +
    COLORS.white +
    '" stroke-width="' +
    ROUTE_WIDTH +
    '" stroke-linecap="round" stroke-linejoin="round"/>\n    <circle cx="' +
    WAYPOINT.cx +
    '" cy="' +
    WAYPOINT.cy +
    '" r="' +
    WAYPOINT.r +
    '" fill="' +
    COLORS.white +
    '"/>\n  </g>\n</svg>\n'
  );
}

/* -------------------------------------------------------------------- emitting */

fs.mkdirSync(ICONS, { recursive: true });

const svgs = {
  'vexto-mark.svg': markSvg(COLORS.brand),
  'vexto-mark-light.svg': markSvg(COLORS.brand),
  'vexto-mark-dark.svg': markSvg(COLORS.brandDark),
  'vexto-mark-monochrome-dark.svg': markSvg(COLORS.ink),
  'vexto-mark-monochrome-light.svg': markSvg(COLORS.white),
  'vexto-wordmark.svg': wordmarkSvg(COLORS.ink),
  'vexto-wordmark-dark.svg': wordmarkSvg(COLORS.inkDark),
  'vexto-logo-horizontal.svg': lockup({ markColor: COLORS.brand, wordColor: COLORS.ink }),
  'vexto-logo-horizontal-dark.svg': lockup({
    markColor: COLORS.brandDark,
    wordColor: COLORS.inkDark,
  }),
  'vexto-logo-monochrome-dark.svg': lockup({ markColor: COLORS.ink, wordColor: COLORS.ink }),
  'vexto-logo-monochrome-light.svg': lockup({ markColor: COLORS.white, wordColor: COLORS.white }),
  'vexto-app-icon.svg': appIconSvg(),
  'vexto-app-icon-maskable.svg': appIconSvg({ radiusRatio: 0, inset: 0.28 }),
  'favicon.svg': markSvg(COLORS.brand, { variant: FAVICON }),
};

for (const [name, contents] of Object.entries(svgs)) {
  fs.writeFileSync(path.join(BRANDING, name), contents);
}

console.log('branding/: ' + Object.keys(svgs).length + ' SVG masters');

/* --------------------------------------- the geometry the Angular mark draws */

const centre = (variant, box = BOX) => {
  const b = inkBounds(variant);

  return { dx: round((box - b.width) / 2 - b.x1), dy: round((box - b.height) / 2 - b.y1) };
};

const ink = inkBounds(STANDARD);
const faviconInk = inkBounds(FAVICON);

const geometryTs = `/**
 * The Vexto mark, as the numbers the inline SVG draws — generated by
 * \`frontend/tools/brand/generate.mjs\` from \`frontend/tools/brand/geometry.mjs\`.
 * Do not edit by hand.
 *
 * \`VxLogo\` renders from these, and \`branding/*.svg\` is written from the same source in the same
 * run, so the mark in the sidebar and the mark in an email signature cannot drift apart.
 */

/** The square the mark is drawn in. */
export const VEXTO_MARK_BOX = ${BOX};

/** The two converging route strokes. */
export const VEXTO_MARK_ROUTE = '${routePath(ROUTE)}';

/** Weight of the route strokes. */
export const VEXTO_MARK_ROUTE_WIDTH = ${ROUTE_WIDTH};

/** The detached waypoint node. */
export const VEXTO_MARK_WAYPOINT = ${JSON.stringify(WAYPOINT)} as const;

/** Translation that centres the mark's ink in the box. */
export const VEXTO_MARK_OFFSET = ${JSON.stringify(centre(STANDARD))} as const;

/** Ink bounds inside the box — what clear space and minimum sizes are measured against. */
export const VEXTO_MARK_INK = {
  width: ${round(ink.width)},
  height: ${round(ink.height)},
} as const;

/**
 * An ink-tight viewBox, so an inline \`<svg>\` element's own box *is* the mark rather than the
 * padded square. That is what lets a template lay the mark out by the height it appears to be.
 */
export const VEXTO_MARK_INK_VIEWBOX = '${round(ink.x1)} ${round(ink.y1)} ${round(ink.width)} ${round(ink.height)}';

/** Ink width ÷ ink height. */
export const VEXTO_MARK_ASPECT = ${round(ink.width / ink.height)};

/**
 * The lockup's two proportions, shared with \`branding/vexto-logo-horizontal.svg\` so the inline
 * lockup and the asset are the same logo: the wordmark's cap height as a share of the mark's ink
 * height, and the gap between them as a share of the same.
 */
export const VEXTO_WORDMARK_CAP_RATIO = ${WORDMARK_CAP_RATIO};
export const VEXTO_LOCKUP_GAP_RATIO = ${round((WAYPOINT.r * 2) / ink.height)};

/**
 * Inter's cap height as a share of its font size. A template sizes the wordmark by cap height and
 * divides by this to get a \`font-size\`.
 */
export const INTER_CAP_RATIO = ${WORDMARK.capRatio};

/**
 * The favicon's optical variant: a shorter arm and a slightly larger node, so the gap survives
 * being drawn 16px wide. See \`geometry.mjs\`.
 */
export const VEXTO_FAVICON_ROUTE = '${routePath(FAVICON.route)}';
export const VEXTO_FAVICON_ROUTE_WIDTH = ${FAVICON.routeWidth};
export const VEXTO_FAVICON_WAYPOINT = ${JSON.stringify(FAVICON.waypoint)} as const;
export const VEXTO_FAVICON_OFFSET = ${JSON.stringify(centre(FAVICON))} as const;
`;

const brandDir = path.join(FRONTEND, 'libs/ui/src/lib/brand');
fs.mkdirSync(brandDir, { recursive: true });
fs.writeFileSync(path.join(brandDir, 'vexto-mark.geometry.ts'), geometryTs);
console.log('libs/ui/src/lib/brand/vexto-mark.geometry.ts');

/* ------------------------------------------------------------------- rasters */

/**
 * PNG icons, rendered through Playwright's Chromium — already a workspace dependency for the e2e
 * suite, so this adds nothing to install.
 *
 * PNGs exist because SVG manifest icons are not enough in practice: iOS ignores them for
 * `apple-touch-icon`, and several Android launchers still rasterise from a PNG.
 */
const rasters = [
  { name: 'vexto-app-icon-192.png', source: 'vexto-app-icon.svg', size: 192 },
  { name: 'vexto-app-icon-512.png', source: 'vexto-app-icon.svg', size: 512 },
  { name: 'vexto-app-icon-maskable-192.png', source: 'vexto-app-icon-maskable.svg', size: 192 },
  { name: 'vexto-app-icon-maskable-512.png', source: 'vexto-app-icon-maskable.svg', size: 512 },
  { name: 'apple-touch-icon.png', source: 'vexto-app-icon.svg', size: 180 },
  { name: 'vexto-mark-32.png', source: 'vexto-mark.svg', size: 32 },
  { name: 'vexto-mark-192.png', source: 'vexto-mark.svg', size: 192 },
];

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();

for (const { name, source, size } of rasters) {
  const svg = svgs[source];
  const encoded = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    '<style>html,body{margin:0;padding:0;background:transparent}' +
      'img{display:block;width:' +
      size +
      'px;height:' +
      size +
      'px}</style><img src="' +
      encoded +
      '">',
  );
  await page.locator('img').screenshot({
    path: path.join(ICONS, name),
    omitBackground: true,
  });
}

await browser.close();
console.log('branding/icons/: ' + rasters.length + ' PNGs');

/* ------------------------------------------- the copies each application serves */

const APPS = ['operator', 'driver', 'passenger'];

const served = {
  'favicon.svg': path.join(BRANDING, 'favicon.svg'),
  'apple-touch-icon.png': path.join(ICONS, 'apple-touch-icon.png'),
  'icon-192.png': path.join(ICONS, 'vexto-app-icon-192.png'),
  'icon-512.png': path.join(ICONS, 'vexto-app-icon-512.png'),
  'icon-maskable-192.png': path.join(ICONS, 'vexto-app-icon-maskable-192.png'),
  'icon-maskable-512.png': path.join(ICONS, 'vexto-app-icon-maskable-512.png'),
};

for (const app of APPS) {
  const target = path.join(FRONTEND, 'apps', app, 'public');
  fs.mkdirSync(target, { recursive: true });

  for (const [name, from] of Object.entries(served)) {
    fs.copyFileSync(from, path.join(target, name));
  }
}

console.log('apps/{' + APPS.join(',') + '}/public/: ' + Object.keys(served).length + ' files each');

/* --------------------------------------------------------------- boot screen */

/**
 * The pre-bootstrap boot screen, written between markers inside each `<vexto-root>`.
 *
 * Angular replaces the host element's content the moment it bootstraps, so this is what fills the
 * gap — and it is the one place the mark has to be duplicated as literal markup, because it must
 * paint before any script or stylesheet has run. Generating it rather than hand-writing it is what
 * keeps that copy honest.
 *
 * Deliberately small: a fade and a 0.96 → 1 scale, plus a pulse on the waypoint. It is a boot
 * state, not a splash animation, and anyone who opens the operator portal forty times a day would
 * come to hate a second of choreography. `prefers-reduced-motion` removes all three.
 */
function bootScreen() {
  const ink = inkBounds(STANDARD);
  const viewBox =
    round(ink.x1) + ' ' + round(ink.y1) + ' ' + round(ink.width) + ' ' + round(ink.height);
  const height = 44;
  const width = round(height * (ink.width / ink.height));

  return `      <!-- vexto:boot-screen:start -->
      <!-- Generated by frontend/tools/brand/generate.mjs. Do not edit by hand. -->
      <style>
        .vexto-boot {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f6f8fa;
          color: ${COLORS.brand};
        }
        [data-theme='dark'] .vexto-boot {
          background: #0c1526;
          color: ${COLORS.brandDark};
        }
        .vexto-boot svg {
          animation: vexto-boot-in 320ms ease-out both;
        }
        .vexto-boot circle {
          animation: vexto-boot-pulse 1600ms ease-in-out 320ms infinite;
        }
        @keyframes vexto-boot-in {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes vexto-boot-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.35;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .vexto-boot svg,
          .vexto-boot circle {
            animation: none;
          }
        }
      </style>
      <div class="vexto-boot" role="status" aria-label="Loading Vexto">
        <svg
          width="${width}"
          height="${height}"
          viewBox="${viewBox}"
          fill="none"
          aria-hidden="true"
          style="overflow: visible"
        >
          <path
            d="${routePath(ROUTE)}"
            stroke="currentColor"
            stroke-width="${ROUTE_WIDTH}"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle
            cx="${WAYPOINT.cx}"
            cy="${WAYPOINT.cy}"
            r="${WAYPOINT.r}"
            fill="currentColor"
          />
        </svg>
      </div>
      <!-- vexto:boot-screen:end -->`;
}

const BOOT_START = '<!-- vexto:boot-screen:start -->';
const BOOT_END = '<!-- vexto:boot-screen:end -->';

for (const app of APPS) {
  const indexPath = path.join(FRONTEND, 'apps', app, 'src/index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  const start = html.indexOf(BOOT_START);
  const end = html.indexOf(BOOT_END);

  if (start === -1 || end === -1) {
    throw new Error(
      'apps/' + app + '/src/index.html has no boot-screen markers inside <vexto-root>',
    );
  }

  // Back up to the start of the marker's own line so the replacement owns its indentation.
  const lineStart = html.lastIndexOf('\n', start) + 1;
  const next = html.slice(0, lineStart) + bootScreen() + html.slice(end + BOOT_END.length);
  fs.writeFileSync(indexPath, next);
}

console.log('apps/*/src/index.html: boot screen');

/* -------------------------------------------------------------------- report */

/** The visible gap between the short arm's cap and the waypoint — the mark's whole character. */
function waypointGap({ route, routeWidth, waypoint }) {
  const [, vertex, end] = route;
  const length = Math.hypot(end.x - vertex.x, end.y - vertex.y);
  const unit = { x: (end.x - vertex.x) / length, y: (end.y - vertex.y) / length };
  const tip = { x: end.x + (unit.x * routeWidth) / 2, y: end.y + (unit.y * routeWidth) / 2 };

  return round(Math.hypot(waypoint.cx - tip.x, waypoint.cy - tip.y) - waypoint.r);
}

const atSize = (units, px) => round((units / BOX) * px);

console.log(
  '\n  mark ink      ' +
    round(ink.width) +
    ' x ' +
    round(ink.height) +
    ' in a ' +
    BOX +
    ' box' +
    '\n  waypoint gap  ' +
    waypointGap(STANDARD) +
    ' units (' +
    atSize(waypointGap(STANDARD), 16) +
    'px at 16px)' +
    '\n  favicon gap   ' +
    waypointGap(FAVICON) +
    ' units (' +
    atSize(waypointGap(FAVICON), 16) +
    'px at 16px)' +
    '\n  favicon ink   ' +
    round(faviconInk.width) +
    ' x ' +
    round(faviconInk.height),
);
