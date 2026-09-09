import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { VxAvatar, VxCardFact, VxDrawer, VxIcon } from '@vexto/ui';

/**
 * Who is driving, and which bus.
 *
 * **Deliberately two facts and no more.** A passenger tapping the driver's name wants to recognise
 * the person and the vehicle pulling up at their stop; they have no business with that driver's
 * mobile number, email, licence number, home depot or employment history. Every one of those is
 * personal data about somebody who did not consent to it being shown to the people they drive, and
 * a "contact driver" button would turn a bus route into a channel for harassment.
 *
 * It costs no request: both values come from the trip the home screen already loaded.
 */
@Component({
  selector: 'vexto-crew-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxAvatar, VxCardFact, VxDrawer, VxIcon],
  template: `
    <vx-drawer
      [open]="open()"
      title="Your bus today"
      subtitle="Who is driving, and what to look for."
      (closed)="closed.emit()"
    >
      <div class="flex flex-col gap-6">
        <div class="flex items-center gap-4">
          <vx-avatar size="xl" [name]="driverName() ?? 'Driver'" />
          <div class="min-w-0">
            <p class="vx-section-label">Driver</p>
            <p class="mt-0.5 truncate text-lg font-semibold text-ink">
              {{ driverName() ?? 'Not assigned yet' }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <span
            class="flex size-16 flex-none items-center justify-center rounded-2xl"
            style="background: var(--vexto-info-soft); color: var(--vexto-info-text)"
            aria-hidden="true"
          >
            <vx-icon name="vehicle" [size]="30" />
          </span>
          <div class="min-w-0">
            <p class="vx-section-label">Vehicle</p>
            <p class="mt-0.5 truncate text-lg font-semibold text-ink">
              {{ plateNumber() ?? 'Not assigned yet' }}
            </p>
          </div>
        </div>

        <dl class="grid grid-cols-2 gap-4">
          <vx-card-fact label="Route" [value]="routeName()" />
          <vx-card-fact label="Your stop" [value]="stopName() ?? 'Your usual stop'" />
        </dl>

        <p class="text-meta text-ink-muted">
          If your bus does not arrive, contact your operator rather than the driver.
        </p>
      </div>

      <div footer>
        <button type="button" class="vx-btn vx-btn-secondary vx-btn-touch w-full" (click)="closed.emit()">
          Close
        </button>
      </div>
    </vx-drawer>
  `,
})
export class CrewSheet {
  readonly open = input(false);
  readonly driverName = input<string | null>(null);
  readonly plateNumber = input<string | null>(null);
  readonly routeName = input<string>('');
  readonly stopName = input<string | null>(null);

  readonly closed = output<void>();
}
