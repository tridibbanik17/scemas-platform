// root tRPC router
// maps to DataDistributionManager: composes all sub-routers and exposes data to PAC agents
// each router below maps to a controller or boundary from the UML class diagram

import { router } from './trpc'
import { authRouter } from './routers/auth'
import { telemetryRouter } from './routers/telemetry'
import { alertsRouter } from './routers/alerts'
import { rulesRouter } from './routers/rules'
import { subscriptionsRouter } from './routers/subscriptions'
import { usersRouter } from './routers/users'
import { publicRouter } from './routers/public'
import { healthRouter } from './routers/health'
import { auditRouter } from './routers/audit'

export const appRouter = router({
  auth: authRouter,              // AccessManager (repository pattern)
  telemetry: telemetryRouter,    // TelemetryManager (pipe-and-filter, proxies to rust)
  alerts: alertsRouter,          // AlertingManager read operations
  rules: rulesRouter,            // DefineThresholdRules boundary
  subscriptions: subscriptionsRouter, // ManageAlertSubscriptions boundary (innovative feature)
  users: usersRouter,            // ManageSecurityPermissions boundary
  public: publicRouter,          // ProvidePublicAPI boundary (abstraction: filtered data)
  health: healthRouter,          // MonitorSCEMASPlatformStatus boundary
  audit: auditRouter,            // AlertAndAuditLogDB viewer
})

export type AppRouter = typeof appRouter
