import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { VEXTO_CONFIG } from '@vexto/utilities';
import type { AgreementDocument } from '@vexto/models';
import { beforeEach, describe, expect, it } from 'vitest';
import { AgreementDocuments } from './agreement-documents';

function document(overrides: Partial<AgreementDocument> = {}): AgreementDocument {
  return {
    id: 'doc1',
    fileName: 'Signed transport agreement.pdf',
    type: 'Contract',
    contentType: 'application/pdf',
    fileSize: 348_160,
    uploadedAtUtc: '2026-03-02T09:15:00Z',
    ...overrides,
  } as AgreementDocument;
}

function render(documents: readonly AgreementDocument[], canManage = true) {
  const fixture = TestBed.createComponent(AgreementDocuments);

  fixture.componentRef.setInput('agreementId', 'a1');
  fixture.componentRef.setInput('documents', documents);
  fixture.componentRef.setInput('canManage', canManage);
  fixture.detectChanges();

  return fixture;
}

const text = (documents: readonly AgreementDocument[], canManage = true) =>
  render(documents, canManage).nativeElement.textContent as string;

describe('AgreementDocuments', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: VEXTO_CONFIG, useValue: { apiBaseUrl: 'https://api.test' } },
      ],
    });
  });

  it('describes each file by name, type, size and date', () => {
    const rendered = text([document()]);

    expect(rendered).toContain('Signed transport agreement.pdf');
    expect(rendered).toContain('Contract');
    expect(rendered).toContain('340 KB');
  });

  it('never renders a storage path', () => {
    // Where the bytes live is an internal detail of IFileStorage. The API does not send it and the
    // UI has no field for it; downloads go through an authorized endpoint instead.
    const rendered = text([document()]);

    expect(rendered).not.toContain('agreements/');
    expect(rendered).not.toContain('.pdf.');
  });

  it('names the type in the operator’s words, not the enum’s', () => {
    expect(text([document({ type: 'NoObjectionCertificate' })])).toContain('NOC');
    expect(text([document({ type: 'TradeLicense' })])).toContain('Trade licence');
  });

  it('explains an empty list rather than showing nothing', () => {
    expect(text([])).toContain('No documents attached');
  });

  it('states the limits before an upload rather than after a refusal', () => {
    const rendered = text([]);

    expect(rendered).toContain('PDF, JPEG, PNG or WebP');
    expect(rendered).toContain('20 MB');
  });

  it('offers upload and delete only to somebody who may manage the agreement', () => {
    const readOnly = text([document()], false);

    expect(readOnly).toContain('Download');
    expect(readOnly).not.toContain('Delete');
    expect(readOnly).not.toContain('Drop a file here');
  });

  it('uses a real file input, so the keyboard and the OS dialog work', () => {
    // A div with drag handlers is not a file picker; it is a file picker for people with a mouse.
    const fixture = render([]);
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;

    expect(input).not.toBeNull();
    expect(input.accept).toContain('application/pdf');
  });

  it('formats a small file in bytes rather than as 0.0 MB', () => {
    expect(text([document({ fileSize: 900 })])).toContain('900 B');
  });
});
