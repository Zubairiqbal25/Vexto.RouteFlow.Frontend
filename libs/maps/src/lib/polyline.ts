/** One decoded point of an encoded polyline. */
export interface LatLngLiteral {
  readonly lat: number;
  readonly lng: number;
}

/**
 * Decodes Google's encoded polyline format into points.
 *
 * Written out rather than pulled from the provider SDK on purpose. The decoder needs
 * `google.maps.geometry`, which is a second library the map loader would have to request on every
 * page that shows a map; this is thirty lines and removes that dependency entirely. It is also the
 * one piece of provider knowledge that is genuinely portable — the format is a published
 * specification, and Mapbox emits the same thing.
 *
 * The algorithm: each coordinate is a delta from the previous one, multiplied by 1e5, zig-zag
 * encoded to make negatives compact, then split into five-bit chunks with a continuation bit and
 * offset into printable ASCII.
 *
 * Returns an empty array for anything it cannot read. A malformed string means no line drawn,
 * which is the same outcome as no line being available — never a thrown error on a map screen.
 */
export function decodePolyline(encoded: string | null | undefined): LatLngLiteral[] {
  if (!encoded) {
    return [];
  }

  const points: LatLngLiteral[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    const latitudeDelta = readDelta();

    if (latitudeDelta === null) {
      return points;
    }

    const longitudeDelta = readDelta();

    if (longitudeDelta === null) {
      return points;
    }

    latitude += latitudeDelta;
    longitude += longitudeDelta;

    points.push({ lat: latitude / 1e5, lng: longitude / 1e5 });
  }

  return points;

  /** One zig-zag encoded delta, or null if the string ends mid-value. */
  function readDelta(): number | null {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      if (index >= encoded!.length) {
        return null;
      }

      byte = encoded!.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    // The low bit is the sign: odd values are negative.
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}
