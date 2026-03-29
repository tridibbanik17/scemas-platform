# scemas-platform

smart city environmental monitoring and alert system. SE 3A04 course project demonstrating PAC (presentation-abstraction-control) architecture.

## architecture

three PAC agents (distinct dashboards) fed by four controllers:

```
                ┌─────────────────────┐
                │  DataDistribution   │
                │  Manager (tRPC)     │
                └─────────┬───────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
   │  Operator   │ │   Admin     │ │   Public    │
   │  Agent      │ │   Agent     │ │   Agent     │
   │  (operator/)│ │  (admin/)   │ │  (public/)  │
   └─────────────┘ └─────────────┘ └─────────────┘

   Controllers:
   ┌──────────────────┐  ┌──────────────────┐
   │ TelemetryManager │  │  AccessManager   │
   │ (pipe-and-filter)│  │  (repository)    │
   └──────────────────┘  └──────────────────┘
   ┌──────────────────┐
   │ AlertingManager  │
   │  (blackboard)    │
   └──────────────────┘
```

**operator agent**: dashboard with map, metrics, alerts, personalized subscriptions. full data access.

**admin agent**: threshold rules CRUD, user management, platform health, audit logs.

**public agent**: aggregated AQI display for digital signage. abstracted (sensitive data stripped). shared view for public users and third-party developers.

We also ship a small CLI for better usability.

## directory map

```
scemas-platform/
├── crates/                      rust workspace (internal processing engine)
│   ├── scemas-core/             shared entity types from UML class diagram
│   ├── scemas-telemetry/        pipe-and-filter validation pipeline
│   ├── scemas-alerting/         blackboard alert evaluation + lifecycle
│   ├── scemas-server/           axum internal API on :3001
│   └── scemas-desktop/          tauri host app and embedded-postgres runtime
│
├── packages/                    bun workspace (typescript)
│   ├── api/                     cloudflare worker + container wrapper for rust
│   ├── db/                      drizzle schema (database source of truth)
│   ├── types/                   zod schemas + shared types
│   ├── dashboard/               next.js 15 + tRPC (3 PAC agent dashboards)
│   └── desktop/                 vite/react frontend for the tauri desktop app
│
├── data/                        sample JSON sensor data (hamilton, ON)
├── scripts/                     seed script for data ingestion
├── docs/diagrams/               UML source of truth (.puml files)
└── docker-compose.yml           postgres
```

## getting started

Linux is recommended. For Windows recommend to run in WSL.

install rustup, bun (>= 1.2), and docker manually. the repo pins rust in `rust-toolchain.toml`, so `rustup` will pull the correct stable toolchain automatically.

```sh
source scripts/start-scemas.sh   # shell helpers + first-time setup
scemas-dev                       # starts db (docker) + schema + accounts + engine + dashboard
```

first-time setup (`.env` copy, `bun install`) runs automatically on first source and is tracked via a `.derived` sentinel file. delete `.derived` to re-run it.

### default accounts

`bun db:push` runs `@scemas/db`'s `ensure-users` script. it creates one account per role, skips any that already exist, and uses `1234` for all three defaults.

| email                  | role     | dashboard                                             |
| ---------------------- | -------- | ----------------------------------------------------- |
| `admin@example.com`    | admin    | `/rules`, `/users`, `/health`, `/audit`               |
| `operator@example.com` | operator | `/dashboard`, `/alerts`, `/subscriptions`, `/metrics` |
| `viewer@example.com`   | viewer   | `/display` (public AQI grid)                          |
| `public@example.com`   | viewer   |                                                       |

### seed sensor data

```sh
scemas dev seed             # nix shell, or if you build the CLI
scemas-seed                 # non-nix
```

pass `--spike` to generate readings that trigger alerts.
pass `--rate 8` or `--rate=8` to increase the aggregate generation frequency across all sensors.

### shell helpers

both paths give you the same functions:

| function        | description                                                    |
| --------------- | -------------------------------------------------------------- |
| `scemas-dev`    | start everything (db + schema + accounts + engine + dashboard) |
| `scemas-engine` | rust engine on :3001                                           |
| `scemas-dash`   | next.js dashboard on :3000                                     |
| `scemas-seed`   | seed sample data (supports `--spike` and `--rate <n>`)         |
| `scemas-check`  | run all lints (cargo fmt + clippy + tsc)                       |
| `scemas-nuke`   | stop everything                                                |

### environment variables

see `.env.example`. defaults work out of the box for the web stack. desktop-specific knobs:

