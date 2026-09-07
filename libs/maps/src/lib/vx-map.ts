import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MapLoader } from './map-loader.service';
import { decodePolyline } from './polyline';

/** A point the map can draw. Providers differ; this shape does not. */
export interface VxMapMarker {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly label?: string;
  /** Drives the pin colour: a live bus and a stale one must not look the same. */
  readonly tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
  /** Degrees clockwise from north. Rotates the pin so a bus points where it is going. */
  readonly heading?: number | null;
  readonly selected?: boolean;
}

const TONE_COLOURS: Record<NonNullable<VxMapMarker['tone']>, string> = {
  primary: '#0f8f85',
  success: '#0e9f6e',
  warning: '#d97706',
  danger: '#dc2626',
  neutral: '#64748b',
};

/** Roughly central Dubai — where the map opens before anything has a position. */
const DEFAULT_CENTRE = { lat: 25.1, lng: 55.24 };

/**
 * The only component in Vexto that knows what a map provider is.
 *
 * Feature screens deal in `VxMapMarker`, `center` and `fitToMarkers`. Swapping Google for Mapbox is
 * then a change to this file, not to Live Fleet and passenger tracking — which is the entire point
 * of the abstraction, and why the provider's types never leak out of it.
 *
 * With no key configured the component renders an honest placeholder instead of an empty grey box,
 * so a demo machine without a key still shows a usable screen.
 */
@Component({
  selector: 'vx-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative size-full overflow-hidden rounded-2xl bg-surface-muted">
      <div #canvas class="size-full" [class.invisible]="!ready()"></div>

      @if (!ready()) {
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
          @if (failed()) {
            <p class="text-body font-medium text-ink-secondary">Map unavailable</p>
            <p class="max-w-xs text-meta text-ink-muted">
              No map key is configured for this environment. Vehicle positions are still listed
              beside the map.
            </p>
          } @else {
            <div class="vx-skeleton size-full absolute inset-0"></div>
          }
        </div>
      }
    </div>
  `,
})
export class VxMap {
  private readonly loader = inject(MapLoader);
  private readonly canvas = viewChild.required<ElementRef<HTMLDivElement>>('canvas');

  readonly markers = input<readonly VxMapMarker[]>([]);
  readonly center = input<{ lat: number; lng: number } | null>(null);
  readonly zoom = input(12);
  /** Re-frames the viewport around all markers whenever the set changes. */
  readonly fitToMarkers = input(true);

  /**
   * An encoded polyline to draw beneath the markers, as the backend returned it.
   *
   * Opaque to every caller: the route preview and ETA endpoints pass a provider string straight
   * through, and this component is the only place that knows how to decode one. Null draws no
   * line, which is the normal state for a route with fewer than two stops.
   */
  readonly polyline = input<string | null>(null);

  readonly markerSelected = output<string>();

  protected readonly ready = signal(false);
  protected readonly failed = signal(false);

  private map: google.maps.Map | null = null;
  private readonly pins = new Map<string, google.maps.Marker>();
  private path: google.maps.Polyline | null = null;
  private hasFitted = false;

  constructor() {
    effect(() => {
      // Reading the inputs here keeps the effect subscribed before the async gap below.
      const markers = this.markers();
      const center = this.center();
      const polyline = this.polyline();

      void this.render(markers, center, polyline);
    });
  }

  private async render(
    markers: readonly VxMapMarker[],
    center: { lat: number; lng: number } | null,
    polyline: string | null,
  ): Promise<void> {
    if (!this.map) {
      const loaded = await this.loader.load();

      if (!loaded) {
        this.failed.set(true);

        return;
      }

      this.map = new google.maps.Map(this.canvas().nativeElement, {
        center: center ?? DEFAULT_CENTRE,
        zoom: this.zoom(),
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        // A muted base map: the vehicles are the content, the roads are context.
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        ],
      });

      this.ready.set(true);
    }

    this.syncMarkers(markers);
    this.syncPath(polyline);

    if (center) {
      this.map.panTo(center);
    } else if (this.fitToMarkers() && markers.length > 0 && !this.hasFitted) {
      this.fit(markers);
      this.hasFitted = true;
    }
  }

  /**
   * Moves existing pins rather than recreating them.
   *
   * Positions arrive every few seconds; tearing down and rebuilding every marker each time makes
   * the fleet flicker and drops any open info state.
   */
  private syncMarkers(markers: readonly VxMapMarker[]): void {
    const seen = new Set<string>();

    for (const marker of markers) {
      seen.add(marker.id);

      const position = { lat: marker.lat, lng: marker.lng };
      const existing = this.pins.get(marker.id);

      if (existing) {
        existing.setPosition(position);
        existing.setIcon(this.icon(marker));
        existing.setZIndex(marker.selected ? 10 : 1);

        continue;
      }

      const pin = new google.maps.Marker({
        map: this.map,
        position,
        title: marker.label,
        icon: this.icon(marker),
        zIndex: marker.selected ? 10 : 1,
      });

      pin.addListener('click', () => this.markerSelected.emit(marker.id));
      this.pins.set(marker.id, pin);
    }

    for (const [id, pin] of this.pins) {
      if (!seen.has(id)) {
        pin.setMap(null);
        this.pins.delete(id);
      }
    }
  }

  /**
   * Draws, replaces or removes the route line.
   *
   * Decoding happens in the provider SDK rather than here: `google.maps.geometry` is not loaded,
   * so the encoded string is handed to `Polyline` through its own decoder. When no line is
   * available the existing one is removed rather than left behind, so a route that loses its path
   * does not keep showing the old one.
   */
  private syncPath(polyline: string | null): void {
    if (!this.map) {
      return;
    }

    if (!polyline) {
      this.path?.setMap(null);
      this.path = null;

      return;
    }

    const points = decodePolyline(polyline);

    if (points.length === 0) {
      return;
    }

    if (this.path) {
      this.path.setPath(points);

      return;
    }

    this.path = new google.maps.Polyline({
      map: this.map,
      path: points,
      strokeColor: TONE_COLOURS.primary,
      strokeOpacity: 0.85,
      strokeWeight: 4,

      // Beneath the pins: the line is context, the stops are the content.
      zIndex: 0,
    });
  }

  /** A rounded arrow, tinted by tone and rotated by heading. Drawn as SVG so it stays crisp. */
  private icon(marker: VxMapMarker): google.maps.Symbol {
    const colour = TONE_COLOURS[marker.tone ?? 'primary'];

    return {
      path: 'M0,-9 L6,7 L0,3 L-6,7 Z',
      fillColor: colour,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: marker.selected ? 3 : 2,
      scale: marker.selected ? 1.5 : 1.2,
      rotation: marker.heading ?? 0,
    };
  }

  private fit(markers: readonly VxMapMarker[]): void {
    if (!this.map) {
      return;
    }

    const bounds = new google.maps.LatLngBounds();

    for (const marker of markers) {
      bounds.extend({ lat: marker.lat, lng: marker.lng });
    }

    // The line can wander outside the stops it joins — a road that loops away and comes back —
    // so it is part of what has to fit.
    for (const point of decodePolyline(this.polyline())) {
      bounds.extend(point);
    }

    this.map.fitBounds(bounds, 64);

    // fitBounds on a single point zooms all the way in, which is disorienting.
    if (markers.length === 1) {
      this.map.setZoom(15);
    }
  }
}
