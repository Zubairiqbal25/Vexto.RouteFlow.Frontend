import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmailTemplatesApi, ReportTemplatesApi, VextoApiError } from '@vexto/api-client';
import type { EmailTemplateSummary, ReportTemplateSummary, TemplateVariable } from '@vexto/models';
import { VxErrorState, VxPageHeader, VxSectionCard, VxSkeleton } from '@vexto/ui';
import { forkJoin, of } from 'rxjs';

interface VariableReference {
  readonly id: string;
  readonly kind: 'email' | 'report';
  readonly code: string;
  readonly name: string;
  readonly variables: readonly TemplateVariable[];
}

/**
 * Every template's declared variables in one place.
 *
 * A reference, not an editor: the answer to "what does Trip.Cancelled expect from me" for the
 * developer wiring a producer, and to "which templates take a TenantName" for the administrator
 * about to change one. Read from the templates themselves — the declarations are the source, and
 * a separate catalogue would drift from them.
 */
@Component({
  selector: 'vexto-variables-reference-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxErrorState, VxPageHeader, VxSectionCard, VxSkeleton],
  template: `
    <vx-page-header title="Template Variables" description="What each template expects from the code that sends it. Declared on the template; checked before every send." />

    <vx-section-card class="mb-6 block" title="Always available" description="Supplied by the platform to every template and layout.">
      <dl class="grid gap-3 sm:grid-cols-2">
        <div><dt class="font-mono text-body text-ink">{{ '{{ VextoName }}' }}</dt><dd class="text-meta text-ink-muted">The platform name, "Vexto".</dd></div>
        <div><dt class="font-mono text-body text-ink">{{ '{{ CurrentYear }}' }}</dt><dd class="text-meta text-ink-muted">The current year, for a footer.</dd></div>
        <div><dt class="font-mono text-body text-ink">{{ '{{ Body }}' }}</dt><dd class="text-meta text-ink-muted">Layout only: the rendered template body.</dd></div>
        <div><dt class="font-mono text-body text-ink">{{ '{{ Subject }}' }}</dt><dd class="text-meta text-ink-muted">Layout only: the rendered subject.</dd></div>
      </dl>
    </vx-section-card>

    @if (error(); as message) {
      <vx-error-state title="We could not load the templates" [message]="message" (retry)="load()" />
    } @else if (loading()) {
      <div class="flex flex-col gap-4">
        <vx-skeleton height="8rem" />
        <vx-skeleton height="8rem" />
        <vx-skeleton height="8rem" />
      </div>
    } @else {
      <div class="flex flex-col gap-4">
        @for (reference of references(); track reference.id) {
          <vx-section-card [title]="reference.code" [description]="reference.name" [padded]="false">
            <a header-actions class="vx-btn vx-btn-ghost vx-btn-sm" [routerLink]="[reference.kind === 'email' ? '/email-templates' : '/report-templates', reference.id]">Open</a>
            @if (reference.variables.length === 0) {
              <p class="px-5 py-4 text-meta text-ink-muted">No variables declared.</p>
            } @else {
              <table class="vx-table">
                <thead>
                  <tr><th scope="col">Variable</th><th scope="col">Kind</th><th scope="col">Required</th><th scope="col">Description</th><th scope="col">Sample</th></tr>
                </thead>
                <tbody>
                  @for (variable of reference.variables; track variable.name) {
                    <tr>
                      <td class="vx-cell-strong font-mono">{{ '{{ ' + variable.name + ' }}' }}</td>
                      <td>{{ variable.kind }}</td>
                      <td>{{ variable.required ? 'Yes' : 'Optional' }}</td>
                      <td>{{ variable.description }}</td>
                      <td class="max-w-xs truncate font-mono text-meta">{{ variable.sampleValue ?? '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </vx-section-card>
        }
      </div>
    }
  `,
})
export class VariablesReferencePage {
  private readonly emails = inject(EmailTemplatesApi);
  private readonly reports = inject(ReportTemplatesApi);

  protected readonly references = signal<VariableReference[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      emails: this.emails.list({ pageSize: 100 }),
      reports: this.reports.list({ pageSize: 100 }),
    }).subscribe({
      next: ({ emails, reports }) => {
        // The list rows carry no variables; each template is read once. A hundred small reads on a
        // reference page opened a few times a month is a fair trade against a heavier list payload
        // on the screen everybody opens.
        const emailReads = emails.items.map((item: EmailTemplateSummary) => this.emails.get(item.id));
        const reportReads = reports.items.map((item: ReportTemplateSummary) => this.reports.get(item.id));

        forkJoin({
          emails: emailReads.length > 0 ? forkJoin(emailReads) : of([]),
          reports: reportReads.length > 0 ? forkJoin(reportReads) : of([]),
        }).subscribe({
          next: (details) => {
            this.references.set([
              ...(details.emails ?? []).map((detail) => ({ id: detail.id, kind: 'email' as const, code: detail.code, name: detail.name, variables: detail.variables })),
              ...(details.reports ?? []).map((detail) => ({ id: detail.id, kind: 'report' as const, code: detail.code, name: detail.name, variables: detail.variables })),
            ]);
            this.loading.set(false);
          },
          error: (error: unknown) => this.fail(error),
        });
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.loading.set(false);
    this.error.set(error instanceof VextoApiError ? error.message : 'We could not load the templates.');
  }
}
