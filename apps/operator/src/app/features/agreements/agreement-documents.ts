import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { AgreementsApi, FileDownloader, VextoApiError } from '@vexto/api-client';
import type { AgreementDocument, AgreementDocumentType } from '@vexto/models';
import {
  ConfirmService,
  ToastService,
  VxEmptyState,
  VxIcon,
  VxSkeleton,
  type VxIconName,
} from '@vexto/ui';
import { formatDate, humanizeEnum } from '@vexto/utilities';

/** What the API accepts. Kept beside the picker so the two cannot drift. */
const TYPES: readonly { readonly id: AgreementDocumentType; readonly label: string }[] = [
  { id: 'Contract', label: 'Contract' },
  { id: 'TradeLicense', label: 'Trade licence' },
  { id: 'NoObjectionCertificate', label: 'NOC' },
  { id: 'Other', label: 'Other' },
];

/** What the endpoint accepts, stated on screen rather than discovered from a refusal. */
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * The files attached to one agreement.
 *
 * **The drop zone is a `<label>` wrapping a file input**, not a JavaScript re-implementation of one.
 * That is what makes it work with the keyboard, with a screen reader and with the operating
 * system's own file dialog for free; the drag-and-drop handlers on top are three lines and add
 * nothing anybody depends on. A drag-and-drop library for this would be a dependency bought to
 * avoid writing `dragover`.
 *
 * **Downloads go through `FileDownloader`.** The serving endpoint re-checks the tenant on every
 * request, so it needs the bearer token a plain `<a href>` will not send — and the storage path is
 * never exposed to the browser at all.
 *
 * The limits are stated before the upload rather than after: the server rejects a 30 MB file and an
 * executable renamed to `.pdf`, and being told that having waited for the upload is worse than
 * being told before starting it.
 */
@Component({
  selector: 'vexto-agreement-documents',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxEmptyState, VxIcon, VxSkeleton],
  template: `
    @if (loading()) {
      <div class="flex flex-col gap-3">
        @for (row of [0, 1]; track row) {
          <vx-skeleton height="3.5rem" />
        }
      </div>
    } @else {
      @if (documents().length === 0) {
        <vx-empty-state
          icon="agreements"
          title="No documents attached"
          description="Upload the signed contract, the trade licence or any supporting paperwork so it stays with the agreement."
        />
      } @else {
        <ul class="divide-y divide-line-subtle">
          @for (document of documents(); track document.id) {
            <li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span
                class="flex size-10 flex-none items-center justify-center rounded-lg"
                style="background: var(--vexto-surface-sunken); color: var(--vexto-text-secondary)"
                aria-hidden="true"
              >
                <vx-icon [name]="iconFor(document)" [size]="20" />
              </span>

              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-ink">{{ document.fileName }}</p>
                <p class="mt-0.5 truncate text-meta text-ink-muted">
                  {{ label(document.type) }} · {{ size(document.fileSize) }} ·
                  {{ date(document.uploadedAtUtc) }}
                </p>
              </div>

              <div class="flex flex-none items-center gap-2">
                <button
                  type="button"
                  class="vx-btn vx-btn-secondary vx-btn-sm"
                  [disabled]="busyId() === document.id"
                  (click)="download(document)"
                >
                  <vx-icon name="arrow-left" [size]="15" class="rotate-[270deg]" />
                  Download
                </button>
                @if (canManage()) {
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost vx-btn-sm"
                    [disabled]="busyId() === document.id"
                    (click)="remove(document)"
                  >
                    <vx-icon name="trash" [size]="15" />
                    Delete
                  </button>
                }
              </div>
            </li>
          }
        </ul>
      }

      @if (canManage()) {
        <div class="mt-5">
          @if (failure(); as message) {
            <p
              class="mb-3 rounded-lg px-3.5 py-3 text-body"
              style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)"
              role="alert"
            >
              {{ message }}
            </p>
          }

          <div class="mb-3 flex flex-wrap items-center gap-2">
            <label class="vx-section-label" for="doc-type">Document type</label>
            <select
              id="doc-type"
              class="vx-select w-auto"
              [value]="type()"
              (change)="onTypeChange($event)"
            >
              @for (option of types; track option.id) {
                <option [value]="option.id">{{ option.label }}</option>
              }
            </select>
          </div>

          <!--
            A label around a real file input: keyboard, screen reader and the OS file dialog all
            work without a line of script. The drag handlers are an addition, never the mechanism.
          -->
          <label
            class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed
                   px-4 py-8 text-center transition-colors"
            [style.border-color]="dragging() ? 'var(--vexto-primary)' : 'var(--vexto-border-strong)'"
            [style.background]="dragging() ? 'var(--vexto-primary-50)' : 'var(--vexto-surface-muted)'"
            (dragover)="onDragOver($event)"
            (dragleave)="dragging.set(false)"
            (drop)="onDrop($event)"
          >
            <vx-icon name="agreements" [size]="24" />
            <span class="text-body font-medium text-ink">
              {{ uploading() ? 'Uploading…' : 'Drop a file here, or choose one' }}
            </span>
            <span class="text-meta text-ink-muted">
              PDF, JPEG, PNG or WebP · up to {{ maxLabel }}
            </span>
            <input
              type="file"
              class="sr-only"
              [accept]="accept"
              [disabled]="uploading()"
              (change)="onFileChosen($event)"
            />
          </label>
        </div>
      }
    }
  `,
})
export class AgreementDocuments {
  private readonly api = inject(AgreementsApi);
  private readonly downloader = inject(FileDownloader);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly agreementId = input.required<string>();
  readonly documents = input.required<readonly AgreementDocument[]>();
  readonly loading = input(false);
  readonly canManage = input(false);

