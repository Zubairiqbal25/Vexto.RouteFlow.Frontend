// Fetches the API's OpenAPI document and commits it in a deterministic shape.
//
// The backend serves the document at runtime only (build-time generation is off — see
// Vexto.Api.csproj), so regenerating the typed client means: run the API, pull the document, then
// run `npm run api:generate`. This script is the middle step. It strips the `servers` entry, which
// names whatever port the API happened to be started on, and sorts paths and schemas so that two
// runs against the same backend produce byte-identical files — a regeneration should show the
// contract change and nothing else.
//
//   VEXTO_API_URL=http://localhost:5154 npm run api:sync
//   npm run api:generate

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const apiUrl = process.env['VEXTO_API_URL'] ?? 'http://localhost:5154';
const target = resolve(import.meta.dirname, '../../../Backend/docs/api/openapi-v1.json');

const response = await fetch(`${apiUrl}/openapi/v1.json`);

if (!response.ok) {
  throw new Error(`GET ${apiUrl}/openapi/v1.json returned ${response.status}. Is the API running in Development?`);
}

const document = await response.json();

delete document.servers;

const sorted = (object) => Object.fromEntries(Object.keys(object).sort().map((key) => [key, object[key]]));

document.paths = sorted(document.paths);

if (document.components?.schemas) {
  document.components.schemas = sorted(document.components.schemas);
}

writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Wrote ${Object.keys(document.paths).length} paths to ${target}`);
