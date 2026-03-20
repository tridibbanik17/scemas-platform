# spec compliance fixes

## status: complete

all 5 phases implemented. `bun run typecheck` and `cargo check` pass. rust tests pass (13/13).

## what changed

### phase 1: severity color-coding (LF-A3)
- new `components/ui/severity-badge.tsx` — colored pill (green/amber/red) for severity 1/2/3
- wired into: alerts-manager, alert detail page, dashboard ActiveAlertsPanel

### phase 2: zone map (LF-A1)
- new `components/map/zone-map.tsx` — maplibre map centered on hamilton, markers color-coded by zone alert status
- integrated into operator dashboard above the sensor feed

### phase 3: inline subscriptions (UH-EOU3) + alert detail actions
- new `components/operator/subscription-drawer.tsx` — Sheet wrapping existing SubscriptionManager
- added to operator layout sidebar via `navExtra` prop on AgentShell
- new `app/(operator)/alerts/[alertId]/alert-actions.tsx` — acknowledge/resolve buttons on alert detail page

### phase 4: type-system consistency
- added `DeviceIdentitySchema` to `@scemas/types`
- added `IngestionFailure` struct to `scemas-core/models.rs`

### phase 5: minor spec compliance
- `ROUND(..., 2)::float8` on aggregation upsert in distribution.rs (PR-PA2)
- TLS context note on encryption_manager.puml (SR-INT1)

## files touched
- 4 new files, ~10 modified files, 0 deleted
