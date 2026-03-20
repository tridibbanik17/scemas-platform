import {
  pgTable,
  uuid,
  text,
  timestamp,
  doublePrecision,
  integer,
  serial,
  jsonb,
  bigint,
  bigserial,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').unique().notNull(),
    username: text('username').unique().notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('operator'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    roleCreatedAtIdx: index('accounts_role_created_at_idx').on(table.role, table.createdAt),
  }),
)

export const devices = pgTable(
  'devices',
  {
    deviceId: text('device_id').primaryKey(),
    deviceType: text('device_type').notNull(),
    zone: text('zone').notNull(),
    status: text('status').notNull().default('active'),
    registeredAt: timestamp('registered_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({ zoneStatusIdx: index('devices_zone_status_idx').on(table.zone, table.status) }),
)

export const activeSessionTokens = pgTable(
  'active_session_tokens',
  {
    tokenValue: text('token_value').primaryKey(),
    userId: uuid('user_id')
      .references(() => accounts.id)
      .notNull(),
    role: text('role').notNull(),
    expiry: timestamp('expiry', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    userExpiryIdx: index('active_session_tokens_user_expiry_idx').on(table.userId, table.expiry),
  }),
)

export const sensorReadings = pgTable(
  'sensor_readings',
  {
    id: serial('id').primaryKey(),
    sensorId: text('sensor_id').notNull(),
    metricType: text('metric_type').notNull(),
    value: doublePrecision('value').notNull(),
    zone: text('zone').notNull(),
    time: timestamp('time', { withTimezone: true }).notNull(),
  },
  table => ({
    sensorTimeIdx: index('sensor_readings_sensor_time_idx').on(table.sensorId, table.time),
    zoneMetricTimeIdx: index('sensor_readings_zone_metric_time_idx').on(
      table.zone,
      table.metricType,
      table.time,
    ),
  }),
)

export const thresholdRules = pgTable(
  'threshold_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    metricType: text('metric_type').notNull(),
    thresholdValue: doublePrecision('threshold_value').notNull(),
    comparison: text('comparison').notNull(),
    zone: text('zone'),
    ruleStatus: text('rule_status').notNull().default('active'),
    createdBy: uuid('created_by').references(() => accounts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    statusMetricZoneIdx: index('threshold_rules_status_metric_zone_idx').on(
      table.ruleStatus,
      table.metricType,
      table.zone,
    ),
  }),
)

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ruleId: uuid('rule_id').references(() => thresholdRules.id),
    sensorId: text('sensor_id').notNull(),
    severity: integer('severity').notNull(),
    status: text('status').notNull().default('triggered'),
    triggeredValue: doublePrecision('triggered_value').notNull(),
    zone: text('zone').notNull(),
    metricType: text('metric_type').notNull(),
    acknowledgedBy: uuid('acknowledged_by').references(() => accounts.id),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    statusCreatedAtIdx: index('alerts_status_created_at_idx').on(table.status, table.createdAt),
    zoneStatusCreatedAtIdx: index('alerts_zone_status_created_at_idx').on(
      table.zone,
      table.status,
      table.createdAt,
    ),
  }),
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').references(() => accounts.id),
    action: text('action').notNull(),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    actionCreatedAtIdx: index('audit_logs_action_created_at_idx').on(table.action, table.createdAt),
  }),
)

export const alertSubscriptions = pgTable('alert_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => accounts.id)
    .notNull()
    .unique(),
  metricTypes: text('metric_types').array(),
  zones: text('zones').array(),
  minSeverity: integer('min_severity').default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const analytics = pgTable(
  'analytics',
  {
    id: serial('id').primaryKey(),
    zone: text('zone').notNull(),
    metricType: text('metric_type').notNull(),
    aggregatedValue: doublePrecision('aggregated_value').notNull(),
    aggregationType: text('aggregation_type').notNull(),
    sampleCount: integer('sample_count'),
    sampleSum: doublePrecision('sample_sum'),
    time: timestamp('time', { withTimezone: true }).notNull(),
  },
  table => ({
    latestAggregateIdx: index('analytics_latest_aggregate_idx').on(
      table.aggregationType,
      table.zone,
      table.metricType,
      table.time,
    ),
    bucketUniq: uniqueIndex('analytics_bucket_unique_idx').on(
      table.zone,
      table.metricType,
      table.aggregationType,
      table.time,
    ),
  }),
)

export const ingestionFailures = pgTable(
  'ingestion_failures',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    stage: text('stage').notNull(),
    sensorId: text('sensor_id').notNull(),
    metricType: text('metric_type').notNull(),
    zone: text('zone').notNull(),
    payload: jsonb('payload').notNull(),
    error: text('error').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  table => ({
    statusCreatedAtIdx: index('ingestion_failures_status_created_at_idx').on(
      table.status,
      table.createdAt,
    ),
    stageCreatedAtIdx: index('ingestion_failures_stage_created_at_idx').on(
      table.stage,
      table.createdAt,
    ),
  }),
)

export const ingestionCounters = pgTable('ingestion_counters', {
  subsystem: text('subsystem').primaryKey(),
  totalReceived: bigint('total_received', { mode: 'number' }).notNull().default(0),
  totalAccepted: bigint('total_accepted', { mode: 'number' }).notNull().default(0),
  totalRejected: bigint('total_rejected', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const platformStatus = pgTable(
  'platform_status',
  {
    id: serial('id').primaryKey(),
    subsystem: text('subsystem').notNull(),
    status: text('status').notNull(),
    uptime: doublePrecision('uptime'),
    latencyMs: doublePrecision('latency_ms'),
    errorRate: doublePrecision('error_rate'),
    time: timestamp('time', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    subsystemTimeIdx: index('platform_status_subsystem_time_idx').on(table.subsystem, table.time),
  }),
)
