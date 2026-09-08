import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { TenantResponse } from '@vexto/models';
import {
  type VxCardAction,
  VxCardFact,
  VxEntityCard,
  VxIcon,
  VxStatusBadge,
} from '@vexto/ui';

/**
 * A transport operator, as Vexto's own staff read them.
 *
 * **The business identity leads, not the record.** Trading name, where they operate, and whether
 * they are live — that is what a platform administrator scans a list of forty operators for. The
 * trade licence and the tax number are on the detail screen, because they matter when you are
 * verifying an operator and never when you are looking for one.
 *
 * There is deliberately no tenant id anywhere on the card. It is a database key, it means nothing
 * to a human, and showing it teaches people to identify operators by GUID.
 */
@Component({
  selector: 'vexto-tenant-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxCardFact, VxEntityCard, VxIcon, VxStatusBadge],
  template: `
    <vx-entity-card
      [title]="tenant().name"
      [subtitle]="tenant().legalName"
      [actions]="actions()"
      [selected]="selected()"
      (opened)="opened.emit()"
      (action)="action.emit($event)"
    >
      <!-- A monogram until tenant logos are uploadable. A grey building icon on forty cards is
           forty identical cards; two letters at least tell them apart. -->
      <span
        media
        class="flex size-12 flex-none items-center justify-center rounded-xl text-base font-semibold"
        style="background: var(--vexto-primary-soft); color: var(--vexto-primary-active)"
        aria-hidden="true"
      >
        {{ monogram() }}
      </span>

      <vx-status-badge status [status]="tenant().status" />

      <div class="mt-4 grid grid-cols-2 gap-3">
        <vx-card-fact label="Location" [value]="location()" />
        <vx-card-fact label="Primary contact" [value]="contact()" />
      </div>

      <p class="mt-3 flex items-center gap-1.5 text-meta text-ink-muted">
        <vx-icon name="mail" [size]="14" />
        <span class="truncate">{{ tenant().email }}</span>
      </p>
    </vx-entity-card>
  `,
})
export class TenantCard {
  readonly tenant = input.required<TenantResponse>();
  readonly selected = input(false);
  readonly opened = output<void>();
  readonly action = output<string>();

  protected readonly monogram = computed(() =>
    this.tenant()
      .name.split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase(),
  );

  protected readonly location = computed(() => {
    const details = this.tenant().businessDetails;

    return (
      [details.city, details.emirate, details.country].filter(Boolean).join(', ') || 'Not recorded'
    );
  });

  protected readonly contact = computed(
    () => this.tenant().businessDetails.primaryContactName || 'Not recorded',
  );

  protected readonly actions = computed<VxCardAction[]>(() => [
    { id: 'enter', label: 'Enter tenant context', icon: 'switch' },
    { id: 'view', label: 'Tenant details', icon: 'eye' },
    this.tenant().status === 'Active'
      ? { id: 'suspend', label: 'Suspend operator', icon: 'ban', danger: true }
      : { id: 'activate', label: 'Activate operator', icon: 'check' },
  ]);
}
