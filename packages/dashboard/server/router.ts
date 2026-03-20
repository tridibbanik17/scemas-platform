// root tRPC router
// maps to DataDistributionManager: composes all sub-routers and exposes data to PAC agents
// each router below maps to a controller or boundary from the UML class diagram

import { alertsRouter } from './routers/alerts'
import { auditRouter } from './routers/audit'
import { authRouter } from './routers/auth'
import { healthRouter } from './routers/health'
import { publicRouter } from './routers/public'
import { rulesRouter } from './routers/rules'
import { subscriptionsRouter } from './routers/subscriptions'
import { telemetryRouter } from './routers/telemetry'
import { usersRouter } from './routers/users'
import { router } from './trpc'

export const appRouter = router({
  auth: authRouter, // AccessManager (repository pattern)
  telemetry: telemetryRouter, // TelemetryManager (pipe-and-filter, proxies to rust)
  alerts: alertsRouter, // AlertingManager read operations
  rules: rulesRouter, // DefineThresholdRules boundary
  subscriptions: subscriptionsRouter, // ManageAlertSubscriptions boundary (innovative feature)
  users: usersRouter, // ManageSecurityPermissions boundary
  public: publicRouter, // ProvidePublicAPI boundary (abstraction: filtered data)
  health: healthRouter, // MonitorSCEMASPlatformStatus boundary
  audit: auditRouter, // AlertAndAuditLogDB viewer
})

export type AppRouter = typeof appRouter
