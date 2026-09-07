import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PassengerBillingApi, PassengersApi, RoutesApi, VextoApiError } from '@vexto/api-client';
import type {
  PassengerSubscription,
  PassengerSubscriptionStatus,
  PickerOption,
} from '@vexto/models';
import { PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxEmptyState,
  VxErrorState,
  VxFilterBar,
  VxModal,
  VxPageHeader,
  VxRowAction,
  VxRowActions,
  VxSkeletonTable,
  VxStatusBadge,
  VxTableShell,
} from '@vexto/ui';
import { formatMoney } from '@vexto/utilities';
import { PagedList } from '../../shared/paged-list';

interface SubscriptionFilters extends Record<string, unknown> {
  search: string;
  status: string;
}

/**
 * What each passenger pays this operator, and on what basis.
 *
 * A subscription is created as a draft and bills nothing until it is activated, so a mistake here
 * costs a correction rather than an invoice somebody has to be talked out of.
 */
@Component({
  selector: 'vexto-passenger-subscriptions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    VxEmptyState,
    VxErrorState,
    VxFilterBar,
    VxModal,
    VxPageHeader,
    VxRowAction,
    VxRowActions,
    VxSkeletonTable,
    VxStatusBadge,
    VxTableShell,
  ],
  template: `
    <vx-page-header
      title="Passenger subscriptions"
      description="Ongoing transport arrangements and what each one is billed."
    >
      @if (canManage()) {
        <button actions type="button" class="vx-btn vx-btn-primary" (click)="openCreate()">
          New subscription
        </button>
      }
    </vx-page-header>

    <vx-table-shell
      [loading]="list.loading()"
      [error]="list.error()"
      [isEmpty]="list.isEmpty()"
      [page]="list.page()"
      [pageSize]="list.pageSize"
      [totalCount]="list.total()"
      (pageChange)="list.setPage($event)"
    >
      <vx-filter-bar
        toolbar
        searchPlaceholder="Search description"
        searchLabel="Search subscriptions"
        (searchChange)="list.setFilter({ search: $event })"
      >
        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by status"
          (change)="list.setFilter({ status: value($event) })"
        >
          <option value="">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Active">Active</option>
          <option value="Paused">Paused</option>
          <option value="Cancelled">Cancelled</option>
          <option value="Expired">Expired</option>
        </select>

        <span trailing class="text-meta text-ink-muted">
          {{ list.total() }} {{ list.total() === 1 ? 'subscription' : 'subscriptions' }}
        </span>
      </vx-filter-bar>

      <vx-skeleton-table loading [columns]="6" />

      <vx-error-state
        error
        title="We could not load subscriptions"
        [message]="list.error() ?? ''"
        (retry)="list.reload()"
      />

      <vx-empty-state
        empty
        icon="passengers"
        title="No subscriptions yet"
        description="Create one to start billing a passenger for their transport."
      />

      <table class="vx-table">
        <thead>
          <tr>
            <th scope="col">Passenger</th>
            <th scope="col">Description</th>
            <th scope="col">Route</th>
            <th scope="col" class="text-right">Amount</th>
            <th scope="col">Cycle</th>
            <th scope="col">Status</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (subscription of list.items(); track subscription.id) {
            <tr>
              <td><span class="vx-cell-strong block">{{ subscription.passengerName }}</span></td>
              <td>{{ subscription.description }}</td>
              <td class="text-meta text-ink-muted">{{ subscription.routeName ?? 'Any route' }}</td>
              <td class="text-right">
                <span class="vx-cell-strong">
                  {{ money(subscription.amount, subscription.currency) }}
                </span>

                @if (subscription.taxRate > 0) {
                  <span class="block text-meta text-ink-muted">
                    plus {{ subscription.taxRate }}% tax
                  </span>
                }
              </td>
              <td>{{ subscription.billingCycle }}</td>
              <td><vx-status-badge [status]="subscription.status" /></td>
              <td class="text-right">
                @if (canManage()) {
                  <vx-row-actions [label]="'Actions for ' + subscription.passengerName">
                    @if (subscription.status === 'Draft' || subscription.status === 'Paused') {
                      <vx-row-action icon="check-circle" (selected)="activate(subscription)">
                        Activate
                      </vx-row-action>
                    }

                    @if (subscription.status === 'Active') {
                      <vx-row-action icon="alert" (selected)="pause(subscription)">
                        Pause
                      </vx-row-action>

                      <vx-row-action icon="agreements" (selected)="openInvoice(subscription)">
                        Generate invoice
                      </vx-row-action>
                    }

                    @if (subscription.status !== 'Cancelled' && subscription.status !== 'Expired') {
                      <vx-row-action [danger]="true" icon="close" (selected)="cancel(subscription)">
                        Cancel
                      </vx-row-action>
                    }
                  </vx-row-actions>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </vx-table-shell>

    @if (creating()) {
      <vx-modal title="New passenger subscription" [open]="true" (closed)="creating.set(false)">
        <form (submit)="create($event)">
          <label class="block">
            <span class="vx-section-label">Passenger</span>
            <select
              id="sub-passenger"
              class="vx-select mt-1 w-full"
              [value]="passengerId()"
              (change)="passengerId.set(value($event))"
            >
              <option value="">Choose a passenger</option>
              @for (option of passengers(); track option.id) {
                <option [value]="option.id">{{ option.label }}</option>
              }
            </select>
          </label>

          <label class="mt-4 block">
            <span class="vx-section-label">Route</span>
            <select
              id="sub-route"
              class="vx-select mt-1 w-full"
              [value]="routeId()"
              (change)="routeId.set(value($event))"
            >
              <option value="">Any route</option>
              @for (option of routes(); track option.id) {
                <option [value]="option.id">{{ option.label }}</option>
              }
            </select>
            <span class="mt-1.5 block text-meta text-ink-muted">
              Leave as "any route" for one fee covering all their travel. Choose a route to price
              that route separately — a passenger can have one of each.
            </span>
          </label>

          <label class="mt-4 block">
            <span class="vx-section-label">Description</span>
            <input
              id="sub-description"
              class="vx-input mt-1 w-full"
              type="text"
              maxlength="200"
              placeholder="Monthly transport"
              [value]="description()"
              (input)="description.set(value($event))"
            />
          </label>

          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="vx-section-label">Amount</span>
              <input
                id="sub-amount"
                class="vx-input mt-1 w-full"
                type="number"
                step="0.01"
                min="0.01"
                [value]="amount()"
                (input)="amount.set(value($event))"
              />
              <span class="mt-1.5 block text-meta text-ink-muted">
                In your operator currency.
              </span>
            </label>

            <label class="block">
              <span class="vx-section-label">Tax rate</span>
              <input
                id="sub-tax"
                class="vx-input mt-1 w-full"
                type="number"
                step="0.01"
                min="0"
                max="100"
                [value]="taxRate()"
                (input)="taxRate.set(value($event))"
              />
              <span class="mt-1.5 block text-meta text-ink-muted">
                A percentage. Leave at 0 if this service is not taxed.
              </span>
            </label>
          </div>

          <label class="mt-4 block">
            <span class="vx-section-label">Starts</span>
            <input
              id="sub-start"
              class="vx-input mt-1 w-full"
              type="date"
              [value]="startDate()"
              (input)="startDate.set(value($event))"
            />
          </label>

          <div class="mt-6 flex justify-end gap-3">
            <button type="button" class="vx-btn vx-btn-secondary" (click)="creating.set(false)">
              Cancel
            </button>
            <button type="submit" class="vx-btn vx-btn-primary" [disabled]="busy()" (click)="create($event)">
              {{ busy() ? 'Creating…' : 'Create subscription' }}
            </button>
          </div>
        </form>
      </vx-modal>
    }

    @if (invoicing(); as subscription) {
      <vx-modal title="Generate invoice" [open]="true" (closed)="invoicing.set(null)">
        <p class="text-body text-ink-secondary">
          For {{ subscription.passengerName }}, {{ money(subscription.amount, subscription.currency) }}
          per period.
        </p>

        <!--
          The period is named rather than derived. A monthly subscription does not say whether the
          operator bills calendar months or months from a join date, and guessing would be quietly
          wrong for somebody every single month.
        -->
        <form class="mt-5" (submit)="generate($event)">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="vx-section-label">Period start</span>
              <input
                id="inv-from"
                class="vx-input mt-1 w-full"
                type="date"
                [value]="periodStart()"
                (input)="periodStart.set(value($event))"
              />
            </label>
            <label class="block">
              <span class="vx-section-label">Period end</span>
              <input
                id="inv-to"
                class="vx-input mt-1 w-full"
                type="date"
                [value]="periodEnd()"
                (input)="periodEnd.set(value($event))"
              />
            </label>
          </div>

          <label class="mt-4 block">
            <span class="vx-section-label">Due</span>
            <input
              id="inv-due"
              class="vx-input mt-1 w-full"
              type="date"
              [value]="dueDate()"
              (input)="dueDate.set(value($event))"
            />
          </label>

          <p class="mt-3 text-meta text-ink-muted">
            Safe to repeat: asking again for the same period returns the invoice that already
            exists rather than billing twice.
          </p>

          <div class="mt-6 flex justify-end gap-3">
            <button type="button" class="vx-btn vx-btn-secondary" (click)="invoicing.set(null)">
              Cancel
            </button>
            <button type="submit" class="vx-btn vx-btn-primary" [disabled]="busy()" (click)="generate($event)">
              {{ busy() ? 'Generating…' : 'Generate invoice' }}
            </button>
          </div>
        </form>
      </vx-modal>
    }
  `,
})
export class PassengerSubscriptionsPage {
  private readonly api = inject(PassengerBillingApi);
  private readonly passengersApi = inject(PassengersApi);
  private readonly routesApi = inject(RoutesApi);
  private readonly permissions = inject(PermissionService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly money = formatMoney;

  protected readonly creating = signal(false);
  protected readonly invoicing = signal<PassengerSubscription | null>(null);
  protected readonly busy = signal(false);
  protected readonly passengers = signal<PickerOption[]>([]);
  protected readonly routes = signal<PickerOption[]>([]);

  protected readonly passengerId = signal('');
  protected readonly routeId = signal('');
  protected readonly description = signal('Monthly transport');
  protected readonly amount = signal('');
  protected readonly taxRate = signal('0');
  protected readonly startDate = signal(today());

  protected readonly periodStart = signal(firstOfThisMonth());
  protected readonly periodEnd = signal(lastOfThisMonth());
  protected readonly dueDate = signal(today());

  protected readonly canManage = computed(() =>
    this.permissions.has(VextoPermissions.Billing.Manage));

  protected readonly list = new PagedList<PassengerSubscription, SubscriptionFilters>(
    (filters, page, pageSize) =>
      this.api.subscriptions({
        search: filters.search || undefined,
        status: (filters.status || undefined) as PassengerSubscriptionStatus,
        pageNumber: page,
        pageSize,
      }),
    { search: '', status: '' },
  );

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected openCreate(): void {
    this.creating.set(true);

    // A picker rather than the full passenger list: three fields per row, capped at 50, which is
    // what pickers exist for.
    this.passengersApi.picker().subscribe({
      next: (options) => this.passengers.set(options),
      error: () => this.passengers.set([]),
    });

    this.routesApi.picker().subscribe({
      next: (options) => this.routes.set(options),
      error: () => this.routes.set([]),
    });
  }

  protected create(event: Event): void {
    event.preventDefault();

    if (this.busy()) {
      return;
    }

    const amount = Number.parseFloat(this.amount());

    if (!this.passengerId() || !Number.isFinite(amount) || amount <= 0) {
      this.toast.error('Choose a passenger and enter an amount greater than zero.');

      return;
    }

    this.busy.set(true);

    this.api
      .createSubscription({
        passengerId: this.passengerId(),
        routeId: this.routeId() || null,
        description: this.description(),
        amount,

        // Null, so the server uses the operator's own default. The currency is deliberately not a
        // field on this form: an operator invoicing in two currencies is an exception, and the
        // dropdown would be wrong far more often than it was useful.
        currency: null,
        taxRate: Number.parseFloat(this.taxRate()) || 0,
        billingCycle: 'Monthly',
        startDate: this.startDate(),
        endDate: null,
        autoRenew: true,
        billingDay: null,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.creating.set(false);
          this.toast.success('Subscription created as a draft. Activate it to start billing.');
          this.list.reload();
        },
        error: (error: unknown) => this.fail(error, 'We could not create that subscription.'),
      });
  }

