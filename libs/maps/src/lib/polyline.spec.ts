import { describe, expect, it } from 'vitest';
import { decodePolyline } from './polyline';

describe('decodePolyline', () => {
  /**
   * The example from Google's own specification. If this ever drifts, every route line in the
   * product is drawn in the wrong place — which is exactly the kind of failure that looks like a
   * map problem for a week.
   */
  it('decodes the reference string from the polyline specification', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');

    expect(points).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it('decodes a single point', () => {
    expect(decodePolyline('_p~iF~ps|U')).toEqual([{ lat: 38.5, lng: -120.2 }]);
  });

  /** No line is a normal answer: a route with one stop has no path to draw. */
  it.each([null, undefined, ''])('returns nothing for %s', (value) => {
    expect(decodePolyline(value)).toEqual([]);
  });

  /**
   * A truncated string yields the points that were complete rather than throwing. A malformed
   * value must never take a map screen down.
   */
  it('stops cleanly at a value that ends mid-coordinate', () => {
    const points = decodePolyline('_p~iF~ps|U_ulL');

    expect(points).toEqual([{ lat: 38.5, lng: -120.2 }]);
  });
});
