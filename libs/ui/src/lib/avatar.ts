import {
  ChangeDetectionStrategy,
  Component,
  InjectionToken,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import type { Observable } from 'rxjs';
import { initials } from '@vexto/utilities';

/**
 * How the avatar turns a photo path into something an `<img>` can show.
 *
 * A token rather than a direct dependency, because `@vexto/ui` sits below `@vexto/api-client` in
 * the dependency graph and must stay there — a design-system library that knows how to make HTTP
 * requests is a design-system library nobody can reuse. Each application provides the real
 * implementation (`PhotoSource`) at bootstrap; without one the avatar simply renders initials,
 * which is also the fallback for every person who has no photo.
 */
export type PhotoResolver = (path: string) => Observable<string | null>;

export const VX_PHOTO_RESOLVER = new InjectionToken<PhotoResolver>('VX_PHOTO_RESOLVER');

export type VxAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Live-ness of the person or thing, shown as a dot on the avatar's corner. */
export type VxAvatarStatus = 'online' | 'busy' | 'offline' | 'warning' | 'danger';

const SIZES: Readonly<Record<VxAvatarSize, { box: number; text: number; dot: number }>> = {
  xs: { box: 1.5, text: 0.5625, dot: 0.4375 },
  sm: { box: 1.875, text: 0.6875, dot: 0.5 },
  md: { box: 2.375, text: 0.8125, dot: 0.625 },
  lg: { box: 3, text: 1, dot: 0.75 },
  xl: { box: 4.5, text: 1.375, dot: 0.9375 },
};

const STATUS_COLOURS: Readonly<Record<VxAvatarStatus, string>> = {
  online: 'var(--vexto-success)',
  busy: 'var(--vexto-warning)',
  offline: 'var(--vexto-neutral)',
  warning: 'var(--vexto-warning)',
  danger: 'var(--vexto-danger)',
};

/**
 * The one avatar in the product.
 *
 * Used for passengers, drivers, users, tenant contacts, the top bar and every manifest row, so that
 * a face is the same size, shape and fallback everywhere. Three things it deliberately does:
 *
 * - **Initials are the fallback, never a broken image.** Most people have no photo; a grey
 *   silhouette or a snapped-image icon reads as an error, and a coloured monogram does not. If the
 *   fetch fails after `hasPhoto` said otherwise — a deleted file, an expired session — it falls
 *   back to the same monogram rather than leaving a hole.
 * - **The photo is fetched, not linked.** See `VX_PHOTO_RESOLVER`.
 * - **The status dot is decorative only.** It is never the sole carrier of meaning: every screen
 *   that uses one also states the status in words, because a coloured dot is invisible to a
 *   screen reader and ambiguous to anyone who cannot separate the hues.
 */
@Component({
  selector: 'vx-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="relative inline-flex flex-none" [style.width.rem]="box()" [style.height.rem]="box()">
      @if (photoUrl(); as url) {
        <img
          class="size-full rounded-full object-cover"
          style="background: var(--vexto-surface-muted)"
          [src]="url"
          [alt]="label()"
          (error)="failed.set(true)"
        />
      } @else {
        <span
          class="vx-avatar size-full"
          [style.font-size.rem]="text()"
          [attr.title]="label()"
          [attr.aria-label]="label()"
          role="img"
        >
          {{ monogram() }}
        </span>
      }

      @if (status(); as dot) {
        <span
          class="absolute -bottom-px -end-px rounded-full"
          [style.width.rem]="dotSize()"
          [style.height.rem]="dotSize()"
          [style.background]="dotColour()"
          [style.box-shadow]="'0 0 0 2px var(--vexto-surface)'"
          aria-hidden="true"
        ></span>
      }
    </span>
  `,
})
export class VxAvatar {
  private readonly resolver = inject(VX_PHOTO_RESOLVER, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  readonly name = input<string | null | undefined>(null);
  readonly secondName = input<string | null | undefined>(null);
  readonly size = input<VxAvatarSize>('md');

  /**
   * The API path that serves this person's photo, e.g. `/api/v1/passengers/{id}/photo`.
   * Null, or a record whose `hasPhoto` is false, renders initials without a request.
   */
  readonly photoPath = input<string | null>(null);

  /** Whether a photo exists. Responses carry this flag; there is no URL to test for. */
  readonly hasPhoto = input(false);

  readonly status = input<VxAvatarStatus | null>(null);

  private readonly resolved = signal<string | null>(null);
  protected readonly failed = signal(false);

  protected readonly box = computed(() => SIZES[this.size()].box);
  protected readonly text = computed(() => SIZES[this.size()].text);
  protected readonly dotSize = computed(() => SIZES[this.size()].dot);
  protected readonly dotColour = computed(() =>
    this.status() ? STATUS_COLOURS[this.status()!] : 'transparent',
  );

  protected readonly monogram = computed(() => initials(this.name(), this.secondName()));
  protected readonly label = computed(
    () => [this.name(), this.secondName()].filter(Boolean).join(' ') || 'Unnamed',
  );

  protected readonly photoUrl = computed(() => (this.failed() ? null : this.resolved()));

  constructor() {
    effect((onCleanup) => {
      const path = this.photoPath();
      const has = this.hasPhoto();

      this.resolved.set(null);
      this.failed.set(false);

      if (!path || !has || !this.resolver) {
        return;
      }

      const subscription = this.resolver(path)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((url) => this.resolved.set(url));

      onCleanup(() => subscription.unsubscribe());
    });
  }
}
