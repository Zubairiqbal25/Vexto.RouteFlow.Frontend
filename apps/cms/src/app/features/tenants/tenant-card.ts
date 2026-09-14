import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { PlatformApi } from '@vexto/api-client';
import type { TenantHealthIndicator, TenantResponse } from '@vexto/models';
import {
  VxAttentionNote,
  VxAvatar,
  type VxCardAction,
  VxCardFact,
  VxEntityCard,
  VxIcon,
  VxStatusBadge,
} from '@vexto/ui';
import { formatDate } from '@vexto/utilities';
import { administratorSummary } from './tenant-readiness';

/**
 * A transport operator, as Vexto's own staff read them in the CMS.
 *
 * **The business identity leads, not the record.** Logo, trading name, legal name, where they
 * operate, whether they are live, who to call, and whether anybody has accepted an administrator
 * invitation. The trade licence number is on the detail screen: it matters when you are verifying
 * an operator and never when you are looking for one. There is no tenant id anywhere on the card.
 */
@Component({
  selector: 'vexto-cms-tenant-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxAttentionNote, VxAvatar, VxCardFact, VxEntityCard, VxIcon, VxStatusBadge],
  template: `
    <vx-entity-card
      [title]="tenant().name"
      [subtitle]="tenant().legalName"
      [actions]="actions()"
      (opened)="opened.emit()"
      (action)="action.emit($event)"
    >
      <!-- The logo, or the operator's initials until one is uploaded. -->
      <vx-avatar
        media
        size="lg"
        [name]="tenant().name"
        [photoPath]="logoPath()"
        [hasPhoto]="tenant().hasLogo"
      />

      <vx-status-badge status [status]="tenant().status" />

      <div class="mt-4 grid grid-cols-2 gap-3">
        <vx-card-fact label="Emirate" [value]="emirate()" />
        <vx-card-fact label="Primary contact" [value]="contact()" />
        <vx-card-fact label="Admin" [value]="admin().label" />
        <vx-card-fact label="Created" [value]="created()" />
      </div>

      <p class="mt-3 flex items-center gap-1.5 text-meta text-ink-muted">
        <vx-icon name="mail" [size]="14" />
        <span class="truncate">{{ tenant().email }}</span>
      </p>

      @for (indicator of health(); track indicator.code) {
        <vx-attention-note class="mt-2" [level]="level(indicator)">
          {{ indicator.message }}
        </vx-attention-note>
      }

      <div footer class="flex items-center justify-between gap-2 border-t border-line-subtle px-4 py-3 sm:px-5">
        <span class="text-meta text-ink-muted">
          {{ tenant().members?.active ?? 0 }} active · {{ tenant().members?.invited ?? 0 }} invited
        </span>
        <button type="button" class="vx-btn vx-btn-secondary vx-btn-sm" (click)="$event.stopPropagation(); opened.emit()">
          Open Tenant
        </button>
      </div>
    </vx-entity-card>
  `,
})
export class CmsTenantCard {
  private readonly platform = inject(PlatformApi);

  readonly tenant = input.required<TenantResponse>();
  readonly opened = output<void>();
  readonly action = output<string>();

  protected readonly health = computed(() => this.tenant().health ?? []);
  protected readonly logoPath = computed(() => this.platform.logoPath(this.tenant().id));
  protected readonly admin = computed(() => administratorSummary(this.tenant()));
  protected readonly created = computed(() => formatDate(this.tenant().createdAtUtc));

  protected readonly emirate = computed(() => {
    const details = this.tenant().businessDetails;

    return [details.city, details.emirate].filter(Boolean).join(', ') || 'Not recorded';
  });

  protected readonly contact = computed(
    () => this.tenant().businessDetails.primaryContactName || 'Not recorded',
  );

  protected level(indicator: TenantHealthIndicator): 'critical' | 'warning' | 'info' {
    return indicator.severity === 'Critical' ? 'critical' : indicator.severity === 'Warning' ? 'warning' : 'info';
  }

  protected readonly actions = computed<VxCardAction[]>(() => [
    { id: 'open', label: 'Open tenant', icon: 'eye' },
    { id: 'edit', label: 'Edit details', icon: 'edit' },
    { id: 'invite', label: 'Invite administrator', icon: 'send' },
    { id: 'switch', label: 'Open in Operator Portal', icon: 'switch' },
    this.tenant().status === 'Active'
      ? { id: 'suspend', label: 'Suspend tenant', icon: 'ban', danger: true }
      : { id: 'activate', label: 'Activate tenant', icon: 'check' },
  ]);
}