  protected activate(subscription: PassengerSubscription): void {
    this.api.activateSubscription(subscription.id).subscribe({
      next: () => {
        this.toast.success('Subscription activated.');
        this.list.reload();
      },
      error: (error: unknown) => this.fail(error, 'We could not activate that subscription.'),
    });
  }

  protected pause(subscription: PassengerSubscription): void {
    this.api.pauseSubscription(subscription.id).subscribe({
      next: () => {
        this.toast.success('Subscription paused.');
        this.list.reload();
      },
      error: (error: unknown) => this.fail(error, 'We could not pause that subscription.'),
    });
  }

  protected async cancel(subscription: PassengerSubscription): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Cancel ${subscription.passengerName}'s subscription?`,
      message:
        'They will not be billed again. Invoices already raised are untouched — cancelling an ' +
        'arrangement does not forgive money already owed.',
      confirmLabel: 'Cancel subscription',
      cancelLabel: 'Keep it',
    });

    if (!confirmed) {
      return;
    }

    this.api.cancelSubscription(subscription.id).subscribe({
      next: () => {
        this.toast.success('Subscription cancelled.');
        this.list.reload();
      },
      error: (error: unknown) => this.fail(error, 'We could not cancel that subscription.'),
    });
  }

  protected openInvoice(subscription: PassengerSubscription): void {
    this.invoicing.set(subscription);
  }

  protected generate(event: Event): void {
    event.preventDefault();

    const subscription = this.invoicing();

    if (!subscription || this.busy()) {
      return;
    }

    this.busy.set(true);

    this.api
      .generateInvoice(subscription.id, {
        periodStart: this.periodStart(),
        periodEnd: this.periodEnd(),
        dueDate: this.dueDate(),
      })
      .subscribe({
        next: (invoice) => {
          this.busy.set(false);
          this.invoicing.set(null);
          this.toast.success(`Invoice ${invoice.invoiceNumber} raised.`);
        },
        error: (error: unknown) => this.fail(error, 'We could not raise that invoice.'),
      });
  }

  private fail(error: unknown, fallback: string): void {
    this.busy.set(false);

    this.toast.error(error instanceof VextoApiError ? error.message : fallback);
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfThisMonth(): string {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA');
}

function lastOfThisMonth(): string {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-CA');
}