  /** The host reloads the agreement: the document count on the card changes too. */
  readonly changed = output<void>();

  protected readonly types = TYPES;
  protected readonly accept = ACCEPT;
  protected readonly maxLabel = `${MAX_BYTES / (1024 * 1024)} MB`;
  protected readonly date = formatDate;

  protected readonly type = signal<AgreementDocumentType>('Contract');
  protected readonly uploading = signal(false);
  protected readonly dragging = signal(false);
  protected readonly busyId = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);

  protected label(type: string): string {
    return TYPES.find((option) => option.id === type)?.label ?? humanizeEnum(type);
  }

  /** A page for a PDF, a camera for anything we know is an image. */
  protected iconFor(document: AgreementDocument): VxIconName {
    return document.contentType.startsWith('image/') ? 'camera' : 'agreements';
  }

  protected size(bytes: number | string): string {
    const value = Number(bytes);

    if (value < 1024) {
      return `${value} B`;
    }

    return value < 1024 * 1024
      ? `${Math.round(value / 1024)} KB`
      : `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected onTypeChange(event: Event): void {
    this.type.set((event.target as HTMLSelectElement).value as AgreementDocumentType);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);

    const file = event.dataTransfer?.files?.[0];

    if (file) {
      this.upload(file);
    }
  }

  protected onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file) {
      this.upload(file);
    }

    // Cleared so choosing the same file twice in a row still fires a change event.
    input.value = '';
  }

  protected download(document: AgreementDocument): void {
    this.busyId.set(document.id);

    this.downloader.save(this.api.documentPath(this.agreementId(), document.id), document.fileName).subscribe({
      next: () => this.busyId.set(null),
      error: (error: unknown) => {
        this.busyId.set(null);
        this.toast.error(
          error instanceof VextoApiError ? error.message : 'We could not download that document.',
        );
      },
    });
  }

  protected async remove(document: AgreementDocument): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Delete this document?',
      message: `${document.fileName} will be removed from the agreement. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.busyId.set(document.id);

    this.api.deleteDocument(this.agreementId(), document.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success('Document deleted.');
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.toast.error(
          error instanceof VextoApiError ? error.message : 'We could not delete that document.',
        );
      },
    });
  }

  private upload(file: File): void {
    if (this.uploading()) {
      return;
    }

    this.failure.set(null);

    // Checked here as well as on the server. The server is the authority — it also decides what the
    // bytes really are — but telling somebody their 40 MB scan is too large before they wait for it
    // to upload is the difference between a limit and a punishment.
    if (file.size > MAX_BYTES) {
      this.failure.set(`${file.name} is larger than ${this.maxLabel}.`);

      return;
    }

    this.uploading.set(true);

    this.api.uploadDocument(this.agreementId(), file, this.type()).subscribe({
      next: () => {
        this.uploading.set(false);
        this.toast.success('Document uploaded.');
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.failure.set(
          error instanceof VextoApiError ? error.message : 'We could not upload that document.',
        );
      },
    });
  }
}
