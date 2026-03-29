# system architecture

scemas-platform is a smart city environmental monitoring system for hamilton, ontario. it follows a **PAC (presentation-abstraction-control)** architecture with three user agents (admin, operator, public viewer), a rust processing engine, and postgres as the single source of truth.

## system topology

```mermaid
graph TB
    subgraph clients["clients"]
        admin["admin<br/>(next.js /rules)"]
        operator["operator<br/>(next.js /dashboard)"]
        viewer["public viewer<br/>(next.js /display)"]
        desktop["desktop app<br/>(tauri + vite)"]
        cli["scemas cli"]
    end

    subgraph cloudflare["cloudflare edge"]
        worker["api worker<br/>(@scemas/api)"]
        dashboard["dashboard<br/>(opennext)"]
    end

    subgraph processing["processing layer"]
        engine["rust engine<br/>(axum :3001)"]
        telemetry["telemetry manager<br/>(pipe-and-filter)"]
        alerting["alerting manager<br/>(blackboard)"]
        distribution["data distribution<br/>(aggregation)"]
        access["access manager<br/>(auth + devices)"]
    end

    postgres[("postgres 16")]

    admin --> dashboard
    operator --> dashboard
    viewer --> dashboard
    dashboard -->|"tRPC"| engine
    dashboard -->|"service binding"| worker
    worker -->|"container proxy"| engine
    desktop -->|"tauri IPC"| engine
    cli -->|"direct DB / HTTP"| engine

    engine --> telemetry
    engine --> alerting
    engine --> distribution
    engine --> access

    telemetry --> postgres
    alerting --> postgres
    distribution --> postgres
    access --> postgres
    desktop -.->|"embedded postgres<br/>(production)"| postgres
```

## local development vs production

```mermaid
graph LR
    subgraph local["local dev"]
        next["next.js :3000"]
        rust["rust :3001"]
        pg["postgres :5432<br/>(docker)"]
        next -->|"HTTP fetch"| rust
        rust --> pg
    end

    subgraph prod["production (cloudflare)"]
        dash["dashboard worker<br/>(opennext)"]
        api["api worker<br/>(durable object)"]
        container["rust container"]
        neon["neon postgres"]
        dash -->|"service binding"| api
        api -->|"container proxy"| container
        container --> neon
    end
```

locally it is two processes and a database. the next.js dev server on :3000 calls the rust engine on :3001 via HTTP. in production, cloudflare routes the dashboard through a worker service binding to the api worker, which manages a durable object container running the rust binary. the container auto-sleeps after 5 minutes of inactivity.

## PAC agent model

the system serves three distinct user agents, each with different data access and control surfaces.

```mermaid
graph TB
    subgraph pac["PAC agents"]
        subgraph admin_agent["system administrator"]
            a_p["presentation<br/>/rules, /users, /devices,<br/>/reports, /health, /audit"]
            a_a["abstraction<br/>full CRUD, all entities"]
            a_c["control<br/>adminProcedure<br/>(role = admin)"]
        end

        subgraph operator_agent["city operator"]
            o_p["presentation<br/>/dashboard, /alerts,<br/>/metrics, /subscriptions"]
            o_a["abstraction<br/>read telemetry, manage alerts,<br/>subscription-filtered views"]
            o_c["control<br/>protectedProcedure<br/>(role = operator)"]
        end

        subgraph public_agent["public user"]
            p_p["presentation<br/>/display"]
            p_a["abstraction<br/>zone aggregates only,<br/>no sensor IDs"]
            p_c["control<br/>publicProcedure<br/>(no auth required)"]
        end
    end

    subgraph shared["shared infrastructure"]
        trpc["tRPC router<br/>(12 sub-routers)"]
        engine["rust engine"]
        db[("postgres")]
    end

    a_c --> trpc
    o_c --> trpc
    p_c --> trpc
    trpc --> engine
    trpc --> db
```

