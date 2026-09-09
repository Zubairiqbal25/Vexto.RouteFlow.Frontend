import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { AgreementResponse } from '@vexto/models';
import {
  VxAttentionNote,
  type VxCardAction,
  VxCardFact,
  VxEntityCard,
  VxIcon,
  VxStatusBadge,
} from '@vexto/ui';
import { daysUntil, formatDate, humanizeEnum } from '@vexto/utilities';

const EXPIRY_WARNING_DAYS = 30;

/**
 * One contract, as the person responsible for it reads it.
 *
 * Legal and financial metadata is kept **calm** deliberately: an agreement is not an incident, and a
 * grid of contracts that all shout at you is a grid nobody reads. The only thing that raises its
 * voice is an agreement about to lapse or one already terminated, because those are the two states
 * somebody has to act on.
 *
 * The agreement number leads because that is what appears on the paperwork; the title is the
 * subtitle, since two contracts with the same counterparty often share it.
 */
@Component({
  selector: 'vexto-agreement-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxAttentionNote, VxCardFact, VxEntityCard, VxIcon, VxStatusBadge],
  template: `
    <vx-entity-card
      [title]="agreement().agreementNumber"
      [subtitle]="agreement().title"
      [actions]="actions()"
      [muted]="isClosed()"
      (opened)="opened.emit()"
      (action)="action.emit($event)"
    >
      <span
        media
        class="flex size-12 flex-none items-center justify-center rounded-xl"
        style="background: var(--vexto-surface-sunken); color: var(--vexto-text-secondary)"
        aria-hidden="true"
      >
        <vx-icon name="agreements" [size]="24" />
      </span>

      <vx-status-badge status [status]="agreement().status" />

      <div class="mt-4 grid grid-cols-2 gap-3">
        <vx-card-fact label="Type" [value]="label(agreement().type)" />
        <vx-card-fact label="Renewal" [value]="agreement().autoRenew ? 'Automatic' : 'Manual'" />
        <vx-card-fact label="Starts" [value]="date(agreement().startDate)" />
        <vx-card-fact
          label="Ends"
          [value]="agreement().endDate ? date(agreement().endDate!) : 'Open-ended'"
        />
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-meta text-ink-muted">
        <span class="flex items-center gap-1.5">
          <vx-icon [name]="agreement().signedDate ? 'check-circle' : 'info'" [size]="14" />
          {{
            agreement().signedDate
              ? 'Signed ' + date(agreement().signedDate!)
              : 'No signature recorded'
          }}
        </span>

        <!--
          The paperclip appears only when the endpoint actually counted the files. A null means "not
          counted here", not "none" — and a card that said "0 documents" because a list endpoint had
          not looked would read as a signed contract having gone missing.
        -->
        @if (documentCount(); as count) {
          <span class="flex items-center gap-1.5">
            <vx-icon name="agreements" [size]="14" />
            {{ count }} {{ count === 1 ? 'document' : 'documents' }}
          </span>
        }
      </div>

      @if (note(); as warning) {
        <vx-attention-note class="mt-3" [level]="warning.level">{{ warning.label }}</vx-attention-note>
      }
    </vx-entity-card>
  `,
})
export class AgreementCard {
  readonly agreement = input.required<AgreementResponse>();
  /** Whether the viewer may activate or terminate. Reading is a separate, wider permission. */
  readonly canManage = input(false);

  readonly opened = output<void>();
  readonly action = output<string>();

  protected readonly date = formatDate;
  protected readonly label = humanizeEnum;

  /** Null when the endpoint did not count, and null when it counted zero — both mean "no paperclip". */
  protected readonly documentCount = computed(() => this.agreement().documentCount || null);

  protected readonly isClosed = computed(() =>
    ['Terminated', 'Expired', 'Cancelled'].includes(this.agreement().status),
  );

  /** An agreement running out is the one thing on this screen with a deadline. */
  protected readonly note = computed<{ level: 'info' | 'warning'; label: string } | null>(() => {
    const agreement = this.agreement();

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

  protected readonly actions = computed<readonly VxCardAction[]>(() => {
    const actions: VxCardAction[] = [{ id: 'open', label: 'Open agreement', icon: 'eye' }];

    if (!this.canManage()) {
      return actions;
    }

    actions.push({ id: 'edit', label: 'Edit details', icon: 'edit' });

    const status = this.agreement().status;

    if (status === 'Draft' || status === 'PendingSignature') {
      actions.push({ id: 'activate', label: 'Activate agreement', icon: 'check' });
    }

    if (status === 'Active') {
      actions.push({ id: 'terminate', label: 'Terminate agreement', icon: 'ban', danger: true });
    }

    return actions;
  });
}
