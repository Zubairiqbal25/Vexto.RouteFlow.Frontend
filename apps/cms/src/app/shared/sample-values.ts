import type { TemplateVariableValues } from '@vexto/api-client';
import type { TemplateVariable } from '@vexto/models';

/** What the sample inputs hold: one string per declared variable, as typed. */
export type SampleValueMap = Record<string, string>;

/**
 * The sample strings a preview or a test send starts from: each declared variable's own sample,
 * or a stand-in that makes the placeholder visible when none was declared.
 */
export function sampleValues(variables: readonly TemplateVariable[]): SampleValueMap {
  const values: SampleValueMap = {};

  for (const variable of variables) {
    values[variable.name] = variable.sampleValue ?? defaultSample(variable);
  }

  return values;
}

/**
 * Turns typed samples into the values the API expects: numbers as numbers, booleans as booleans,
 * a collection as parsed rows (or nothing, when the JSON does not parse — the server's own sample
 * then applies), everything else as text.
 */
export function toVariableValues(
  variables: readonly TemplateVariable[],
  values: SampleValueMap,
): TemplateVariableValues {
  const result: Record<string, unknown> = {};

  for (const variable of variables) {
    const raw = values[variable.name];

    if (raw === undefined) {
      continue;
    }

    switch (variable.kind) {
      case 'Number': {
        const number = Number(raw);
        result[variable.name] = raw.trim() === '' || Number.isNaN(number) ? raw : number;
        break;
      }
      case 'Boolean':
        result[variable.name] = raw.trim().toLowerCase() === 'true';
        break;
      case 'Collection': {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            result[variable.name] = parsed;
          }
        } catch {
          // Left out on purpose: the server falls back to the declared sample.
        }
        break;
      }
      default:
        result[variable.name] = raw;
    }
  }

  return result;
}

function defaultSample(variable: TemplateVariable): string {
  switch (variable.kind) {
    case 'Number':
      return '1';
    case 'Boolean':
      return 'true';
    case 'Date':
      return new Date().toISOString().slice(0, 10);
    case 'Collection':
      return '[]';
    default:
      return `[${variable.name}]`;
  }
}