| agent                | role       | landing page | can see                                               | can do                                                                    |
| -------------------- | ---------- | ------------ | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| system administrator | `admin`    | `/rules`     | everything                                            | CRUD rules, manage users/devices, review hazard reports, view audit trail |
| city operator        | `operator` | `/dashboard` | telemetry, alerts (filtered by subscription), metrics | acknowledge/resolve alerts, update subscriptions, submit hazard reports   |
| public user          | `viewer`   | `/display`   | zone-level aggregates only (no raw sensor IDs)        | view AQI, rankings, zone history                                          |

the privacy boundary is enforced at the abstraction layer: `DataDistributionManager` strips sensor-level detail before returning data to public endpoints. operators see subscription-filtered alert lists. admins see everything.

## server lifecycle

the rust engine has a deterministic startup and shutdown sequence, tracked by atomic state.

```mermaid
stateDiagram-v2
    [*] --> Initializing: process start
    Initializing --> Authenticating: DB connected
    Authenticating --> Distributing: access manager + device registry synced
    Distributing --> Draining: SIGTERM / SIGINT / auto-drain

    state Draining {
        [*] --> StopIngestion: reject new readings (503)
        StopIngestion --> DrainAPIRequests: wait for in-flight API
        DrainAPIRequests --> DrainOperatorViews: wait for operator sessions
        DrainOperatorViews --> StopMonitoring: flush health + counters
        StopMonitoring --> DrainComplete: persist final state
    }

    Draining --> ShuttingDown: drain cascade complete
    ShuttingDown --> Stopped: DB pool closed
    Stopped --> [*]
```

each phase gate is an atomic `u8` check. requests track in-flight counts via `LifecycleState::track_request()` and auto-decrement on drop. the drain cascade polls every 50ms with a 30-second timeout per stage.

auto-drain triggers when the ingestion error rate exceeds 20% for 3 consecutive health snapshots (60 seconds each). this prevents a degraded system from silently corrupting data.

## data model

18 postgres tables, owned by drizzle schema, mirrored in rust (`scemas-core/models.rs`) and typescript (`@scemas/types/index.ts`).

```mermaid
erDiagram
    accounts ||--o{ activeSessionTokens : "has sessions"
    accounts ||--o{ apiTokens : "owns tokens"
    accounts ||--o{ alertSubscriptions : "subscribes"
    accounts ||--o{ auditLogs : "generates"
    accounts ||--o{ hazardReports : "reports/reviews"

    devices ||--o{ sensorReadings : "produces"

    thresholdRules ||--o{ alerts : "triggers"
    alerts }o--|| accounts : "acknowledged by"

    sensorReadings ||--o{ analytics : "aggregated into"
    sensorReadings ||--o{ ingestionFailures : "fails to"

    accounts {
        uuid id PK
        text email UK
        text username
        text passwordHash
        enum role
        timestamp createdAt
    }

    devices {
        text deviceId PK
        text deviceType
        text zone
        enum status
        timestamp registeredAt
    }

    sensorReadings {
        serial id PK
        text sensorId
        enum metricType
        numeric value
        text zone
        timestamp time
    }

    thresholdRules {
        uuid id PK
        enum metricType
        numeric thresholdValue
        enum comparison
        text zone
        enum ruleStatus
        uuid createdBy FK
    }

    alerts {
        uuid id PK
        uuid ruleId FK
        text sensorId
        int severity
        enum status
        numeric triggeredValue
        text zone
        enum metricType
        timestamp createdAt
    }

    analytics {
        serial id PK
        text zone
        enum metricType
        numeric aggregatedValue
        text aggregationType
        int sampleCount
        numeric sampleSum
        timestamp time
    }

    alertSubscriptions {
        uuid id PK
        uuid userId FK UK
        text_arr metricTypes
        text_arr zones
        int minSeverity
        text webhookUrl
    }

    platformStatus {
        serial id PK
        text subsystem
        text status
        numeric uptime
        numeric latencyMs
        numeric errorRate
        timestamp time
    }
```

supporting tables not shown: `ingestionCounters` (health counters per subsystem), `ingestionFailures` (dead-letter queue for failed readings), `auditLogs` (immutable action trail), `hazardReports` (user-submitted environmental incidents), `oauthClients`/`oauthCodes`/`oauthTokens` (RFC 7591 app registry), `rateLimitHits` (sliding-window rate limit tracking).

