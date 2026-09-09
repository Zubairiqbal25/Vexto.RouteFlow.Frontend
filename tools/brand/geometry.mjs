/**
 * The one definition of the Vexto mark.
 *
 * Everything else — every SVG in `branding/`, every PNG, the favicon, the app icons and the
 * inline Angular component — is derived from these numbers by `generate.mjs`. Nothing downstream
 * re-types a coordinate, so the mark cannot drift out of step with itself.
 *
 * The mark is two primitives, deliberately:
 *
 *   1. one open polyline — the two route strokes converging on the vertex, round-capped
 *   2. one detached circle — the waypoint
 *
 * A stroke and a dot stay crisp at 16px and survive being flattened to a single colour, which a
 * mark built from filled compound paths does not. Do not add a third primitive.
 */

/** Route strokes: down the long left arm, through the vertex, up the shorter right arm. */
export const ROUTE = [
  { x: 7.8, y: 6.8 },
  { x: 14.8, y: 25.2 },
  { x: 19.8, y: 12.2 },
];

/** Stroke weight of the route, in the same units as ROUTE. */
export const ROUTE_WIDTH = 5.2;

/** The detached waypoint node, off the end of the short arm. */
export const WAYPOINT = { cx: 24, cy: 6.8, r: 2.7 };

/**
 * The favicon needs the gap between the arm and the waypoint to survive being drawn 16px wide,
 * where the standard 1.7-unit gap lands on well under one pixel and closes up. This is the only
 * sanctioned optical variant: a shorter arm and a slightly larger node widen the gap to 2.7 units
 * without touching the silhouette.
 */
export const FAVICON_OVERRIDES = {
  route: [
    { x: 7.8, y: 6.8 },
    { x: 14.8, y: 25.2 },
    { x: 19.4, y: 13.2 },
  ],
  routeWidth: 5.0,
  waypoint: { cx: 24.3, cy: 6.5, r: 2.95 },
};

/** The canonical palette, taken from `libs/ui/src/styles/vexto-tokens.css`. */
export const COLORS = {
  /** `--vexto-primary`, light theme. The brand colour. */
  brand: '#0f8f85',
  /** `--vexto-primary`, dark theme. Lifted so it is not muddy on a dark surface. */
  brandDark: '#2eb3a6',
  /** `--vexto-text-primary`, light theme. */
  ink: '#101828',
  /** `--vexto-text-primary`, dark theme. */
  inkDark: '#e9eef7',
  white: '#ffffff',
};

/** The square the standalone mark and the icons are drawn in. */
export const BOX = 32;

/** Ink bounds of a round-capped polyline plus a circle: the Minkowski sum with a disk. */
export function inkBounds({ route, routeWidth, waypoint }) {
  const r = routeWidth / 2;
  const xs = [...route.map((p) => p.x - r), ...route.map((p) => p.x + r)];
  const ys = [...route.map((p) => p.y - r), ...route.map((p) => p.y + r)];

  if (waypoint) {
    xs.push(waypoint.cx - waypoint.r, waypoint.cx + waypoint.r);
    ys.push(waypoint.cy - waypoint.r, waypoint.cy + waypoint.r);
  }

  const x1 = Math.min(...xs);
  const y1 = Math.min(...ys);
  const x2 = Math.max(...xs);
  const y2 = Math.max(...ys);

  return { x1, y1, x2, y2, width: x2 - x1, height: y2 - y1 };
}

/** `d` for the route polyline. */
export function routePath(route = ROUTE) {
  return route.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
}
