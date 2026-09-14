import { TestBed } from '@angular/core/testing';
import type { TemplateVariable } from '@vexto/models';
import { describe, expect, it } from 'vitest';
import { CodeEditor } from './code-editor';
import { PreviewFrame } from './preview-frame';
import { type TemplateCardItem, TemplateCard } from './template-card';
import { VariablePanel } from './variable-panel';

const variables: TemplateVariable[] = [
  { name: 'OtpCode', description: 'Six-digit login verification code', required: true, kind: 'Text', sampleValue: '482193' },
  { name: 'TenantName', description: 'The operator', required: false, kind: 'Text', sampleValue: null },
];

function item(overrides: Partial<TemplateCardItem> = {}): TemplateCardItem {
  return {
    id: 't1',
    code: 'Auth.EmailOtp',
    name: 'Vexto Email OTP',
    category: 'Authentication',
    status: 'Active',
    isSystem: true,
    currentVersion: 4,
    hasUnpublishedChanges: false,
    createdAtUtc: '2026-09-01T00:00:00Z',
    updatedAtUtc: '2026-09-12T00:00:00Z',
    ...overrides,
  };
}

describe('VariablePanel', () => {
  it('lists every declared variable as a placeholder and marks the required ones', () => {
    const fixture = TestBed.createComponent(VariablePanel);
    fixture.componentRef.setInput('variables', variables);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('{{ OtpCode }}');
    expect(text).toContain('{{ TenantName }}');
    expect(text).toContain('Six-digit login verification code');
    expect(text).toContain('{{ VextoName }}');

    const required = (fixture.nativeElement as HTMLElement).querySelectorAll('.vx-tone-warning');
    expect(required).toHaveLength(1);
  });

  it('emits the variable name when one is clicked', () => {
    const fixture = TestBed.createComponent(VariablePanel);
    fixture.componentRef.setInput('variables', variables);
    fixture.detectChanges();

    const inserted: string[] = [];
    fixture.componentInstance.insert.subscribe((name) => inserted.push(name));

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Insert OtpCode"]')
      ?.click();

    expect(inserted).toEqual(['OtpCode']);
  });
});

describe('CodeEditor', () => {
  it('inserts at the caret and reports the change', () => {
    const fixture = TestBed.createComponent(CodeEditor);
    fixture.detectChanges();

    const editor = fixture.componentInstance;
    const changes: string[] = [];
    editor.registerOnChange((value: string) => changes.push(value));
    editor.writeValue('Hello , welcome');
    fixture.detectChanges();

    const area = (fixture.nativeElement as HTMLElement).querySelector('textarea')!;
    area.setSelectionRange(6, 6);
    editor.insertAtCaret('{{ FirstName }}');

    expect(changes.at(-1)).toBe('Hello {{ FirstName }}, welcome');
    expect(area.selectionStart).toBe(6 + '{{ FirstName }}'.length);
  });
});

describe('PreviewFrame', () => {
  it('renders the document in a fully sandboxed frame', () => {
    const fixture = TestBed.createComponent(PreviewFrame);
    fixture.componentRef.setInput('html', '<p>Sign in to Vexto</p>');
    fixture.detectChanges();

    const frame = (fixture.nativeElement as HTMLElement).querySelector('iframe')!;

    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.srcdoc).toContain('Sign in to Vexto');
  });
});

describe('TemplateCard', () => {
  function render(input: TemplateCardItem, canSendTest = true) {
    const fixture = TestBed.createComponent(TemplateCard);
    fixture.componentRef.setInput('item', input);
    fixture.componentRef.setInput('canSendTest', canSendTest);
    fixture.detectChanges();

    return { fixture, text: (fixture.nativeElement as HTMLElement).textContent ?? '' };
  }

  it('shows the name, the code, the category, the version and the system note', () => {
    const { text } = render(item());

    expect(text).toContain('Vexto Email OTP');
    expect(text).toContain('Auth.EmailOtp');
    expect(text).toContain('Authentication');
    expect(text).toContain('v4');
    expect(text).toContain('System template');
    expect(text).not.toContain('Unpublished edits');
  });

  it('warns when the working copy differs from the published version', () => {
    const { text } = render(item({ hasUnpublishedChanges: true }));

    expect(text).toContain('Unpublished edits');
  });

  it('says when a draft has never been published', () => {
    const { text } = render(item({ status: 'Draft', currentVersion: 0, hasUnpublishedChanges: true, isSystem: false }));

    expect(text).toContain('Not published');
    expect(text).not.toContain('Unpublished edits');
  });

  it('offers a test send only for email templates, and the right lifecycle action', () => {
    const active = render(item(), true).fixture.componentInstance;
    expect(active['actions']().map((action) => action.id)).toEqual(['edit', 'preview', 'send-test', 'history', 'deactivate']);

    const inactiveReport = render(item({ status: 'Inactive' }), false).fixture.componentInstance;
    expect(inactiveReport['actions']().map((action) => action.id)).toEqual(['edit', 'preview', 'history', 'activate']);
  });
});