## request flow: sensor reading to alert

the most important data path. a sensor reading arrives, passes through validation, gets persisted, evaluated against rules, and potentially dispatches alerts.

```mermaid
sequenceDiagram
    participant S as sensor device
    participant R as rust engine
    participant V as telemetry manager
    participant A as alerting manager
    participant BB as blackboard
    participant D as data distribution
    participant DB as postgres

    S->>R: POST /internal/telemetry/ingest
    R->>R: check lifecycle phase (503 if draining)
    R->>R: track in-flight request
    R->>R: authorize device (x-scemas-device-id + token)

    R->>V: ingest(reading)
    V->>V: schema_validator (non-empty sensor_id, zone)
    V->>V: range_validator (temp: -50..60, humidity: 0..100, etc.)
    V->>V: timestamp_validator (max 5min drift)
    V->>DB: INSERT INTO sensor_readings
    V-->>R: validated reading

    R->>A: evaluate_reading(reading)
    A->>BB: read active_rules
    BB-->>A: matching rules
    A->>A: threshold check + severity classification
    Note over A: >1.5x threshold = critical<br/>>1.2x = warning<br/>else = low
    A->>DB: INSERT INTO alerts (if triggered)
    A->>BB: post_alert(new alerts)
    A->>A: find matching subscriptions
    A->>A: dispatch webhooks (spawn, best-effort)
    A-->>R: alerts created

    R->>D: aggregate_reading(reading)
    D->>DB: UPSERT analytics (5-min avg, 1-hour max)
    D->>DB: UPSERT platform_status (every 60s)

    R-->>S: 200 {"status": "accepted"}
```

if any validation filter rejects the reading, the pipeline short-circuits, records an `ingestion_failure`, and returns an error. alerting and aggregation failures are logged but don't fail the ingest (best-effort).

## deployment architecture

```mermaid
graph TB
    subgraph cf["cloudflare"]
        dns["DNS + TLS"]
        dash_worker["dashboard worker<br/>(opennext / next.js)"]
        api_worker["api worker<br/>(durable object)"]

        subgraph container["container runtime"]
            rust_bin["scemas-server binary"]
            catalog["sensor catalog JSON"]
        end

        dns --> dash_worker
        dash_worker -->|"service binding<br/>(SCEMAS_API)"| api_worker
        api_worker -->|"container proxy<br/>(:3001)"| container
    end

    neon[("neon postgres<br/>(serverless)")]
    container --> neon

    subgraph desktop_deploy["desktop distribution"]
        tauri_app["tauri 2.x app"]
        embedded_pg["bundled postgres"]
        tauri_app --> embedded_pg
        tauri_app -.->|"optional sync"| neon
    end
```

the api worker wraps the rust binary in a cloudflare container (durable object). it starts on first request, auto-sleeps after 5 minutes idle, and health-checks via `/internal/health`. the dashboard reaches it through a service binding (no public round-trip through `workers.dev`).

the desktop app bundles its own postgres binary for offline operation. when `SCEMAS_REMOTE_DB_URL` is set, a background sync service replicates data from the remote database.

## monitoring regions

11 monitoring zones mapped to hamilton, ontario neighborhoods. each zone has polygon boundaries derived from the City of Hamilton Neighborhoods feature service.

| zone ID                 | area                   |
| ----------------------- | ---------------------- |
| `downtown_core`         | downtown hamilton core |
| `north_end_west`        | north end (west)       |
| `north_end_east`        | north end (east)       |
| `kirkendall_chedoke`    | kirkendall / chedoke   |
| `beasley_landsdale`     | beasley / landsdale    |
| `central_south`         | central south          |
| `crown_point`           | crown point            |
| `east_hamilton`         | east hamilton          |
| `industrial_waterfront` | industrial waterfront  |
| `west_harbour`          | west harbour           |
| `strathcona`            | strathcona             |

zone definitions live in `scripts/generate-monitoring-network.ts`. derived assets: `data/hamilton-monitoring-regions.json`, `data/hamilton-sensor-catalog.json`, `data/regions.catalog.json`.
