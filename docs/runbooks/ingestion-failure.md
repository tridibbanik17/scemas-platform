# ingestion failure

the telemetry pipe-and-filter pipeline stops accepting or validating sensor data. sensor readings are rejected or lost.

## detection symptoms

- admin health page (`/health`) shows `total_rejected` climbing relative to `total_received`
- `platform_status` rows show `status = 'degraded'` (triggered when error_rate > 5%)
- `ingestion_failures` table has pending rows (check stage column: `schema`, `range`, `timestamp`, `alerting`, `aggregation`, `health_snapshot`)
- health endpoint returns error state:

```sh
curl http://localhost:3001/internal/health
```

- rust engine logs show `tracing::error!` entries for specific failure stages

## likely causes

1. **rust engine is down** (not listening on :3001). the dashboard's `callRustEndpoint` throws `SERVICE_UNAVAILABLE`
2. **device authorization failure**. the ingest route requires `x-scemas-device-id` and `x-scemas-device-token` headers, and the device must be registered in the `devices` table
3. **validation rejection**. sensor data fails schema/range/timestamp validation. empty sensor_id, out-of-range values (e.g. temperature outside -50 to 60 C), or timestamps drifted beyond 5 minutes
4. **postgres connection failure at persist step**. `TelemetryManager.persist()` writes to `sensor_readings`, and the database error propagates up. see [database-connection-failure.md](./database-connection-failure.md)
5. **cloudflare container cold-start** (production). the container has a 30-second port-ready timeout. if the rust binary doesn't boot in time, 503 is returned

## step-by-step mitigation

### 1. check rust engine health

```sh
curl http://localhost:3001/internal/health
```

if the engine is unreachable, check the process:

```sh
# local dev
cargo run -p scemas-server

# production: check cloudflare container logs
```

### 2. check ingestion counters

```sql
SELECT subsystem, total_received, total_accepted, total_rejected, updated_at
FROM ingestion_counters;
```

a healthy system has `total_rejected / total_received < 0.05`. if the ratio is higher, move to step 3.

### 3. query recent failures by stage

```sql
SELECT stage, error, COUNT(*)
FROM ingestion_failures
WHERE status = 'pending'
GROUP BY stage, error
ORDER BY count DESC
LIMIT 20;
```

the `stage` column tells you where the pipeline broke:

- `schema` -> payload doesn't match expected JSON structure
- `range` -> values outside plausible bounds
- `timestamp` -> clock drift beyond 5 minutes
- `alerting` -> post-validation alert evaluation failed (see [alerting-evaluation-failure.md](./alerting-evaluation-failure.md))

### 4. if device authorization failures

```sql
SELECT device_id, status FROM devices WHERE status != 'active';
```

re-activate devices if needed:

```sql
UPDATE devices SET status = 'active' WHERE device_id = '<id>';
```

### 5. if database errors

jump to [database-connection-failure.md](./database-connection-failure.md).

### 6. mark resolved failures after fix

use the "mark resolved" button on `/health`, or:

```sql
UPDATE ingestion_failures SET status = 'resolved', resolved_at = now() WHERE status = 'pending';
```
