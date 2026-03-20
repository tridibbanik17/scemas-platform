import { z } from 'zod'

export const RoleSchema = z.enum(['operator', 'admin', 'viewer'])
export type Role = z.infer<typeof RoleSchema>

export const MetricTypeSchema = z.enum(['temperature', 'humidity', 'air_quality', 'noise_level'])
export type MetricType = z.infer<typeof MetricTypeSchema>

export const ComparisonSchema = z.enum(['gt', 'lt', 'gte', 'lte'])
export type Comparison = z.infer<typeof ComparisonSchema>

export const SeveritySchema = z.union([z.literal(1), z.literal(2), z.literal(3)])
export type Severity = z.infer<typeof SeveritySchema>

export const AlertStatusSchema = z.enum(['triggered', 'active', 'acknowledged', 'resolved'])
export type AlertStatus = z.infer<typeof AlertStatusSchema>

export const DeviceStatusSchema = z.enum(['active', 'inactive', 'revoked'])
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>

export const DeviceIdentitySchema = z.object({
  deviceId: z.string(),
  deviceType: MetricTypeSchema,
  zone: z.string(),
  status: DeviceStatusSchema,
})
export type DeviceIdentity = z.infer<typeof DeviceIdentitySchema>

export const RuleStatusSchema = z.enum(['active', 'inactive'])
export type RuleStatus = z.infer<typeof RuleStatusSchema>

export const SensorReadingSchema = z.object({
  sensorId: z.string().min(1),
  metricType: MetricTypeSchema,
  value: z.number(),
  zone: z.string().min(1),
  timestamp: z.string().datetime(),
})
export type SensorReading = z.infer<typeof SensorReadingSchema>

export const UserInformationSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  email: z.string().email(),
  role: RoleSchema,
})
export type UserInformation = z.infer<typeof UserInformationSchema>

export const ActiveSessionTokenSchema = z.object({
  tokenValue: z.string().min(1),
  userId: z.string().uuid(),
  role: RoleSchema,
  expiry: z.string().datetime(),
})
export type ActiveSessionToken = z.infer<typeof ActiveSessionTokenSchema>

export const AuthSessionSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  user: UserInformationSchema,
})
export type AuthSession = z.infer<typeof AuthSessionSchema>

export const ThresholdRuleSchema = z.object({
  id: z.string().uuid(),
  metricType: MetricTypeSchema,
  thresholdValue: z.number(),
  comparison: ComparisonSchema,
  zone: z.string().nullable(),
  ruleStatus: RuleStatusSchema,
})
export type ThresholdRule = z.infer<typeof ThresholdRuleSchema>

export const CreateThresholdRuleSchema = z.object({
  metricType: MetricTypeSchema,
  thresholdValue: z.number().positive(),
  comparison: ComparisonSchema,
  zone: z.string().nullable().optional(),
})
export type CreateThresholdRule = z.infer<typeof CreateThresholdRuleSchema>

export const AlertSchema = z.object({
  id: z.string().uuid(),
  ruleId: z.string().uuid(),
  sensorId: z.string(),
  severity: SeveritySchema,
  status: AlertStatusSchema,
  triggeredValue: z.number(),
  zone: z.string(),
  metricType: MetricTypeSchema,
  createdAt: z.string().datetime(),
  acknowledgedBy: z.string().uuid().nullable().optional(),
  acknowledgedAt: z.string().datetime().nullable().optional(),
})
export type Alert = z.infer<typeof AlertSchema>

export const AlertSubscriptionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  metricTypes: z.array(MetricTypeSchema),
  zones: z.array(z.string()),
  minSeverity: SeveritySchema,
})
export type AlertSubscription = z.infer<typeof AlertSubscriptionSchema>

export const UpdateAlertSubscriptionSchema = z.object({
  metricTypes: z.array(MetricTypeSchema).optional(),
  zones: z.array(z.string()).optional(),
  minSeverity: SeveritySchema.optional(),
})
export type UpdateAlertSubscription = z.infer<typeof UpdateAlertSubscriptionSchema>

export const SignupSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(8),
})
export type Signup = z.infer<typeof SignupSchema>

export const LoginSchema = z.object({ email: z.string().email(), password: z.string() })
export type Login = z.infer<typeof LoginSchema>

export const CreateAccountSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  role: RoleSchema,
})
export type CreateAccount = z.infer<typeof CreateAccountSchema>

