import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { VxDrawer, VxEmptyState, VxIcon, VxSkeleton } from '@vexto/ui';
import { formatDateTime } from '@vexto/utilities';

/** What the history shows for either kind of template: number, when, by whom, why. */
export interface VersionRow {
  readonly versionNumber: number;
  readonly createdAtUtc: string;
  readonly createdBy: string | null;
  readonly notes: string | null;
  readonly isCurrent: boolean;
}

/**
 * Every published version, newest first.
 *
 * Immutable on the server, read-only here. Each row can be previewed or, for an email, sent as a
 * test, so an administrator can check what a passenger received last month without restoring
 * anything. There is no "revert" button: the way back is to edit the working copy and publish,
 * which keeps the history honest about the fact that somebody chose to go back.
 */
@Component({
  selector: 'vexto-version-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxDrawer, VxEmptyState, VxIcon, VxSkeleton],
  template: `
    <vx-drawer [open]="open()" title="Version history" [subtitle]="subtitle()" (closed)="closed.emit()">
      @if (loading()) {
        <div class="flex flex-col gap-3 p-1">
          <vx-skeleton height="3.5rem" />
          <vx-skeleton height="3.5rem" />
          <vx-skeleton height="3.5rem" />
        </div>
      } @else if (versions().length === 0) {
        <vx-empty-state icon="history" title="Not published yet" description="Publishing creates version 1. Every publish after that adds a version here." />
      } @else {
        <ol class="flex flex-col gap-3">
          @for (version of versions(); track version.versionNumber) {
            <li class="vx-card p-4" [class.ring-2]="version.isCurrent" [style.--tw-ring-color]="version.isCurrent ? 'var(--vexto-primary)' : null">
              <div class="flex items-center justify-between gap-3">
                <span class="text-body font-semibold text-ink">Version {{ version.versionNumber }}</span>
                @if (version.isCurrent) {
                  <span class="vx-badge vx-tone-success">In use</span>
                }
              </div>
              <p class="mt-1 text-meta text-ink-muted">{{ when(version.createdAtUtc) }}</p>
              @if (version.notes) {
                <p class="mt-2 text-body text-ink">{{ version.notes }}</p>
              }
              <div class="mt-3 flex flex-wrap gap-2">
                <button type="button" class="vx-btn vx-btn-secondary vx-btn-sm" (click)="preview.emit(version.versionNumber)">
                  <vx-icon name="eye" [size]="14" />
                  Preview
                </button>
                @if (canSendTest()) {
                  <button type="button" class="vx-btn vx-btn-ghost vx-btn-sm" (click)="sendTest.emit(version.versionNumber)">
                    <vx-icon name="send" [size]="14" />
                    Send test
                  </button>
                }
              </div>
            </li>
          }
        </ol>
      }
    </vx-drawer>
  `,
})
export class VersionHistory {
  readonly open = input(false);
  readonly subtitle = input<string | null>(null);
  readonly loading = input(false);
  readonly versions = input.required<readonly VersionRow[]>();
  readonly canSendTest = input(false);
  readonly closed = output<void>();
  readonly preview = output<number>();
  readonly sendTest = output<number>();

  protected readonly when = formatDateTime;
}
