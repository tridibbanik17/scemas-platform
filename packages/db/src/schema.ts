import { sql } from 'drizzle-orm'
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
  webhookUrl: text('webhook_url'),
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

export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    tokenHash: text('token_hash').notNull(),
    label: text('label').notNull(),
    prefix: text('prefix').notNull(),
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`ARRAY['read']`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    tokenHashIdx: uniqueIndex('api_tokens_token_hash_idx').on(table.tokenHash),
    accountExpiresIdx: index('api_tokens_account_expires_idx').on(table.accountId, table.expiresAt),
  }),
)

export const hazardReports = pgTable(
  'hazard_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    zone: text('zone').notNull(),
    category: text('category').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull().default('pending'),
    contactEmail: text('contact_email'),
    reportedBy: uuid('reported_by').references(() => accounts.id),
    reviewedBy: uuid('reviewed_by').references(() => accounts.id),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  table => ({
    statusCreatedAtIdx: index('hazard_reports_status_created_at_idx').on(
      table.status,
      table.createdAt,
    ),
    zoneStatusIdx: index('hazard_reports_zone_status_idx').on(table.zone, table.status),
  }),
)

export const oauthClients = pgTable(
  'oauth_clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: text('client_id').notNull(),
    clientSecretHash: text('client_secret_hash'),
    clientName: text('client_name').notNull(),
    redirectUris: text('redirect_uris').array().notNull(),
    grantTypes: text('grant_types')
      .array()
      .notNull()
      .default(sql`ARRAY['authorization_code','refresh_token']`),
    scope: text('scope').notNull().default('read'),
    clientUri: text('client_uri'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    clientIdIdx: uniqueIndex('oauth_clients_client_id_idx').on(table.clientId),
  }),
)

export const oauthCodes = pgTable(
  'oauth_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codeHash: text('code_hash').notNull(),
    clientId: text('client_id').notNull(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    redirectUri: text('redirect_uri').notNull(),
    scope: text('scope').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    codeHashIdx: uniqueIndex('oauth_codes_code_hash_idx').on(table.codeHash),
  }),
)

export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accessTokenHash: text('access_token_hash').notNull(),
    refreshTokenHash: text('refresh_token_hash'),
    clientId: text('client_id').notNull(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    scope: text('scope').notNull(),
    accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }).notNull(),
    refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    accessTokenHashIdx: uniqueIndex('oauth_tokens_access_hash_idx').on(table.accessTokenHash),
    refreshTokenHashIdx: uniqueIndex('oauth_tokens_refresh_hash_idx').on(table.refreshTokenHash),
    accountIdx: index('oauth_tokens_account_idx').on(table.accountId),
  }),
)

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
