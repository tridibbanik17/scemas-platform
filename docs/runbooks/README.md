# operational runbooks

incident response procedures for the four top operational failures (SRS MS-S2).

## quick reference

| symptom                                        | start here                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| no new sensor readings arriving                | [ingestion-failure.md](./ingestion-failure.md)                           |
| rust engine 500 errors, dashboard unresponsive | [database-connection-failure.md](./database-connection-failure.md)       |
| rules active but no alerts firing              | [alerting-evaluation-failure.md](./alerting-evaluation-failure.md)       |
| public API slow or timing out                  | [public-api-latency-degradation.md](./public-api-latency-degradation.md) |

## common entry points

- **admin health page** (`/health`): shows ingestion counters, failure logs, platform status history
- **rust health endpoint**: `curl http://localhost:3001/internal/health`
- **postgres**: `docker-compose exec postgres psql -U scemas`

## cascade pattern

many incidents share a root cause. database failures cascade into ingestion failures, alerting failures, and API degradation. if multiple symptoms appear simultaneously, start with [database-connection-failure.md](./database-connection-failure.md).
