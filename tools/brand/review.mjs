/**
 * Renders a contact sheet of every brand asset, at every size and on every background the design
 * system actually uses, and screenshots it.
 *
 *   node tools/brand/review.mjs [outputPath]
 *
 * This is how the "does it survive 16px" and "does it hold up on near-black" claims get checked
 * rather than asserted. Not part of any build.
 */
import fs from 'node:fs';
import path from 'node:path';

const BRANDING = path.resolve(import.meta.dirname, '../../../branding');
const out = process.argv[2] ?? path.join(BRANDING, 'review.png');

const read = (name) => fs.readFileSync(path.join(BRANDING, name), 'utf8');
const inline = (name) =>
  'data:image/svg+xml;base64,' + Buffer.from(read(name)).toString('base64');

const SIZES = [16, 20, 24, 32, 48, 64];

// The five grounds §24 asks about: white, light grey, dark navy, near-black, and the brand itself.
const GROUNDS = [
  { label: 'white #ffffff', bg: '#ffffff', mark: 'vexto-mark-light.svg', ink: '#101828' },
  { label: 'light grey #f6f8fa', bg: '#f6f8fa', mark: 'vexto-mark-light.svg', ink: '#101828' },
  { label: 'dark navy #0d1626', bg: '#0d1626', mark: 'vexto-mark-dark.svg', ink: '#e9eef7' },
  { label: 'near-black #08090c', bg: '#08090c', mark: 'vexto-mark-dark.svg', ink: '#e9eef7' },
  {
    label: 'brand #0f8f85',
    bg: '#0f8f85',
    mark: 'vexto-mark-monochrome-light.svg',
    ink: '#ffffff',
  },
];

const sizeRow = (mark) =>
  SIZES.map(
    (size) =>
      '<figure><img src="' +
      inline(mark) +
      '" width="' +
      size +
      '" height="' +
      size +
      '"><figcaption>' +
      size +
      '</figcaption></figure>',
  ).join('');

const groundBlock = (ground) =>
  '<section style="background:' +
  ground.bg +
  ';color:' +
  ground.ink +
  '">' +
  '<h2>' +
  ground.label +
  '</h2>' +
  '<div class="row">' +
  sizeRow(ground.mark) +
  '</div>' +
  '<div class="row lockups">' +
  '<img src="' +
  inline(
    ground.bg === '#0f8f85'
      ? 'vexto-logo-monochrome-light.svg'
      : ground.ink === '#101828'
        ? 'vexto-logo-horizontal.svg'
        : 'vexto-logo-horizontal-dark.svg',
  ) +
  '" height="28">' +
  '<img src="' +
  inline(
    ground.bg === '#0f8f85'
      ? 'vexto-logo-monochrome-light.svg'
      : ground.ink === '#101828'
        ? 'vexto-logo-horizontal.svg'
        : 'vexto-logo-horizontal-dark.svg',
  ) +
  '" height="18">' +
  '<span class="note">lockup at 28px and 18px tall</span>' +
  '</div>' +
  '</section>';

const html =
  '<style>' +
  'body{margin:0;font:13px Inter,system-ui,sans-serif;background:#e6e9ee}' +
  'section{padding:18px 22px}' +
  'h2{margin:0 0 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.7}' +
  '.row{display:flex;align-items:flex-end;gap:22px;flex-wrap:wrap}' +
  '.row+.row{margin-top:18px}' +
  'figure{margin:0;text-align:center}' +
  'figcaption{margin-top:6px;font-size:10px;opacity:.6}' +
  '.lockups{align-items:center}' +
  '.note{font-size:10px;opacity:.6}' +
  '.plate{padding:18px 22px;background:#ffffff;border-top:1px solid #d7dce4}' +
  '.icons{display:flex;align-items:center;gap:20px}' +
  '.icons figure figcaption{opacity:.6}' +
  '.mask{position:relative;width:96px;height:96px}' +
  '.mask img{width:96px;height:96px;border-radius:50%}' +
  '</style>' +
  GROUNDS.map(groundBlock).join('') +
  '<div class="plate"><h2 style="color:#101828">app icon, favicon, wordmark</h2>' +
  '<div class="icons">' +
  '<figure><img src="' +
  inline('vexto-app-icon.svg') +
  '" width="96" height="96"><figcaption>app icon 96</figcaption></figure>' +
  '<figure><img src="' +
  inline('vexto-app-icon.svg') +
  '" width="48" height="48"><figcaption>48</figcaption></figure>' +
  '<figure><div class="mask"><img src="' +
  inline('vexto-app-icon-maskable.svg') +
  '"></div><figcaption>maskable, circle-cropped</figcaption></figure>' +
  '<figure><img src="' +
  inline('favicon.svg') +
  '" width="16" height="16"><figcaption>favicon 16</figcaption></figure>' +
  '<figure><img src="' +
  inline('vexto-mark-light.svg') +
  '" width="16" height="16"><figcaption>standard 16</figcaption></figure>' +
  '<figure><img src="' +
  inline('vexto-wordmark.svg') +
  '" height="22"><figcaption>wordmark</figcaption></figure>' +
  '</div></div>';

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();

console.log('wrote ' + out);
