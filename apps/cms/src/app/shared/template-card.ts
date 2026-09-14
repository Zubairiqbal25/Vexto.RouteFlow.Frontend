import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { type VxCardAction, VxCardFact, VxEntityCard, VxIcon, VxStatusBadge } from '@vexto/ui';
import { formatRelative } from '@vexto/utilities';

/** The fields a card needs, shared by email and report templates. */
export interface TemplateCardItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly category: string;
  readonly status: string;
  readonly isSystem: boolean;
  readonly currentVersion: number;
  readonly hasUnpublishedChanges: boolean;
  readonly updatedAtUtc?: string | null;
  readonly createdAtUtc: string;
  readonly publishedAtUtc?: string | null;
}

/**
 * One template in the list.
 *
 * **The name leads, the code follows in monospace.** The name is what a person scans a grid of
 * forty cards for; the code is what application code sends by, and it is always visible. A system
 * note says "this one is a contract": its code cannot change and it cannot be archived. An amber "unpublished edits" note is the one thing a
 * card must never hide — it is the difference between what the editor shows and what a passenger
 * receives.
 */
@Component({
  selector: 'vexto-template-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxCardFact, VxEntityCard, VxIcon, VxStatusBadge],
  template: `
    <vx-entity-card
      [title]="item().name"
      [subtitle]="item().code"
      [actions]="actions()"
      (opened)="opened.emit()"
      (action)="action.emit($event)"
    >
      <span
        media
        class="flex size-12 flex-none items-center justify-center rounded-xl"
        style="background: var(--vexto-primary-soft); color: var(--vexto-primary-active)"
        aria-hidden="true"
      >
        <vx-icon [name]="icon()" [size]="22" />
      </span>

      <vx-status-badge status [status]="item().status" />

      <div class="mt-4 grid grid-cols-2 gap-3">
        <vx-card-fact label="Category" [value]="item().category" />
        <vx-card-fact label="Version" [value]="item().currentVersion > 0 ? 'v' + item().currentVersion : 'Not published'" />
      </div>

      @if (item().isSystem) {
        <p class="mt-3 flex items-center gap-1.5 text-meta text-ink-muted" title="Required by application code: the code cannot change and the template cannot be archived.">
          <vx-icon name="shield" [size]="14" />
          System template
        </p>
      }

      <p class="mt-3 text-meta text-ink-muted">Updated {{ updated() }}</p>

      @if (item().hasUnpublishedChanges && item().currentVersion > 0) {
        <p class="mt-2 flex items-center gap-1.5 text-meta" style="color: var(--vexto-warning-text)">
          <vx-icon name="alert" [size]="14" />
          Unpublished edits
        </p>
      }
    </vx-entity-card>
  `,
})
export class TemplateCard {
  readonly item = input.required<TemplateCardItem>();
  readonly icon = input<'mail' | 'agreements'>('mail');
  /** Whether "Send test" is offered — email templates only. */
  readonly canSendTest = input(true);
  readonly opened = output<void>();
  readonly action = output<string>();

  protected readonly updated = computed(() => formatRelative(this.item().updatedAtUtc ?? this.item().createdAtUtc));

  protected readonly actions = computed<VxCardAction[]>(() => {
    const item = this.item();
    const actions: VxCardAction[] = [
      { id: 'edit', label: 'Edit', icon: 'edit' },
      { id: 'preview', label: 'Preview', icon: 'eye' },
    ];

    if (this.canSendTest()) {
      actions.push({ id: 'send-test', label: 'Send test email', icon: 'send' });
    }

    actions.push({ id: 'history', label: 'Version history', icon: 'history' });

    if (item.status === 'Active') {
      actions.push({ id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true });
    } else if (item.status === 'Inactive') {
      actions.push({ id: 'activate', label: 'Activate', icon: 'check' });
    }

    return actions;
  });
}
