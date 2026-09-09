import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { AgreementsApi, VextoApiError } from '@vexto/api-client';
import type { AgreementDetailResponse } from '@vexto/models';
import { CanDirective, PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxAttentionNote,
  VxCardFact,
  VxErrorState,
  VxPageHeader,
  VxSectionCard,
  VxSkeleton,
  VxStatusBadge,
  type VxTab,
  VxTabs,
} from '@vexto/ui';
import { daysUntil, formatDate, humanizeEnum, serviceDate } from '@vexto/utilities';
import { AgreementDocuments } from './agreement-documents';

/** How close to its end date an agreement starts asking for attention. */
const EXPIRY_WARNING_DAYS = 30;

/**
 * One agreement: what it says, and what is filed against it.
 *
 * A page rather than a drawer, because an agreement is now a container for files — uploading,
 * downloading and deleting inside a 26rem panel would be cramped, and the documents deserve room to
 * be read. The list's quick-view drawer still exists for "which one is this", which is the question
 * a drawer is good at.
 *
 * **Two tabs, not three.** Overview and Documents are the two things the API can answer. An
 * Activity tab would be a heading over an empty box: agreements record no timeline, and inventing
 * one from `createdAtUtc` would be a panel pretending to be a history.
 */
@Component({
  selector: 'vexto-agreement-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AgreementDocuments,
    CanDirective,
    VxAttentionNote,
    VxCardFact,
    VxErrorState,
    VxPageHeader,
    VxSectionCard,
    VxSkeleton,
    VxStatusBadge,
    VxTabs,
  ],
  template: `
    @if (error(); as message) {
      <vx-error-state
        title="We could not load this agreement"
        [message]="message"
        (retry)="load()"
      />
    } @else {
      <vx-page-header
        [title]="detail()?.agreement?.agreementNumber ?? 'Agreement'"
        [description]="detail()?.agreement?.title ?? null"
        [breadcrumbs]="breadcrumbs()"
      >
        <ng-container actions>
          @if (detail(); as loaded) {
            <ng-container *vxCan="manage">
              @if (loaded.agreement.status === 'Draft' || loaded.agreement.status === 'PendingSignature') {
                <button
                  type="button"
                  class="vx-btn vx-btn-primary"
                  [disabled]="working()"
                  (click)="activate()"
                >
                  Activate
                </button>
              } @else if (loaded.agreement.status === 'Active') {
                <button
                  type="button"
                  class="vx-btn vx-btn-secondary"
                  [disabled]="working()"
                  (click)="terminate()"
                >
                  Terminate
                </button>
              }
            </ng-container>
          }
        </ng-container>
      </vx-page-header>

      @if (loading()) {
        <div class="vx-card p-5"><vx-skeleton height="14rem" /></div>
      } @else if (detail(); as loaded) {
        <div class="mb-5 flex flex-wrap items-center gap-3">
          <vx-status-badge [status]="loaded.agreement.status" />
          <span class="text-meta text-ink-muted">{{ label(loaded.agreement.type) }}</span>
        </div>

        @if (note(); as warning) {
          <div class="mb-5">
            <vx-attention-note [level]="warning.level">{{ warning.label }}</vx-attention-note>
          </div>
        }

        <vx-tabs
          label="Agreement sections"
          [tabs]="tabs()"
          [active]="tab()"
          (selected)="tab.set($event)"
        />

        <div class="mt-5">
          @if (tab() === 'overview') {
            <vx-section-card title="Overview" description="What this agreement covers.">
              <dl class="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <vx-card-fact label="Type" [value]="label(loaded.agreement.type)" />
                <vx-card-fact
                  label="Renewal"
                  [value]="loaded.agreement.autoRenew ? 'Automatic' : 'Manual'"
                />
                <vx-card-fact label="Starts" [value]="date(loaded.agreement.startDate)" />
                <vx-card-fact
                  label="Ends"
                  [value]="loaded.agreement.endDate ? date(loaded.agreement.endDate) : 'Open-ended'"
                />
                <vx-card-fact
                  label="Signed"
                  [value]="
                    loaded.agreement.signedDate ? date(loaded.agreement.signedDate) : 'Not signed'
                  "
                />
                <vx-card-fact label="Created" [value]="date(loaded.agreement.createdAtUtc)" />
              </dl>

              @if (loaded.agreement.description) {
                <div class="mt-5">
                  <p class="vx-section-label mb-1">Description</p>
                  <p class="text-body text-ink-secondary">{{ loaded.agreement.description }}</p>
                </div>
              }

              @if (loaded.agreement.notes) {
                <div class="mt-5">
                  <p class="vx-section-label mb-1">Notes</p>
                  <p class="text-body text-ink-secondary">{{ loaded.agreement.notes }}</p>
                </div>
              }
            </vx-section-card>
          } @else {
            <vx-section-card
              title="Documents"
              description="The signed contract and any supporting paperwork."
            >
              <vexto-agreement-documents
                [agreementId]="agreementId()"
                [documents]="loaded.documents"
                [canManage]="canManage()"
                (changed)="load()"
              />
            </vx-section-card>
          }
        </div>
      }
    }
  `,
})
export class AgreementDetailPage {
  private readonly api = inject(AgreementsApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly permissions = inject(PermissionService);

  readonly agreementId = input.required<string>();

  protected readonly manage = VextoPermissions.Agreements.Manage;
  protected readonly date = formatDate;
  protected readonly label = humanizeEnum;

  protected readonly detail = signal<AgreementDetailResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly working = signal(false);
  protected readonly tab = signal('overview');

  protected readonly canManage = computed(() =>
    this.permissions.has(VextoPermissions.Agreements.Manage),
  );

  protected readonly tabs = computed<readonly VxTab[]>(() => [
    { id: 'overview', label: 'Overview' },
    { id: 'documents', label: 'Documents', count: this.detail()?.documents.length ?? null },
  ]);

  protected readonly breadcrumbs = computed(() => [
    { label: 'Agreements', link: '/agreements' },
    { label: this.detail()?.agreement.agreementNumber ?? 'Agreement' },
  ]);

  /** The same rule as the card, so a contract does not warn on one screen and not the other. */
  protected readonly note = computed<{ level: 'info' | 'warning'; label: string } | null>(() => {
    const agreement = this.detail()?.agreement;

    if (!agreement) {
      return null;
    }

    if (agreement.status === 'PendingSignature') {
      return { level: 'info', label: 'Waiting for signature before it takes effect.' };
    }

    if (agreement.status !== 'Active' || !agreement.endDate) {
      return null;
    }

    const days = daysUntil(agreement.endDate);

    if (days < 0 || days > EXPIRY_WARNING_DAYS) {
      return null;
    }

    return {
      level: 'warning',
      label:
        days === 0
          ? 'Expires today.'
          : `Expires in ${days} ${days === 1 ? 'day' : 'days'}${agreement.autoRenew ? ' — renews automatically.' : '.'}`,
    };
  });

  constructor() {
    effect(() => {
      this.agreementId();
      this.load();
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.get(this.agreementId()).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not load this agreement.',
        );
      },
    });
  }

  /**
   * Puts the agreement into effect.
   *
   * The signed date defaults to today: activating a contract is somebody recording that it has been
   * signed, and asking them to type the date they are doing it on is friction with no upside. A
   * back-dated signature is an edit, not an activation.
   */
  protected activate(): void {
    if (this.working()) {
      return;
    }

    this.working.set(true);

    this.api.activate(this.agreementId(), serviceDate()).subscribe({
      next: () => this.done('Agreement activated.'),
      error: (error: unknown) => this.fail(error, 'We could not activate this agreement.'),
    });
  }

  protected async terminate(): Promise<void> {
    const number = this.detail()?.agreement.agreementNumber ?? 'This agreement';

    const confirmed = await this.confirm.ask({
      title: 'Terminate this agreement?',
      message: `${number} will stop being in force. This cannot be undone.`,
      confirmLabel: 'Terminate',
      danger: true,
    });

    if (!confirmed || this.working()) {
      return;
    }

    this.working.set(true);

    this.api.terminate(this.agreementId(), null).subscribe({
      next: () => this.done('Agreement terminated.'),
      error: (error: unknown) => this.fail(error, 'We could not terminate this agreement.'),
    });
  }

  private done(message: string): void {
    this.working.set(false);
    this.toast.success(message);
    this.load();
  }

  private fail(error: unknown, fallback: string): void {
    this.working.set(false);
    this.toast.error(error instanceof VextoApiError ? error.message : fallback);
  }
}
