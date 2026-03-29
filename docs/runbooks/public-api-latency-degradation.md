# public API latency degradation

the `/api/v1/` REST endpoints or public tRPC queries respond slower than the 500ms p95 target (SRS PR-SL3).

## detection symptoms

- `platform_status` rows show increasing `latency_ms`:

```sql
SELECT subsystem, latency_ms, time
FROM platform_status
ORDER BY time DESC
LIMIT 20;
```

- public API responses take >500ms. test directly:

```sh
time curl -s http://localhost:3000/api/v1/zones/aqi > /dev/null
```

- the dashboard itself feels sluggish (tRPC queries use the same drizzle client)
- in production, cloudflare container cold starts add 10-30 seconds on first request after idle

## likely causes

1. **analytics table scan cost**. the `DISTINCT ON (zone, metric_type)` queries scan the whole `analytics` table. as the table grows (one row per 5-minute bucket, per zone, per metric type), these get expensive
2. **missing or stale indexes**. the schema has `analytics_latest_aggregate_idx` and `analytics_bucket_unique_idx`, but query plans can degrade with table bloat
3. **cloudflare container cold start** (production). the durable object container sleeps after 30s of inactivity. a sleeping container pays the full rust binary boot cost on the first request
4. **connection pool overhead**. in cloudflare worker mode, each request may create a new postgres connection if hyperdrive isn't configured
5. **large response payloads**. `getPublicZoneSummary()` queries all zones and all metric types, then computes AQI in-memory. with many zones, this is O(zones \* metric_types)

## step-by-step mitigation

### 1. check analytics table size

```sql
SELECT pg_size_pretty(pg_total_relation_size('analytics'));
```

### 2. check the aggregation query performance

```sql
EXPLAIN ANALYZE
SELECT DISTINCT ON (zone, metric_type) zone, metric_type, aggregated_value, time
FROM analytics
WHERE aggregation_type = '5m_avg'
ORDER BY zone, metric_type, time DESC;
```

look at the execution time. if it's >100ms, the index isn't being used or the table is too large.

### 3. verify indexes exist

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'analytics';
```

expected indexes: `analytics_latest_aggregate_idx`, `analytics_bucket_unique_idx`.

### 4. reduce data retention for immediate relief

```sql
DELETE FROM analytics WHERE time < now() - interval '7 days';
VACUUM ANALYZE analytics;
```

### 5. check cache-control headers

```sh
curl -I http://localhost:3000/api/v1/zones/aqi
```

should show `Cache-Control: public, max-age=30, stale-while-revalidate=30`. if missing, the origin gets hit on every request.

### 6. cold start mitigation (production)

increase `sleepAfter` in `packages/api/src/worker.ts`, or add a synthetic keepalive ping (e.g. cron hitting the health endpoint every 20s).

### 7. if database connection issues

jump to [database-connection-failure.md](./database-connection-failure.md).