export const UpdateAccountDetailsSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().min(3).max(50),
  email: z.string().email(),
})
export type UpdateAccountDetails = z.infer<typeof UpdateAccountDetailsSchema>

export const ZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
})
export type Zone = z.infer<typeof ZoneSchema>

export const PublicAggregationTypeSchema = z.enum(['5m_avg'])
export type PublicAggregationType = z.infer<typeof PublicAggregationTypeSchema>

export const PublicRankingStatSchema = z.enum(['current', 'avg', 'max'])
export type PublicRankingStat = z.infer<typeof PublicRankingStatSchema>

export const PublicZoneSummarySchema = z.object({
  zone: z.string(),
  zoneName: z.string(),
  aqi: z.number(),
  aqiLabel: z.string(),
  temperature: z.number().nullable(),
  humidity: z.number().nullable(),
  noiseLevel: z.number().nullable(),
  lastUpdated: z.string().datetime().nullable(),
  freshnessSeconds: z.number().int().nonnegative().nullable(),
})
export type PublicZoneSummary = z.infer<typeof PublicZoneSummarySchema>

export const PublicZoneCurrentSchema = PublicZoneSummarySchema
export type PublicZoneCurrent = z.infer<typeof PublicZoneCurrentSchema>

export const PublicZoneCurrentQuerySchema = z.object({ zoneId: z.string().min(1) })
export type PublicZoneCurrentQuery = z.infer<typeof PublicZoneCurrentQuerySchema>

export const PublicZoneHistoryPointSchema = z.object({
  zone: z.string(),
  zoneName: z.string(),
  metricType: MetricTypeSchema,
  aggregationType: PublicAggregationTypeSchema,
  time: z.string().datetime(),
  value: z.number(),
  sampleCount: z.number().int().nullable(),
})
export type PublicZoneHistoryPoint = z.infer<typeof PublicZoneHistoryPointSchema>

export const PublicZoneHistoryQuerySchema = z.object({
  zoneId: z.string().min(1),
  metricType: MetricTypeSchema,
  bucket: PublicAggregationTypeSchema.default('5m_avg'),
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
})
export type PublicZoneHistoryQuery = z.infer<typeof PublicZoneHistoryQuerySchema>

export const PublicRankingRowSchema = z.object({
  zone: z.string(),
  zoneName: z.string(),
  metricType: MetricTypeSchema,
  stat: PublicRankingStatSchema,
  value: z.number(),
  aggregationType: PublicAggregationTypeSchema,
  windowHours: z.number().int().positive(),
  lastUpdated: z.string().datetime().nullable(),
})
export type PublicRankingRow = z.infer<typeof PublicRankingRowSchema>

export const PublicRankingsQuerySchema = z.object({
  metricType: MetricTypeSchema,
  bucket: PublicAggregationTypeSchema.default('5m_avg'),
  periodHours: z.coerce.number().int().min(1).max(168).default(24),
  stat: PublicRankingStatSchema.default('current'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})
export type PublicRankingsQuery = z.infer<typeof PublicRankingsQuerySchema>

export const PublicMetricDescriptorSchema = z.object({
  metricType: MetricTypeSchema,
  label: z.string(),
  unit: z.string(),
  description: z.string(),
  supportedAggregations: z.array(PublicAggregationTypeSchema).min(1),
  updateCadenceSeconds: z.number().int().positive(),
})
export type PublicMetricDescriptor = z.infer<typeof PublicMetricDescriptorSchema>

export const PublicFeedStatusSchema = z.object({
  generatedAt: z.string().datetime(),
  aggregationType: PublicAggregationTypeSchema,
  zonesTotal: z.number().int().nonnegative(),
  zonesReporting: z.number().int().nonnegative(),
  zonesAwaitingTelemetry: z.array(z.string()),
  latestAggregateAt: z.string().datetime().nullable(),
  oldestAggregateAt: z.string().datetime().nullable(),
})
export type PublicFeedStatus = z.infer<typeof PublicFeedStatusSchema>

export const ZoneAQISchema = z.object({
  zone: z.string(),
  aqi: z.number(),
  label: z.string(),
  temperature: z.number().optional(),
  humidity: z.number().optional(),
})
export type ZoneAQI = z.infer<typeof ZoneAQISchema>