| variable            | default                                          | meaning                                                                                                                                         |
| ------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | `postgres://scemas:scemas@localhost:5432/scemas` | external postgres connection, used by the web stack and by desktop when embedded mode is disabled or when a local postgres is already reachable |
| `POSTGRES_BIN_DIR`  | unset, auto-detected                             | desktop-only path to a postgres 16 `bin/` directory containing `pg_ctl`, `initdb`, `postgres`, `createdb`, and `psql`                           |
| `INTERNAL_RUST_URL` | `http://localhost:3001`                          | rust engine URL for remote auth fallback and sync. shared with dashboard. desktop also accepts legacy `SCEMAS_REMOTE_URL`                       |

## architecture tests

Run the following:

```bash
cargo test --all
```

### pipe-and-filter

_location_: `crates/scemas-telemetry/src/validate.rs`

chains `schema_validator`, `range_validator`, `timestamp_validator` via `and_then`. failure at any stage drops the reading. tests cover the happy path, each gate rejecting independently, and all four metric types.

### blackboard

_location_: `crates/scemas-alerting/src/blackboard.rs`

knowledge sources (`evaluator`, `lifecycle`, `dispatcher`) coordinate through shared mutable state on the `Blackboard`. tests import from both `evaluator` and `lifecycle` to exercise cross-module reads/writes, rule replacement, and the full evaluate-post-lifecycle transition.

### pac

_location_: `crates/scemas-core/src/models.rs`

the `Role` enum sits between the control layer (`AccessManager` / JWT) and the three presentation agents. route enforcement lives in `packages/dashboard/middleware.ts` and the `(operator)/`, `(admin)/`, `(public)/` route groups. tests verify role round-tripping through strings, rejection of unknown roles, and distinctness of all three agents.

## source of truth

all classes, attributes, methods, and relationships derive from the UML class diagram at [`docs/diagrams/class_diagram.puml`](docs/diagrams/class_diagram.puml). sequence diagrams and state charts in the same directory define interaction contracts.

## route map

### web routes

| route               | audience                               | purpose                                       |
| ------------------- | -------------------------------------- | --------------------------------------------- |
| `/`                 | everyone                               | root redirect to `/sign-in`                   |
| `/sign-in`          | operator, admin, viewer                | canonical login page                          |
| `/sign-up`          | new users                              | canonical signup page                         |
| `/dashboard`        | operator                               | main city operator dashboard                  |
| `/alerts`           | operator                               | live alert queue                              |
| `/alerts/[alertId]` | operator                               | alert detail drill-down                       |
| `/subscriptions`    | operator                               | personal alert subscription controls          |
| `/metrics`          | operator                               | sensor subagent overview                      |
| `/metrics/[zone]`   | operator                               | zone-specific metric drill-down               |
| `/rules`            | admin                                  | threshold rule CRUD                           |
| `/rules/[ruleId]`   | admin                                  | threshold rule detail page                    |
| `/users`            | admin                                  | user and role management                      |
| `/users/[userId]`   | admin                                  | account-specific audit trail                  |
| `/health`           | admin                                  | ingestion counters, failures, platform status |
| `/audit`            | admin                                  | audit log viewer                              |
| `/display`          | public, viewer, third-party developers | public AQI display                            |

### internal rust routes

these are server-to-server routes used by the next/tRPC layer and seed scripts, not browser pages.

| route                                              | method | purpose                            |
| -------------------------------------------------- | ------ | ---------------------------------- |
| `/internal/auth/signup`                            | `POST` | create account and issue session   |
| `/internal/auth/login`                             | `POST` | authenticate and issue session     |
| `/internal/auth/reset-password`                    | `POST` | admin password reset (argon2 hash) |
| `/internal/alerting/rules`                         | `POST` | create threshold rule              |
| `/internal/alerting/rules/{rule_id}/status`        | `POST` | activate or pause rule             |
| `/internal/alerting/rules/{rule_id}/delete`        | `POST` | delete rule                        |
| `/internal/alerting/alerts/{alert_id}/acknowledge` | `POST` | acknowledge alert                  |
| `/internal/alerting/alerts/{alert_id}/resolve`     | `POST` | resolve alert                      |
| `/internal/telemetry/ingest`                       | `POST` | ingest seeded or device telemetry  |
| `/internal/health`                                 | `GET`  | ingestion health counters          |

### public API routes

| route               | method        | purpose                                              |
| ------------------- | ------------- | ---------------------------------------------------- |
| `/api/v1/zones/aqi` | `GET`         | public, versioned AQI feed                           |
| `/api/trpc/*`       | `GET`, `POST` | dashboard tRPC transport for authenticated app views |

