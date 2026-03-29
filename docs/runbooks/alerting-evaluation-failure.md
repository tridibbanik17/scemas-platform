# alerting engine evaluation failure

the blackboard evaluator fails to check sensor readings against active threshold rules. sensor data is accepted and stored, but no alerts fire.

## detection symptoms

- `ingestion_failures` table has rows with `stage = 'alerting'`
- rust engine logs show `"alert evaluation failed: {error}"`
- new sensor readings arrive (ingestion counters increment) but no new alerts appear in the alerts table, despite active rules
- admin health page `/health` shows alerting-stage failures in the "durable downstream failures" section

## likely causes

1. **rules failed to load at startup**. the blackboard loads active rules from `threshold_rules` at boot. if this query fails, the engine logs a warning and continues with zero rules. evaluation silently produces zero alerts (everything looks fine, nothing fires)
2. **blackboard RwLock contention**. under concurrent ingest, the write lock at alert persist can stall if a long-running read holds the lock
3. **database error during `persist_alert()`**. if the alerts table is inaccessible, evaluation returns an error
4. **malformed rule data in postgres**. the rule conversion uses `filter_map(|row| row.try_into().ok())`, which silently drops rules with unknown metric types, comparison operators, or rule statuses
5. **webhook dispatch failure**. `dispatch_alerts()` spawns async tasks for webhook delivery. if `reqwest::Client` fails, it logs a warning but doesn't propagate the error

## step-by-step mitigation

### 1. check for alerting failures

```sql
SELECT stage, error, sensor_id, created_at
FROM ingestion_failures
WHERE stage = 'alerting'
ORDER BY created_at DESC
LIMIT 20;
```

### 2. verify active rules loaded

```sql
SELECT id, metric_type, threshold_value, comparison, zone, rule_status
FROM threshold_rules
WHERE rule_status = 'active';
```

if this returns rows, the rules exist in postgres. the question is whether they loaded into the blackboard at startup.

### 3. check enum values

the rust evaluator only recognizes these exact strings:

- metric_type: `temperature`, `humidity`, `air_quality`, `noise_level`
- comparison: `gt`, `lt`, `gte`, `lte`
- rule_status: `active`, `inactive`

any other value causes the rule to be silently dropped during conversion. check for typos:

```sql
SELECT id, metric_type, comparison, rule_status
FROM threshold_rules
WHERE metric_type NOT IN ('temperature', 'humidity', 'air_quality', 'noise_level')
   OR comparison NOT IN ('gt', 'lt', 'gte', 'lte')
   OR rule_status NOT IN ('active', 'inactive');
```

### 4. force rule reload

restart the rust engine. the blackboard loads all active rules at startup:

```sh
cargo run -p scemas-server
```

### 5. verify alerts are being generated

```sql
SELECT id, rule_id, sensor_id, severity, status, triggered_value, zone, created_at
FROM alerts
ORDER BY created_at DESC
LIMIT 10;
```

### 6. check webhook delivery

if subscriptions have `webhook_url` set, look for delivery failures in rust engine logs:

```
grep "webhook dispatch failed" <log output>
```

### 7. if database errors

jump to [database-connection-failure.md](./database-connection-failure.md).

### 8. mark resolved failures

```sql
UPDATE ingestion_failures
SET status = 'resolved', resolved_at = now()
WHERE stage = 'alerting' AND status = 'pending';
```
