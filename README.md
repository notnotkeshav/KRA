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

- `app/domain/` pure business logic (calculations, quarterly, carry-forward, validation, backup, export report, dashboard)
- `app/db/` IndexedDB core (`indexeddb.ts`), `migrations.ts`, `seed.ts`, `repositories/*`
- `app/routes/` route modules (`clientLoader`/`clientAction` read from and write to IndexedDB)
- `app/components/` UI by area; `app/utils/` dates, csv, formatting, xlsx writer

## IndexedDB schema (`kra-db`, version 3)

| Store | Key | Indexes |
|---|---|---|
| `employees` | `id` | `name` (unique), `active` |
| `templates` | `id` | – |
| `kraConfig` | `id` | `order`, `templateId` |
| `monthlyKRA` | `id` | `employeeId`, `month`, `employeeId_month` (unique) |
| `settings` | `id` | – (holds `app-settings` and `goLiveOverride:*` documents) |

## KRA templates

A template is a named set of KRAs whose active weights total 100. Built in: **Developer** and **Functional**. Each employee is assigned one template and is scored only on its KRAs; quarterly tables, dashboard and exports group by template. An employee's template cannot change once monthly records exist. Manage templates and KRAs in *KRA Configuration*.

## Calculation rules

- Monthly total = sum of achievements over **active** KRAs (missing = 0), recalculated on read.
- Quarterly = sum of monthly values / months with data (configurable: sum, or missing months as zero).
- Go Live carry-forward (per template's Go Live KRA): previous quarter had manual Go Live > 0, current quarter has records but no Go Live → +5 (configurable), capped at the KRA weight. Per-employee, per-quarter manual overrides are stored separately.
- Quarterly total = sum of the final per-category values (including carry-forward / override).