## document map

| path                                                         | purpose                                     |
| ------------------------------------------------------------ | ------------------------------------------- |
| `docs/D1.pdf`                                                | requirements and system framing             |
| `docs/D2.pdf`                                                | design/package deliverable                  |
| `docs/diagrams/class_diagram.puml`                           | UML class source of truth                   |
| `docs/diagrams/signup_and_login.puml`                        | signup/login interaction flow               |
| `docs/diagrams/define_alert_rule.puml`                       | admin rule creation sequence                |
| `docs/diagrams/acknowledge_critical_env.puml`                | operator alert acknowledgement sequence     |
| `docs/diagrams/data_distribution_management_controller.puml` | distribution controller sequence/state flow |
| `docs/diagrams/encryption_manager.puml`                      | auth/encryption manager notes               |

## building desktop releases

### local build

```sh
nix develop
cargo tauri build --manifest-path crates/scemas-desktop/Cargo.toml
```

output in `target/release/bundle/`:

- macOS: `macos/SCEMAS.app` + `dmg/SCEMAS_0.1.0_aarch64.dmg`
- linux: `appimage/` + `deb/`
- windows: `msi/` + `nsis/`

### via nix

```sh
nix build .#scemas-desktop   # builds the desktop app
nix build .#scemas            # builds the CLI only
```

### via CI (GitHub Actions)

push a version tag to trigger cross-platform builds:

```sh
git tag desktop-v0.1.0
git push origin desktop-v0.1.0
```

the `desktop.yml` workflow builds for macOS (arm64 + x86_64), linux (x86_64), and windows (x86_64). artifacts are uploaded as a draft GitHub release.

### macOS gatekeeper

the app is ad-hoc signed (no apple developer account). macOS will block it on first launch. users need to right-click the .app → Open, or:

```sh
xattr -cr /Applications/SCEMAS.app
```

### postgres bundling

`scripts/bundle-postgres.sh` stages postgres 16 binaries into `crates/scemas-desktop/resources/pg/`. CI runs this automatically. for local builds:

```sh
bash scripts/bundle-postgres.sh   # macOS/linux
```

## tech stack

| layer       | tech                                                   |
| ----------- | ------------------------------------------------------ |
| rust engine | axum, sqlx, tokio, argon2, jsonwebtoken                |
| database    | postgresql (drizzle migrations)                        |
| api surface | tRPC v11 (next.js server)                              |
| frontend    | next.js 15, tailwind v4, shadcn/ui, recharts, maplibre |
| validation  | zod (typescript), thiserror (rust)                     |
| deployment  | cloudflare workers via opennext                        |
| runtime     | bun (typescript), tokio (rust)                         |

## webhook dispatch

the alert subscription system supports outbound webhooks. when a matching alert fires, the rust engine POSTs a JSON payload to the configured URL.

### 1. start the echo server

```sh
bun run scripts/webhook-echo.ts
# webhook echo listening on http://localhost:9999
# paste http://localhost:9999/webhook into subscription settings
```

optional: `--port 8888` to use a different port.

### 2. configure a subscription

1. log in as operator (`operator@example.com` / `1234`)
2. open the alert subscription settings (drawer on the alerts page)
3. check the metric types and zones you want
4. paste `http://localhost:9999/webhook` in the webhook URL field
5. save

### 3. ensure a threshold rule exists

log in as admin (`admin@example.com` / `1234`), go to `/rules`, create a rule:

- metric: `temperature`, comparison: `gt`, threshold: `30`
- leave zone blank for global, or pick a specific zone

### 4. spike the seed

```sh
bun run scripts/seed.ts --spike
```

`--spike` forces extreme values that exceed thresholds. the echo server terminal should print:

```
2026-03-21T15:30:00.000Z  POST /webhook
  CRITICAL — temperature at 45.2 in downtown_core (sensor hamilton-aqhi-001)
  alert id: a1b2c3d4-...
  created:  2026-03-21T15:30:00.000Z
```

### webhook payload format

```json
{
  "type": "alert.triggered",
  "alert": {
    "id": "uuid",
    "zone": "downtown_core",
    "metricType": "temperature",
    "severity": 3,
    "triggeredValue": 45.2,
    "sensorId": "hamilton-aqhi-001",
    "createdAt": "2026-03-21T15:30:00.000Z"
  }
}
```

severity: 1 = low, 2 = warning, 3 = critical. the webhook fires best-effort (fire-and-forget via `tokio::spawn`). failures are logged server-side but don't block the alert pipeline.
