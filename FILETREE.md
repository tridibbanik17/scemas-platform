scemas-platform/
├── .editorconfig
├── .env.example
├── .gitattributes
├── .github/
│   ├── README.md
│   └── workflows/
│       ├── ci.yml
│       ├── deploy.yml
│       ├── desktop-sync-check.yml
│       └── desktop.yml
├── .gitignore
├── .oxfmtrc.json
├── .oxlintrc.json
├── CONTRIBUTIONS.md
├── Cargo.lock
├── Cargo.toml
├── Dockerfile
├── INSTALL.md
├── bun.lock
├── crates/
│   ├── scemas-alerting/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── blackboard.rs
│   │       ├── controller.rs
│   │       ├── dispatcher.rs
│   │       ├── evaluator.rs
│   │       ├── lib.rs
│   │       └── lifecycle.rs
│   ├── scemas-cli/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs
│   │       ├── reload.rs
│   │       └── seed.rs
│   ├── scemas-core/
│   │   ├── Cargo.toml
│   │   ├── build.rs
│   │   └── src/
│   │       ├── config.rs
│   │       ├── error.rs
│   │       ├── lib.rs
│   │       ├── lifecycle.rs
│   │       ├── models.rs
│   │       ├── regions.catalog.json
│   │       └── regions.rs
│   ├── scemas-desktop/
│   │   ├── Cargo.toml
│   │   ├── Tauri.toml
│   │   ├── build.rs
│   │   ├── gen/
│   │   │   └── schemas/
│   │   │       ├── acl-manifests.json
│   │   │       ├── capabilities.json
│   │   │       ├── desktop-schema.json
│   │   │       └── macOS-schema.json
│   │   └── src/
│   │       ├── auth.rs
│   │       ├── commands/
│   │       │   ├── local.rs
│   │       │   ├── mod.rs
│   │       │   ├── reads.rs
│   │       │   └── remote.rs
│   │       ├── error.rs
│   │       ├── main.rs
│   │       ├── notifications.rs
│   │       ├── postgres.rs
│   │       ├── queries/
│   │       │   ├── alerts.rs
│   │       │   ├── audit.rs
│   │       │   ├── devices.rs
│   │       │   ├── health.rs
│   │       │   ├── mod.rs
│   │       │   ├── public.rs
│   │       │   ├── reports.rs
│   │       │   ├── rules.rs
│   │       │   ├── subscriptions.rs
│   │       │   ├── telemetry.rs
│   │       │   └── users.rs
│   │       ├── sync.rs
│   │       └── tray.rs
│   ├── scemas-server/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── access.rs
│   │       ├── distribution.rs
│   │       ├── lib.rs
│   │       ├── main.rs
│   │       ├── routes.rs
│   │       └── state.rs
│   └── scemas-telemetry/
│       ├── Cargo.toml
│       └── src/
│           ├── controller.rs
│           ├── health.rs
│           ├── ingest.rs
│           ├── lib.rs
│           └── validate.rs
├── data/
│   ├── hamilton-monitoring-regions.json
│   └── hamilton-sensor-catalog.json
├── docker-compose.yml
├── docs/
│   ├── D1.pdf
│   ├── D2.pdf
│   ├── D3.pdf
│   ├── README.md
│   ├── SCEMAS_Architecture_Overview.pdf
│   ├── architecture.md
│   ├── codebase.md
│   ├── diagrams/
│   │   ├── access_manager_controller.puml
│   │   ├── acknowledge_critical_env.puml
│   │   ├── alerting_management_controller.puml
│   │   ├── class_diagram.puml
│   │   ├── data_distribution_management_controller.puml
│   │   ├── define_alert_rule.puml
│   │   ├── encryption_manager.puml
│   │   ├── manage_alert_subscriptions.puml
│   │   ├── request_interpret_data.puml
│   │   ├── signup_and_login.puml
│   │   └── telemetry_management_controller.puml
│   ├── patterns.md
│   └── runbooks/
│       ├── README.md
│       ├── alerting-evaluation-failure.md
│       ├── database-connection-failure.md
│       ├── ingestion-failure.md
│       └── public-api-latency-degradation.md
├── flake.lock
├── flake.nix
├── package.json
├── packages/
│   ├── api/
│   │   ├── package.json
│   │   ├── src/
│   │   │   └── worker.ts
│   │   ├── worker-configuration.d.ts
│   │   └── wrangler.toml
│   ├── dashboard/
│   │   ├── app/
│   │   │   ├── (admin)/
│   │   │   │   ├── audit/
│   │   │   │   │   ├── audit-event-panel.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── devices/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── health/
│   │   │   │   │   ├── health-charts.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── reports/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── rules/
│   │   │   │   │   ├── [ruleId]/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   └── users/
│   │   │   │       ├── [userId]/
│   │   │   │       │   └── page.tsx
│   │   │   │       └── page.tsx
│   │   │   ├── (auth)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── oauth/
│   │   │   │   │   └── consent/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── sign-in/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── sign-up/
│   │   │   │       └── page.tsx
│   │   │   ├── (operator)/
│   │   │   │   ├── alerts/
│   │   │   │   │   ├── [alertId]/
│   │   │   │   │   │   ├── alert-actions.tsx
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── dashboard/
│   │   │   │   │   ├── dashboard-charts.tsx
│   │   │   │   │   ├── dashboard-lists.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── metrics/
│   │   │   │   │   ├── [zone]/
│   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   └── zone-time-series.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   └── subscriptions/
│   │   │   │       └── page.tsx
│   │   │   ├── (public)/
│   │   │   │   ├── api-explorer/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── display/
│   │   │   │   │   ├── hazard-report-section.tsx
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── public-display-settings.tsx
│   │   │   │   └── layout.tsx
│   │   │   ├── .well-known/
│   │   │   │   ├── oauth-authorization-server/
│   │   │   │   │   └── route.ts
│   │   │   │   └── oauth-protected-resource/
│   │   │   │       └── route.ts
│   │   │   ├── api/
│   │   │   │   ├── trpc/
│   │   │   │   │   └── [trpc]/
│   │   │   │   │       └── route.ts
│   │   │   │   └── v1/
│   │   │   │       ├── alerts/
│   │   │   │       │   ├── [alertId]/
│   │   │   │       │   │   ├── acknowledge/
│   │   │   │       │   │   │   └── route.ts
│   │   │   │       │   │   └── resolve/
│   │   │   │       │   │       └── route.ts
│   │   │   │       │   └── route.ts
│   │   │   │       ├── metrics/
│   │   │   │       │   └── route.ts
│   │   │   │       ├── openapi/
│   │   │   │       │   └── route.ts
│   │   │   │       ├── rankings/
│   │   │   │       │   └── route.ts
│   │   │   │       ├── rules/
│   │   │   │       │   └── route.ts
│   │   │   │       ├── status/
│   │   │   │       │   └── route.ts
│   │   │   │       ├── subscriptions/
│   │   │   │       │   └── route.ts
│   │   │   │       └── zones/
│   │   │   │           ├── [zoneId]/
│   │   │   │           │   ├── current/
│   │   │   │           │   │   └── route.ts
│   │   │   │           │   └── history/
│   │   │   │           │       └── route.ts
│   │   │   │           ├── aqi/
│   │   │   │           │   └── route.ts
│   │   │   │           └── list/
│   │   │   │               └── route.ts
│   │   │   ├── globals.css
│   │   │   ├── install-sw.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── llms.txt/
│   │   │   │   └── route.ts
│   │   │   ├── mcp/
│   │   │   │   └── route.ts
│   │   │   ├── not-found.tsx
│   │   │   ├── oauth/
│   │   │   │   ├── authorize/
│   │   │   │   │   ├── decision/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   ├── register/
│   │   │   │   │   └── route.ts
│   │   │   │   ├── revoke/
│   │   │   │   │   └── route.ts
│   │   │   │   └── token/
│   │   │   │       └── route.ts
│   │   │   └── page.tsx
│   │   ├── components.json
│   │   ├── components/
│   │   │   ├── admin/
│   │   │   │   ├── audit-log-list.tsx
│   │   │   │   ├── devices-manager.tsx
│   │   │   │   ├── reports-manager.tsx
│   │   │   │   ├── rule-actions.tsx
│   │   │   │   ├── rules-manager.tsx
│   │   │   │   ├── user-detail-form.tsx
│   │   │   │   └── users-manager.tsx
│   │   │   ├── auth/
│   │   │   │   ├── login-form.tsx
│   │   │   │   └── signup-form.tsx
│   │   │   ├── backend-status.tsx
│   │   │   ├── charts/
│   │   │   │   ├── alert-frequency-chart.tsx
│   │   │   │   ├── audit-event-chart.tsx
│   │   │   │   ├── ingestion-funnel-chart.tsx
│   │   │   │   ├── platform-health-chart.tsx
│   │   │   │   └── zone-metrics-chart.tsx
│   │   │   ├── copy-button.tsx
│   │   │   ├── layout/
│   │   │   │   ├── account-popover.tsx
│   │   │   │   ├── agent-shell.tsx
│   │   │   │   ├── header-breadcrumbs.tsx
│   │   │   │   ├── nav-links.tsx
│   │   │   │   ├── settings-panel.tsx
│   │   │   │   ├── sidebar-status.tsx
│   │   │   │   ├── sign-out-action.ts
│   │   │   │   └── sign-out-form.tsx
│   │   │   ├── list-pagination.tsx
│   │   │   ├── map/
│   │   │   │   └── zone-map.tsx
│   │   │   ├── operator/
│   │   │   │   ├── alerts-manager.tsx
│   │   │   │   ├── api-tokens-manager.tsx
│   │   │   │   ├── display-name-form.tsx
│   │   │   │   ├── metric-subagent-panels.tsx
│   │   │   │   ├── subscription-drawer.tsx
│   │   │   │   └── subscription-manager.tsx
│   │   │   ├── period-selector.tsx
│   │   │   ├── public/
│   │   │   │   ├── api-explorer.tsx
│   │   │   │   ├── hazard-report-form.tsx
│   │   │   │   ├── monitoring-region-directory.tsx
│   │   │   │   ├── zone-aqi-bar-chart.tsx
│   │   │   │   └── zone-aqi-grid.tsx
│   │   │   └── ui/
│   │   │       ├── accordion.tsx
│   │   │       ├── alert-dialog.tsx
│   │   │       ├── alert.tsx
│   │   │       ├── aspect-ratio.tsx
│   │   │       ├── avatar.tsx
│   │   │       ├── badge.tsx
│   │   │       ├── breadcrumb.tsx
│   │   │       ├── button-group.tsx
│   │   │       ├── button.tsx
│   │   │       ├── calendar.tsx
│   │   │       ├── card.tsx
│   │   │       ├── carousel.tsx
│   │   │       ├── chart.tsx
│   │   │       ├── checkbox.tsx
│   │   │       ├── collapsible.tsx
│   │   │       ├── combobox.tsx
│   │   │       ├── command.tsx
│   │   │       ├── context-menu.tsx
│   │   │       ├── dialog.tsx
│   │   │       ├── direction.tsx
│   │   │       ├── drawer.tsx
│   │   │       ├── dropdown-menu.tsx
│   │   │       ├── empty.tsx
│   │   │       ├── field.tsx
│   │   │       ├── hover-card.tsx
│   │   │       ├── input-group.tsx
│   │   │       ├── input-otp.tsx
│   │   │       ├── input.tsx
│   │   │       ├── item.tsx
│   │   │       ├── kbd.tsx
│   │   │       ├── label.tsx
│   │   │       ├── menubar.tsx
│   │   │       ├── native-select.tsx
│   │   │       ├── navigation-menu.tsx
│   │   │       ├── pagination.tsx
│   │   │       ├── popover.tsx
│   │   │       ├── progress.tsx
│   │   │       ├── radio-group.tsx
│   │   │       ├── resizable.tsx
│   │   │       ├── scroll-area.tsx
│   │   │       ├── select.tsx
│   │   │       ├── separator.tsx
│   │   │       ├── severity-badge.tsx
│   │   │       ├── sheet.tsx
│   │   │       ├── sidebar.tsx
│   │   │       ├── skeleton.tsx
│   │   │       ├── slider.tsx
│   │   │       ├── sonner.tsx
│   │   │       ├── spinner.tsx
│   │   │       ├── switch.tsx
│   │   │       ├── table.tsx
│   │   │       ├── tabs.tsx
│   │   │       ├── textarea.tsx
│   │   │       ├── toggle-group.tsx
│   │   │       ├── toggle.tsx
│   │   │       └── tooltip.tsx
│   │   ├── hooks/
│   │   │   └── use-mobile.ts
│   │   ├── lib/
│   │   │   ├── chart-utils.ts
│   │   │   ├── metric-panels.ts
│   │   │   ├── query-client.ts
│   │   │   ├── request-origin.ts
│   │   │   ├── sensor-catalog.ts
│   │   │   ├── session.ts
│   │   │   ├── settings.ts
│   │   │   ├── trpc-provider.tsx
│   │   │   ├── trpc-server.ts
│   │   │   ├── trpc.ts
│   │   │   ├── utils.ts
│   │   │   └── zones.ts
│   │   ├── middleware.ts
│   │   ├── next-env.d.ts
│   │   ├── next.config.ts
│   │   ├── open-next.config.ts
│   │   ├── package.json
│   │   ├── postcss.config.mjs
│   │   ├── public/
│   │   │   ├── favicon.svg
│   │   │   ├── fonts/
│   │   │   │   ├── TX-02-Black.woff2
│   │   │   │   ├── TX-02-Bold.woff2
│   │   │   │   ├── TX-02-Book.woff2
│   │   │   │   ├── TX-02-ExtraBold.woff2
│   │   │   │   ├── TX-02-ExtraLight.woff2
│   │   │   │   ├── TX-02-Light.woff2
│   │   │   │   ├── TX-02-Medium.woff2
│   │   │   │   ├── TX-02-Regular.woff2
│   │   │   │   ├── TX-02-Retina.woff2
│   │   │   │   ├── TX-02-SemiBold.woff2
│   │   │   │   ├── TX-02-SemiLight.woff2
│   │   │   │   └── TX-02-Thin.woff2
│   │   │   ├── manifest.webmanifest
│   │   │   └── sw.js
│   │   ├── server/
│   │   │   ├── api-tokens.ts
│   │   │   ├── cached.ts
│   │   │   ├── data-distribution-manager.ts
│   │   │   ├── env.ts
│   │   │   ├── handlers/
│   │   │   │   ├── alerts.ts
│   │   │   │   └── subscriptions.ts
│   │   │   ├── health.ts
│   │   │   ├── mcp-server.ts
│   │   │   ├── oauth.ts
│   │   │   ├── public-api.ts
│   │   │   ├── rate-limit.ts
│   │   │   ├── router.ts
│   │   │   ├── routers/
│   │   │   │   ├── alerts.ts
│   │   │   │   ├── api-tokens.ts
│   │   │   │   ├── audit.ts
│   │   │   │   ├── auth.ts
│   │   │   │   ├── devices.ts
│   │   │   │   ├── health.ts
│   │   │   │   ├── public.ts
│   │   │   │   ├── reports.ts
│   │   │   │   ├── rules.ts
│   │   │   │   ├── subscriptions.ts
│   │   │   │   ├── telemetry.ts
│   │   │   │   └── users.ts
│   │   │   ├── rust-client.ts
│   │   │   └── trpc.ts
│   │   ├── tsconfig.json
│   │   ├── worker-configuration.d.ts
│   │   └── wrangler.toml
│   ├── db/
│   │   ├── drizzle.config.ts
│   │   ├── migrations/
│   │   │   └── meta/
│   │   │       ├── 0000_snapshot.json
│   │   │       └── _journal.json
│   │   ├── package.json
│   │   ├── scripts/
│   │   │   ├── ensure-users.ts
│   │   │   └── sync-desktop-schema.ts
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── index.ts
│   │   │   └── schema.ts
│   │   └── tsconfig.json
│   ├── desktop/
│   │   ├── components.json
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── public/
│   │   │   └── favicon.svg
│   │   ├── src/
│   │   │   ├── app.css
│   │   │   ├── app.tsx
│   │   │   ├── components/
│   │   │   │   ├── copy-button.tsx
│   │   │   │   ├── list-pagination.tsx
│   │   │   │   ├── period-selector.tsx
│   │   │   │   ├── ui/
│   │   │   │   │   ├── accordion.tsx
│   │   │   │   │   ├── alert-dialog.tsx
│   │   │   │   │   ├── alert.tsx
│   │   │   │   │   ├── aspect-ratio.tsx
│   │   │   │   │   ├── avatar.tsx
│   │   │   │   │   ├── badge.tsx
│   │   │   │   │   ├── breadcrumb.tsx
│   │   │   │   │   ├── button-group.tsx
│   │   │   │   │   ├── button.tsx
│   │   │   │   │   ├── calendar.tsx
│   │   │   │   │   ├── card.tsx
│   │   │   │   │   ├── carousel.tsx
│   │   │   │   │   ├── chart.tsx
│   │   │   │   │   ├── checkbox.tsx
│   │   │   │   │   ├── collapsible.tsx
│   │   │   │   │   ├── combobox.tsx
│   │   │   │   │   ├── command.tsx
│   │   │   │   │   ├── context-menu.tsx
│   │   │   │   │   ├── dialog.tsx
│   │   │   │   │   ├── direction.tsx
│   │   │   │   │   ├── drawer.tsx
│   │   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   │   ├── empty.tsx
│   │   │   │   │   ├── field.tsx
│   │   │   │   │   ├── hover-card.tsx
│   │   │   │   │   ├── input-group.tsx
│   │   │   │   │   ├── input-otp.tsx
│   │   │   │   │   ├── input.tsx
│   │   │   │   │   ├── item.tsx
│   │   │   │   │   ├── kbd.tsx
│   │   │   │   │   ├── label.tsx
│   │   │   │   │   ├── menubar.tsx
│   │   │   │   │   ├── native-select.tsx
│   │   │   │   │   ├── navigation-menu.tsx
│   │   │   │   │   ├── pagination.tsx
│   │   │   │   │   ├── popover.tsx
│   │   │   │   │   ├── progress.tsx
│   │   │   │   │   ├── radio-group.tsx
│   │   │   │   │   ├── resizable.tsx
│   │   │   │   │   ├── scroll-area.tsx
│   │   │   │   │   ├── select.tsx
│   │   │   │   │   ├── separator.tsx
│   │   │   │   │   ├── severity-badge.tsx
│   │   │   │   │   ├── sheet.tsx
│   │   │   │   │   ├── sidebar.tsx
│   │   │   │   │   ├── skeleton.tsx
│   │   │   │   │   ├── slider.tsx
│   │   │   │   │   ├── sonner.tsx
│   │   │   │   │   ├── spinner.tsx
│   │   │   │   │   ├── switch.tsx
│   │   │   │   │   ├── table.tsx
│   │   │   │   │   ├── tabs.tsx
│   │   │   │   │   ├── textarea.tsx
│   │   │   │   │   ├── toggle-group.tsx
│   │   │   │   │   ├── toggle.tsx
│   │   │   │   │   └── tooltip.tsx
│   │   │   │   └── zone-map.tsx
│   │   │   ├── hooks/
│   │   │   │   └── use-mobile.ts
│   │   │   ├── layouts/
│   │   │   │   ├── console-layout.tsx
│   │   │   │   └── public-layout.tsx
│   │   │   ├── lib/
│   │   │   │   ├── chart-utils.ts
│   │   │   │   ├── settings.ts
│   │   │   │   ├── tauri.ts
│   │   │   │   ├── utils.ts
│   │   │   │   └── zones.ts
│   │   │   ├── main.tsx
│   │   │   ├── pages/
│   │   │   │   ├── alert-detail.tsx
│   │   │   │   ├── alerts.tsx
│   │   │   │   ├── audit.tsx
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── devices.tsx
│   │   │   │   ├── display.tsx
│   │   │   │   ├── health.tsx
│   │   │   │   ├── login.tsx
│   │   │   │   ├── metrics.tsx
│   │   │   │   ├── reports.tsx
│   │   │   │   ├── rules.tsx
│   │   │   │   ├── settings.tsx
│   │   │   │   ├── sign-in.tsx
│   │   │   │   ├── sign-up.tsx
│   │   │   │   ├── subscriptions.tsx
│   │   │   │   ├── users.tsx
│   │   │   │   └── zone-metrics.tsx
│   │   │   ├── router.tsx
│   │   │   └── store/
│   │   │       └── auth.ts
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   ├── pager/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── page.ts
│   │   │   ├── server.ts
│   │   │   └── worker.ts
│   │   ├── worker-configuration.d.ts
│   │   └── wrangler.toml
│   └── types/
│       ├── package.json
│       ├── src/
│       │   ├── index.ts
│       │   └── openapi.ts
│       └── tsconfig.json
├── rust-toolchain.toml
└── scripts/
    ├── bundle-postgres.sh
    ├── generate-monitoring-network.ts
    └── start-scemas.sh
