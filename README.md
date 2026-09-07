# Vexto frontend

One Angular workspace, three applications:

| App | Port | For |
| --- | --- | --- |
| `operator` | 4200 | Dispatchers and administrators — desktop-first portal |
| `driver` | 4201 | Drivers — tablet-first, PWA |
| `passenger` | 4202 | Passengers — mobile-first, PWA |

Architecture: [../docs/frontend-architecture.md](../docs/frontend-architecture.md).
Design system: [../docs/design-system.md](../docs/design-system.md).
Running everything locally, seed included: [../Backend/docs/pilot-setup.md](../Backend/docs/pilot-setup.md).
Billing and payments: [../Backend/docs/billing.md](../Backend/docs/billing.md), [../Backend/docs/payments.md](../Backend/docs/payments.md).

---

## Getting started

```bash
npm install
npm run start:operator      # http://localhost:4200
```

The apps read `public/config.json` at start-up, which points at `https://localhost:7154` by default.
Change it there rather than rebuilding.

```json
{
  "apiBaseUrl": "https://localhost:7154",
  "trackingHubUrl": "https://localhost:7154/hubs/tracking",
  "googleMapsApiKey": "",
  "driverLocationIntervalSeconds": 5,
  "staleLocationAfterSeconds": 45
}
```

Leave `googleMapsApiKey` empty and the map renders an honest placeholder; every other screen works.
The key is a public, referrer-restricted browser key — never a secret.

The API must allow the app's origin. `Backend/src/Vexto.Api/appsettings.Development.json` already
lists ports 4200–4202 under `Cors:AllowedOrigins`.

**Node.** Angular 22 needs Node `^22.22.2 || ^24.15.0 || >=26`. A supported Node is vendored as a dev
dependency, so `npm run …` works on a machine with an older 24.x; drop the `node` dependency once the
machine's own Node is current.

---

## Commands

```bash
npm run start:operator | start:driver | start:passenger
npm run build                    # production builds of all three
npm run lint
npm run test -- --watch=false    # Vitest
npm run e2e                      # Playwright — needs a running, seeded API; see docs §16
npm run api:generate             # regenerate types from the committed OpenAPI document
```

### Regenerating the API types

The contract comes from the backend, never from hand-written interfaces:

```bash
cd ../Backend
Database__SkipInitialization=true dotnet build src/Vexto.Api/Vexto.Api.csproj
cp src/Vexto.Api/obj/Vexto.Api.json docs/api/openapi-v1.json
cd ../frontend && npm run api:generate
```

A backend rename then shows up as a TypeScript error rather than a runtime surprise.
