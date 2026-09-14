import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { inject } from '@angular/core';

/**
 * A rendered template, shown in an isolated frame.
 *
 * **Sandboxed, always.** The document comes from the server's renderer and the markup policy has
 * already refused scripts and handlers on save — and the frame still runs with an empty `sandbox`
 * attribute, which is a different kind of guarantee: whatever the HTML turns out to contain, it
 * gets no script, no same-origin access to this page, no forms and no navigation. `srcdoc` rather
 * than a URL so nothing is fetched and nothing is cached.
 *
 * The frame is a light document on purpose. Email clients render on a light background whatever
 * the app's theme is, and a preview that followed the dark theme would show an email nobody will
 * receive.
 */
@Component({
  selector: 'vexto-preview-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <iframe
      class="w-full rounded-xl border border-line bg-white"
      [style.height]="height()"
      [srcdoc]="document()"
      sandbox=""
      referrerpolicy="no-referrer"
      [title]="title()"
    ></iframe>
  `,
})
export class PreviewFrame {
  private readonly sanitizer = inject(DomSanitizer);

  readonly html = input.required<string>();
  readonly title = input('Preview');
  readonly height = input('640px');

  /**
   * Marked trusted for the `srcdoc` binding only. That is not a claim the HTML is safe — it is the
   * sandbox that makes it safe — it is what lets Angular hand the document to the frame verbatim
   * instead of stripping the inline styles every email relies on.
   */
  protected readonly document = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.html()));
}
