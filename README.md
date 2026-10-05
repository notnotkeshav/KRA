# KRA Management

Internal tool for tracking monthly employee KRA performance, quarterly aggregation, remarks and report export.
Fully client-side: **IndexedDB** (`kra-db`) is the only persistence. No backend, no localStorage/sessionStorage.

## Commands

```bash
npm run dev        # development server
npm run typecheck  # route typegen + tsc
npm run test       # business-logic tests (Vitest)
npm run build      # production build (SPA, build/client)
```

## Layout

- `app/domain/` pure business logic (calculations, quarterly, carry-forward, validation, import, backup, export report, dashboard)
- `app/db/` IndexedDB core (`indexeddb.ts`), `migrations.ts`, `seed.ts`, `repositories/*`
- `app/routes/` route modules (`clientLoader`/`clientAction` read from and write to IndexedDB)
- `app/components/` UI by area; `app/utils/` dates, csv, formatting, xlsx writer

## IndexedDB schema (`kra-db`, version 2)

| Store | Key | Indexes |
|---|---|---|
| `employees` | `id` | `name` (unique), `active` |
| `kraConfig` | `id` | `order` |
| `monthlyKRA` | `id` | `employeeId`, `month`, `employeeId_month` (unique) |
| `settings` | `id` | – (holds `app-settings` and `goLiveOverride:*` documents) |

## Calculation rules

- Monthly total = sum of achievements over **active** KRAs (missing = 0), recalculated on read.
- Quarterly = sum of monthly values / months with data (configurable: sum, or missing months as zero).
- Go Live carry-forward: previous quarter had manual Go Live > 0, current quarter has records but no Go Live → +5 (configurable), capped at the KRA weight. Per-employee, per-quarter manual overrides are stored separately.
- Quarterly total = sum of the final per-category values (including carry-forward / override).
