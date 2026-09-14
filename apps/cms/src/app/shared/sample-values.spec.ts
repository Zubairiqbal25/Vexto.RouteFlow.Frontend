import type { TemplateVariable } from '@vexto/models';
import { describe, expect, it } from 'vitest';
import { sampleValues, toVariableValues } from './sample-values';

const variables: TemplateVariable[] = [
  { name: 'OtpCode', description: '', required: true, kind: 'Text', sampleValue: '482193' },
  { name: 'ExpirationMinutes', description: '', required: true, kind: 'Number', sampleValue: '5' },
  { name: 'TenantName', description: '', required: false, kind: 'Text', sampleValue: null },
  { name: 'Blocked', description: '', required: false, kind: 'Boolean', sampleValue: null },
  { name: 'Rows', description: '', required: true, kind: 'Collection', sampleValue: '[{"Name":"Amina"}]' },
];

describe('sampleValues', () => {
  it('starts from each declared sample, with a visible stand-in when none is declared', () => {
    const values = sampleValues(variables);

    expect(values['OtpCode']).toBe('482193');
    expect(values['ExpirationMinutes']).toBe('5');
    expect(values['TenantName']).toBe('[TenantName]');
    expect(values['Blocked']).toBe('true');
    expect(values['Rows']).toBe('[{"Name":"Amina"}]');
  });
});

describe('toVariableValues', () => {
  it('sends numbers, booleans and rows typed, and everything else as text', () => {
    const values = toVariableValues(variables, {
      OtpCode: '123456',
      ExpirationMinutes: '7',
      TenantName: 'Gulf Transit',
      Blocked: 'false',
      Rows: '[{"Name":"Omar"}]',
    });

    expect(values).toEqual({
      OtpCode: '123456',
      ExpirationMinutes: 7,
      TenantName: 'Gulf Transit',
      Blocked: false,
      Rows: [{ Name: 'Omar' }],
    });
  });

  it('leaves out a collection whose JSON does not parse, so the server sample applies', () => {
    const values = toVariableValues(variables, { Rows: 'not json' });

    expect('Rows' in values).toBe(false);
  });

  it('keeps a non-numeric value for a number variable as text rather than sending NaN', () => {
    const values = toVariableValues(variables, { ExpirationMinutes: 'five' });

    expect(values['ExpirationMinutes']).toBe('five');
  });
});
