mod reload;
mod seed;

use chrono::{DateTime, Utc};
use clap::{Args, CommandFactory, Parser, Subcommand, ValueEnum};
use clap_complete::{Shell, generate};
use reload::EngineRuntime;
use scemas_core::config::Config;
use scemas_core::models::{
    AlertStatus, Comparison, MetricType, ParseModelError, RuleStatus, Severity, ThresholdRule,
};
use scemas_core::regions;
use scemas_server::{RuntimeError, ScemasRuntime};
use seed::SeedArgs;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::env;
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{self, IsTerminal, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::str::FromStr;
use std::time::Duration;
use tokio::process::{Child, Command as TokioCommand};
use uuid::Uuid;

const CLI_LONG_ABOUT: &str = "\
local control plane for the scemas workspace.

use this binary to start the local stack, inspect operational state, manage
alerting resources, and generate shell completions without relying on old shell
aliases or dashboard-only flows.";

const CLI_AFTER_LONG_HELP: &str = "\
examples:
  scemas dev
  scemas dev --reload
  scemas dev seed --spike
  scemas health --output json
  scemas rules list --output json
  scemas alerts list --status active

environment:
  DATABASE_URL       rust runtime database connection
  PGDATA             local postgres data dir (default: <repo>/.pgdata)
  PGPORT             local postgres port (default: 5432)
  RUST_LOG           tracing filter, --debug adds debug logs on top
  SCEMAS_API_URL     optional remote dashboard api base url
  SCEMAS_API_TOKEN   optional bearer token for remote mode";

const DEV_AFTER_LONG_HELP: &str = "\
examples:
  scemas dev
  scemas dev --reload
  scemas dev desktop
  scemas dev seed --rate 4 --spike-ratio 0.1
  scemas dev engine --reload
  scemas dev check";

#[derive(Parser, Debug)]
#[command(
    name = "scemas",
    bin_name = "scemas",
    about = "agent-friendly local control plane for scemas",
    long_about = CLI_LONG_ABOUT,
    after_long_help = CLI_AFTER_LONG_HELP,
    version
)]
struct Cli {
    #[arg(
        long,
        global = true,
        help = "enable debug logging for subprocesses and postgres diagnostics"
    )]
    debug: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// local development workflow and process orchestration
    Dev(DevCommandArgs),
    /// generate shell completion code for bash, zsh, or fish
    Completion(CompletionArgs),
    /// inspect ingestion counters and platform status
    Health(HealthArgs),
    /// inspect and manage threshold alert rules
    Rules {
        #[command(subcommand)]
        command: RuleCommands,
    },
    /// inspect and manage active alerts
    Alerts {
        #[command(subcommand)]
        command: AlertCommands,
    },
    /// create api tokens for dashboard or agent access
    Tokens {
        #[command(subcommand)]
        command: TokenCommands,
    },
}

#[derive(Args, Debug)]
#[command(after_long_help = DEV_AFTER_LONG_HELP)]
struct DevCommandArgs {
    #[command(flatten)]
    up: DevRunArgs,

    #[command(subcommand)]
    command: Option<DevCommands>,
}

#[derive(Subcommand, Debug)]
enum DevCommands {
    /// start the local stack, postgres checks, rust engine, and dashboard
    Up(DevRunArgs),
    /// run only the rust engine process
    Engine(DevRunArgs),
    /// run only the next.js dashboard dev server
    Dashboard,
    /// start the desktop app (postgres + vite + tauri dev)
    Desktop,
    /// continuously emit simulated sensor readings into the ingest pipeline
    Seed(SeedArgs),
    /// run the webhook echo script with passthrough arguments
    Webhook(PassthroughArgs),
    /// run formatter, clippy, and dashboard typecheck
    Check,
}

#[derive(Args, Debug, Clone, Copy)]
struct DevRunArgs {
    #[arg(long, help = "restart scemas-server when rust/data files change")]
    reload: bool,
}

#[derive(Subcommand, Debug)]
enum RuleCommands {
    /// list threshold rules
    List(ListArgs),
    /// create a new threshold rule
    Create(CreateRuleArgs),
    /// edit an existing threshold rule
    Edit(EditRuleArgs),
    /// change a rule between active and inactive
    SetStatus(SetRuleStatusArgs),
    /// delete a threshold rule
    Delete(DeleteRuleArgs),
}

#[derive(Subcommand, Debug)]
enum AlertCommands {
    /// list alerts, optionally filtered by status
    List(ListAlertsArgs),
    /// acknowledge an alert
    Acknowledge(AlertActorArgs),
    /// resolve an alert
    Resolve(AlertActorArgs),
}

#[derive(Subcommand, Debug)]
enum TokenCommands {
    /// create a new api token for an account
    Create(CreateTokenArgs),
}

#[derive(Args, Debug, Clone)]
struct OutputArgs {
    #[arg(long, value_enum, default_value_t = OutputFormat::Text, help = "render output as text or json")]
    output: OutputFormat,

    #[arg(long, conflicts_with_all = ["output", "raw"], help = "shorthand for --output json")]
    json: bool,

    #[arg(long, conflicts_with_all = ["output", "json"], help = "shorthand for --output text")]
    raw: bool,
}

impl OutputArgs {
    fn format(&self) -> OutputFormat {
        if self.json {
            OutputFormat::Json
        } else if self.raw {
            OutputFormat::Text
        } else {
            self.output
        }
    }
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, ValueEnum)]
enum OutputFormat {
    Text,
    Json,
}

#[derive(Args, Debug)]
struct PassthroughArgs {
    #[arg(
        trailing_var_arg = true,
        allow_hyphen_values = true,
        help = "arguments passed through to the underlying script"
    )]
    args: Vec<String>,
}

#[derive(Args, Debug)]
struct HealthArgs {
    #[command(flatten)]
    output: OutputArgs,

    #[arg(
        long,
        default_value_t = 10,
        help = "number of platform_status rows to include"
    )]
    limit: i64,
}

#[derive(Args, Debug)]
struct CompletionArgs {
    #[arg(value_enum, help = "shell to generate completion code for")]
    shell: Shell,
}

#[derive(Args, Debug)]
struct ListArgs {
    #[command(flatten)]
    output: OutputArgs,

    #[arg(long, default_value_t = 50, help = "maximum number of rows to return")]
    limit: i64,
}

#[derive(Args, Debug)]
struct ListAlertsArgs {
    #[command(flatten)]
    output: OutputArgs,

    #[arg(
        long,
        default_value_t = 50,
        help = "maximum number of alerts to return"
    )]
    limit: i64,

    #[arg(long, value_parser = parse_alert_status, help = "filter alerts by lifecycle status")]
    status: Option<AlertStatus>,
}

#[derive(Args, Debug)]
struct CreateRuleArgs {
    #[command(flatten)]
    output: OutputArgs,

    #[arg(long, value_parser = parse_metric_type)]
    metric_type: MetricType,

    #[arg(long)]
    threshold_value: f64,

    #[arg(long, value_parser = parse_comparison)]
    comparison: Comparison,

    #[arg(long)]
    zone: Option<String>,

    #[arg(long)]
    created_by: Uuid,
}

#[derive(Args, Debug)]
struct EditRuleArgs {
    #[command(flatten)]
    output: OutputArgs,

    #[arg(long)]
    id: Uuid,

    #[arg(long, value_parser = parse_metric_type)]
    metric_type: MetricType,

    #[arg(long)]
    threshold_value: f64,

    #[arg(long, value_parser = parse_comparison)]
    comparison: Comparison,

    #[arg(long)]
    zone: Option<String>,

    #[arg(long)]
    updated_by: Uuid,
}

#[derive(Args, Debug)]
struct SetRuleStatusArgs {
    #[command(flatten)]
    output: OutputArgs,

    #[arg(long)]
    id: Uuid,

    #[arg(long, value_parser = parse_rule_status)]
    status: RuleStatus,

    #[arg(long)]
    updated_by: Uuid,
}

#[derive(Args, Debug)]
struct DeleteRuleArgs {
    #[command(flatten)]
    output: OutputArgs,

    #[arg(long)]
    id: Uuid,

    #[arg(long)]
    deleted_by: Uuid,
}

#[derive(Args, Debug)]
struct AlertActorArgs {
    #[command(flatten)]
    output: OutputArgs,

    #[arg(long)]
    id: Uuid,

    #[arg(long)]
    user_id: Uuid,
}

#[derive(Args, Debug)]
struct CreateTokenArgs {
    #[command(flatten)]
    output: OutputArgs,

    #[arg(long)]
    account_id: Uuid,

    #[arg(long)]
    label: String,

    #[arg(long, value_delimiter = ',')]
    scopes: Option<Vec<String>>,
}

#[derive(Debug, thiserror::Error)]
enum CliError {
    #[error(transparent)]
    Core(#[from] scemas_core::error::Error),

    #[error(transparent)]
    Runtime(#[from] RuntimeError),

    #[error(transparent)]
    Database(#[from] sqlx::Error),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),

    #[error(transparent)]
    ParseModel(#[from] ParseModelError),

    #[error("missing required command on PATH: {0}")]
    MissingCommand(String),

    #[error("could not find the scemas workspace root from the current directory")]
    ProjectRootNotFound,

    #[error("command failed: {program} (exit code: {code})")]
    CommandFailed { program: String, code: String },

    #[error("{process} exited unexpectedly (exit code: {code})")]
    ChildExited { process: &'static str, code: String },

    #[error("remote API error (status {status}): {body}")]
    RemoteApi { status: u16, body: String },

    #[error(transparent)]
    Http(#[from] reqwest::Error),
}

struct RemoteClient {
    base_url: String,
    token: String,
    client: reqwest::Client,
}

impl RemoteClient {
    async fn get_json(&self, path: &str) -> Result<serde_json::Value, CliError> {
        let response = self
            .client
            .get(format!("{}{path}", self.base_url))
            .bearer_auth(&self.token)
            .send()
            .await?;

        let status = response.status();
        let body = response.text().await?;

        if !status.is_success() {
            return Err(CliError::RemoteApi {
                status: status.as_u16(),
                body,
            });
        }

        serde_json::from_str(&body).map_err(CliError::from)
    }

    async fn post_json(
        &self,
        path: &str,
        body: &impl Serialize,
    ) -> Result<serde_json::Value, CliError> {
        let response = self
            .client
            .post(format!("{}{path}", self.base_url))
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await?;

        if !status.is_success() {
            return Err(CliError::RemoteApi {
                status: status.as_u16(),
                body: text,
            });
        }

        serde_json::from_str(&text).map_err(CliError::from)
    }
}

enum Backend {
    Local(ScemasRuntime),
    Remote(RemoteClient),
}

fn load_backend_config() -> Option<(String, String)> {
    let url = env::var("SCEMAS_API_URL").ok()?;
    let token = env::var("SCEMAS_API_TOKEN").ok()?;
    Some((url, token))
}

async fn load_backend() -> Result<Backend, CliError> {
    if let Some((base_url, token)) = load_backend_config() {
        return Ok(Backend::Remote(RemoteClient {
            base_url,
            token,
            client: reqwest::Client::new(),
        }));
    }

    let runtime = load_runtime().await?;
    Ok(Backend::Local(runtime))
}

#[tokio::main]
async fn main() -> Result<(), CliError> {
    let cli = Cli::parse();
    let debug = cli.debug;
    init_cli_tracing(debug);

    match cli.command {
        Commands::Completion(args) => handle_completion(args),
        command => {
            let root = find_project_root()?;
            env::set_current_dir(&root)?;
            load_dotenv(&root);

            match command {
                Commands::Dev(args) => handle_dev(args, &root, debug).await,
                Commands::Health(args) => handle_health(args).await,
                Commands::Rules { command } => handle_rules(command).await,
                Commands::Alerts { command } => handle_alerts(command).await,
                Commands::Tokens { command } => handle_tokens(command).await,
                Commands::Completion(_) => Ok(()),
            }
        }
    }
}

fn init_cli_tracing(debug: bool) {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    let env_filter = if debug {
        env_filter.add_directive(tracing_subscriber::filter::LevelFilter::DEBUG.into())
    } else {
        env_filter
    };

    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_ansi(io::stderr().is_terminal())
        .try_init()
        .ok();
}

fn handle_completion(args: CompletionArgs) -> Result<(), CliError> {
    let mut command = Cli::command();
    let command_name = command.get_name().to_owned();
    generate(args.shell, &mut command, command_name, &mut io::stdout());
    Ok(())
}

async fn handle_dev(args: DevCommandArgs, root: &Path, debug: bool) -> Result<(), CliError> {
    ensure_env_file(root)?;
    load_dotenv(root);

    let command = resolve_dev_command(args);

    match command {
        DevCommands::Up(args) => {
            ensure_first_time_setup(root)?;
            dev_up(root, debug, args).await
        }
        DevCommands::Engine(args) => run_engine_command(root, args).await,
        DevCommands::Dashboard => {
            ensure_first_time_setup(root)?;
            run_checked(
                root,
                "bun",
                &[
                    OsString::from("--filter"),
                    OsString::from("@scemas/dashboard"),
                    OsString::from("dev"),
                ],
            )
        }
        DevCommands::Desktop => {
            ensure_first_time_setup(root)?;
            dev_desktop(root, debug).await
        }
        DevCommands::Seed(args) => seed::run(root, args).await,
        DevCommands::Webhook(args) => {
            ensure_first_time_setup(root)?;
            run_script(root, "webhook-echo.ts", &args.args)
        }
        DevCommands::Check => {
            ensure_first_time_setup(root)?;
            dev_check(root)
        }
    }
}

fn resolve_dev_command(args: DevCommandArgs) -> DevCommands {
    args.command.unwrap_or(DevCommands::Up(args.up))
}

fn load_dotenv(root: &Path) {
    let _ = dotenvy::from_path_override(root.join(".env"));
}

fn ensure_env_file(root: &Path) -> Result<(), CliError> {
    let env_path = root.join(".env");
    let env_example = root.join(".env.example");
    if !env_path.is_file() && env_example.is_file() {
        fs::copy(&env_example, &env_path)?;
        tracing::info!("created .env from .env.example");
    }

    Ok(())
}

fn ensure_first_time_setup(root: &Path) -> Result<(), CliError> {
    ensure_env_file(root)?;

    let sentinel = root.join(".derived");
    if sentinel.is_file() {
        return Ok(());
    }

    tracing::info!("first-time setup");

    run_checked(root, "bun", &[OsString::from("install")])?;
    fs::write(sentinel, b"")?;
    tracing::info!("first-time setup complete");

    Ok(())
}

async fn handle_health(args: HealthArgs) -> Result<(), CliError> {
    let backend = load_backend().await?;

    match backend {
        Backend::Remote(client) => {
            let status: serde_json::Value = client.get_json("/api/v1/status").await?;
            print_output(args.output.format(), &status, |v| {
                format!(
                    "zones reporting={}/{} generated={}",
                    v.get("zonesReporting")
                        .and_then(|x| x.as_i64())
                        .unwrap_or(0),
                    v.get("zonesTotal").and_then(|x| x.as_i64()).unwrap_or(0),
                    v.get("generatedAt").and_then(|x| x.as_str()).unwrap_or("?"),
                )
            })
        }
        Backend::Local(runtime) => {
            let (total_received, total_accepted, total_rejected) =
                runtime.distribution.load_ingestion_counters().await?;
            let rows: Vec<PlatformStatusRow> = sqlx::query_as(
                "SELECT subsystem, status, uptime, latency_ms, error_rate, time
                 FROM platform_status
                 ORDER BY time DESC
                 LIMIT $1",
            )
            .bind(args.limit)
            .fetch_all(&runtime.pool)
            .await?;

            let report = HealthReport {
                ingestion_counters: IngestionCounters {
                    total_received,
                    total_accepted,
                    total_rejected,
                },
                platform_status: rows.into_iter().map(PlatformStatusView::from).collect(),
            };

            print_output(args.output.format(), &report, |value| {
                let latest_status = value
                    .platform_status
                    .first()
                    .map(|status| {
                        format!(
                            "latest {}={} at {}",
                            status.subsystem, status.status, status.time
                        )
                    })
                    .unwrap_or_else(|| "no platform status rows recorded".to_owned());
                format!(
                    "ingestion received={} accepted={} rejected={}\n{}",
                    value.ingestion_counters.total_received,
                    value.ingestion_counters.total_accepted,
                    value.ingestion_counters.total_rejected,
                    latest_status,
                )
            })
        }
    }
}

async fn handle_rules(command: RuleCommands) -> Result<(), CliError> {
    let backend = load_backend().await?;

    match command {
        RuleCommands::List(args) => match backend {
            Backend::Remote(client) => {
                let rules: Vec<RemoteRule> =
                    serde_json::from_value(client.get_json("/api/v1/rules").await?)?;
                print_output(args.output.format(), &rules, |value| {
                    if value.is_empty() {
                        return "no rules found".to_owned();
                    }
                    value
                        .iter()
                        .map(|r| {
                            format!(
                                "{} {} {} {} zone={} status={}",
                                r.id,
                                r.metric_type,
                                r.comparison,
                                r.threshold_value,
                                r.zone.as_deref().unwrap_or("all_zones"),
                                r.rule_status,
                            )
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                })
            }
            Backend::Local(runtime) => {
                let rows: Vec<ThresholdRuleRow> = sqlx::query_as(
                    "SELECT id, metric_type, threshold_value, comparison, zone, rule_status
                     FROM threshold_rules
                     ORDER BY created_at DESC
                     LIMIT $1",
                )
                .bind(args.limit)
                .fetch_all(&runtime.pool)
                .await?;

                let rules = rows
                    .into_iter()
                    .map(TryInto::try_into)
                    .collect::<Result<Vec<ThresholdRule>, CliError>>()?;

                print_output(args.output.format(), &rules, |value| {
                    format_rule_list(value.as_slice())
                })
            }
        },
        RuleCommands::Create(args) => {
            let Backend::Local(runtime) = backend else {
                tracing::warn!("rule creation requires local access (no SCEMAS_API_URL)");
                return Ok(());
            };
            let rule = runtime
                .alerting
                .create_rule(
                    args.metric_type,
                    args.threshold_value,
                    args.comparison,
                    args.zone,
                    args.created_by,
                )
                .await?;

            print_output(args.output.format(), &rule, |value| {
                format!(
                    "created rule {} {} {} {} {}",
                    value.id,
                    value.metric_type,
                    value.comparison,
                    value.threshold_value,
                    value.zone.as_deref().unwrap_or("all_zones"),
                )
            })
        }
        RuleCommands::Edit(args) => {
            let Backend::Local(runtime) = backend else {
                tracing::warn!("rule editing requires local access (no SCEMAS_API_URL)");
                return Ok(());
            };
            let rule = runtime
                .alerting
                .edit_rule(
                    args.id,
                    args.metric_type,
                    args.threshold_value,
                    args.comparison,
                    args.zone,
                    args.updated_by,
                )
                .await?;

            print_output(args.output.format(), &rule, |value| {
                format!(
                    "edited rule {} now {} {}",
                    value.id, value.metric_type, value.comparison
                )
            })
        }
        RuleCommands::SetStatus(args) => {
            let Backend::Local(runtime) = backend else {
                tracing::warn!("rule status change requires local access (no SCEMAS_API_URL)");
                return Ok(());
            };
            runtime
                .alerting
                .update_rule_status(args.id, args.status.clone(), args.updated_by)
                .await?;

            let response = SuccessResponse {
                success: true,
                id: args.id,
                action: format!("set status to {}", args.status),
            };

            print_output(args.output.format(), &response, |value| {
                format!("rule {} {}", value.id, value.action)
            })
        }
        RuleCommands::Delete(args) => {
            let Backend::Local(runtime) = backend else {
                tracing::warn!("rule deletion requires local access (no SCEMAS_API_URL)");
                return Ok(());
            };
            runtime
                .alerting
                .delete_rule(args.id, args.deleted_by)
                .await?;

            let response = SuccessResponse {
                success: true,
                id: args.id,
                action: "deleted".to_owned(),
            };

            print_output(args.output.format(), &response, |value| {
                format!("rule {} {}", value.id, value.action)
            })
        }
    }
}

async fn handle_alerts(command: AlertCommands) -> Result<(), CliError> {
    let backend = load_backend().await?;

    match command {
        AlertCommands::List(args) => match backend {
            Backend::Remote(client) => {
                let mut query = format!("?limit={}", args.limit);
                if let Some(ref status) = args.status {
                    query = format!("{query}&status={status}");
                }
                let alerts: Vec<RemoteAlert> = serde_json::from_value(
                    client.get_json(&format!("/api/v1/alerts{query}")).await?,
                )?;
                print_output(args.output.format(), &alerts, |value| {
                    if value.is_empty() {
                        return "no alerts found".to_owned();
                    }
                    value
                        .iter()
                        .map(|a| {
                            format!(
                                "{} {} sev={} {} value={} zone={} sensor={}",
                                a.id,
                                a.status,
                                a.severity,
                                a.metric_type,
                                a.triggered_value,
                                a.zone,
                                a.sensor_id,
                            )
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                })
            }
            Backend::Local(runtime) => {
                let rows = if let Some(status) = args.status {
                    sqlx::query_as::<_, AlertRow>(
                        "SELECT id, rule_id, sensor_id, severity, status, triggered_value, zone, metric_type, created_at, acknowledged_by, acknowledged_at, resolved_at
                         FROM alerts
                         WHERE status = $1
                         ORDER BY created_at DESC
                         LIMIT $2",
                    )
                    .bind(status.to_string())
                    .bind(args.limit)
                    .fetch_all(&runtime.pool)
                    .await?
                } else {
                    sqlx::query_as::<_, AlertRow>(
                        "SELECT id, rule_id, sensor_id, severity, status, triggered_value, zone, metric_type, created_at, acknowledged_by, acknowledged_at, resolved_at
                         FROM alerts
                         ORDER BY created_at DESC
                         LIMIT $1",
                    )
                    .bind(args.limit)
                    .fetch_all(&runtime.pool)
                    .await?
                };

                let alerts = rows
                    .into_iter()
                    .map(TryInto::try_into)
                    .collect::<Result<Vec<AlertView>, CliError>>()?;

                print_output(args.output.format(), &alerts, |value| {
                    format_alert_list(value.as_slice())
                })
            }
        },
        AlertCommands::Acknowledge(args) => match backend {
            Backend::Remote(client) => {
                let _: serde_json::Value = client
                    .post_json(
                        &format!("/api/v1/alerts/{}/acknowledge", args.id),
                        &serde_json::json!({}),
                    )
                    .await?;
                let response = SuccessResponse {
                    success: true,
                    id: args.id,
                    action: "acknowledged".to_owned(),
                };
                print_output(args.output.format(), &response, |value| {
                    format!("alert {} {}", value.id, value.action)
                })
            }
            Backend::Local(runtime) => {
                runtime
                    .alerting
                    .acknowledge_alert(args.id, args.user_id)
                    .await?;
                let response = SuccessResponse {
                    success: true,
                    id: args.id,
                    action: "acknowledged".to_owned(),
                };
                print_output(args.output.format(), &response, |value| {
                    format!("alert {} {}", value.id, value.action)
                })
            }
        },
        AlertCommands::Resolve(args) => match backend {
            Backend::Remote(client) => {
                let _: serde_json::Value = client
                    .post_json(
                        &format!("/api/v1/alerts/{}/resolve", args.id),
                        &serde_json::json!({}),
                    )
                    .await?;
                let response = SuccessResponse {
                    success: true,
                    id: args.id,
                    action: "resolved".to_owned(),
                };
                print_output(args.output.format(), &response, |value| {
                    format!("alert {} {}", value.id, value.action)
                })
            }
            Backend::Local(runtime) => {
                runtime
                    .alerting
                    .resolve_alert(args.id, args.user_id)
                    .await?;
                let response = SuccessResponse {
                    success: true,
                    id: args.id,
                    action: "resolved".to_owned(),
                };
                print_output(args.output.format(), &response, |value| {
                    format!("alert {} {}", value.id, value.action)
                })
            }
        },
    }
}

async fn handle_tokens(command: TokenCommands) -> Result<(), CliError> {
    let runtime = load_runtime().await?;

    match command {
        TokenCommands::Create(args) => {
            let response = runtime
                .access
                .create_api_token(args.account_id, &args.label, args.scopes)
                .await?;

            print_output(args.output.format(), &response, |value| {
                format!(
                    "created token {} ({}) expiring {}",
                    value.prefix,
                    value.label,
                    value.expires_at.to_rfc3339(),
                )
            })
        }
    }
}

async fn dev_up(root: &Path, debug: bool, args: DevRunArgs) -> Result<(), CliError> {
    start_db(root, debug)?;
    tracing::info!("waiting for postgres");
    tokio::time::sleep(Duration::from_secs(2)).await;
    ensure_database(root)?;
    tracing::info!("starting rust engine + dashboard");
    tracing::info!("engine on :3001, dashboard on :3000 (ctrl+c to stop all)");

    let mut engine = EngineRuntime::spawn(root, args.reload)?;
    let mut dashboard = spawn_dashboard(root)?;

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("shutting down");
            engine.terminate().await?;
            terminate_child(&mut dashboard).await?;
            tracing::info!("stopped");
            Ok(())
        }
        status = engine.wait() => {
            let status = status?;
            terminate_child(&mut dashboard).await?;
            Err(CliError::ChildExited {
                process: "engine",
                code: exit_code_string(&status),
            })
        }
        status = dashboard.wait() => {
            let status = status?;
            engine.terminate().await?;
            Err(CliError::ChildExited {
                process: "dashboard",
                code: exit_code_string(&status),
            })
        }
    }
}

async fn dev_desktop(root: &Path, debug: bool) -> Result<(), CliError> {
    require_command("cargo")?;

    // start postgres + apply schema + sync desktop schema.sql
    start_db(root, debug)?;
    tracing::info!("waiting for postgres");
    tokio::time::sleep(Duration::from_secs(2)).await;
    ensure_database(root)?;
    sync_desktop_schema(root)?;

    let pg_bin_dir = find_pg_bin_dir_for_desktop();
    let db_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://scemas:scemas@localhost:5432/scemas".to_string());

    tracing::info!("starting desktop app (reading from dev postgres)");
    tracing::info!("ctrl+c to stop");

    let mut tauri = TokioCommand::new("cargo")
        .current_dir(root)
        .args([
            "tauri",
            "dev",
            "--manifest-path",
            "crates/scemas-desktop/Cargo.toml",
        ])
        .env("POSTGRES_BIN_DIR", &pg_bin_dir)
        .env("DATABASE_URL", &db_url)
        .env("SCEMAS_REMOTE_DB_URL", &db_url)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()?;

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("shutting down");
            terminate_child(&mut tauri).await?;
            tracing::info!("stopped");
            Ok(())
        }
        status = tauri.wait() => {
            let status = status?;
            Err(CliError::ChildExited {
                process: "tauri",
                code: exit_code_string(&status),
            })
        }
    }
}

fn find_pg_bin_dir_for_desktop() -> String {
    // check POSTGRES_BIN_DIR env (set by flake.nix)
    if let Ok(dir) = env::var("POSTGRES_BIN_DIR")
        && Path::new(&dir).join("pg_ctl").exists()
    {
        return dir;
    }
    // search PATH
    if let Ok(path_var) = env::var("PATH") {
        for dir in path_var.split(':') {
            if Path::new(dir).join("pg_ctl").exists() {
                return dir.to_string();
            }
        }
    }
    // well-known locations
    for dir in [
        "/opt/homebrew/opt/postgresql@16/bin",
        "/usr/local/opt/postgresql@16/bin",
        "/usr/lib/postgresql/16/bin",
    ] {
        if Path::new(dir).join("pg_ctl").exists() {
            return dir.to_string();
        }
    }
    panic!("postgres not found. ensure pg_ctl is in PATH (nix develop) or install postgresql@16");
}

async fn run_engine_command(root: &Path, args: DevRunArgs) -> Result<(), CliError> {
    let mut engine = EngineRuntime::spawn(root, args.reload)?;

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("shutting down");
            engine.terminate().await?;
            tracing::info!("stopped");
            Ok(())
        }
        status = engine.wait() => {
            let status = status?;
            Err(CliError::ChildExited {
                process: "engine",
                code: exit_code_string(&status),
            })
        }
    }
}

fn dev_check(root: &Path) -> Result<(), CliError> {
    run_checked(root, "cargo", &[OsString::from("fmt")])?;
    run_checked(
        root,
        "cargo",
        &[
            OsString::from("clippy"),
            OsString::from("--all"),
            OsString::from("--benches"),
            OsString::from("--tests"),
            OsString::from("--examples"),
            OsString::from("--all-features"),
        ],
    )?;
    run_checked(
        root,
        "bun",
        &[OsString::from("run"), OsString::from("typecheck")],
    )
}

fn ensure_database(root: &Path) -> Result<(), CliError> {
    run_checked(
        root,
        "bun",
        &[
            OsString::from("--filter"),
            OsString::from("@scemas/db"),
            OsString::from("push"),
        ],
    )?;
    run_checked(
        root,
        "bun",
        &[
            OsString::from("--filter"),
            OsString::from("@scemas/db"),
            OsString::from("ensure-users"),
        ],
    )
}

fn sync_desktop_schema(root: &Path) -> Result<(), CliError> {
    run_checked(
        root,
        "bun",
        &[
            OsString::from("--filter"),
            OsString::from("@scemas/db"),
            OsString::from("sync-desktop-schema"),
        ],
    )
}

fn start_db(root: &Path, debug: bool) -> Result<(), CliError> {
    if has_command("initdb") && has_command("pg_ctl") && has_command("createdb") {
        let pgdata = postgres_data_dir(root);
        let pgport = postgres_port();

        if local_postgres_running(root, &pgdata)? {
            tracing::info!(target: "scemas::postgres", "postgres already running, reusing existing server");
            if debug {
                print_postgres_debug(root, &pgdata, &pgport);
            }
            return Ok(());
        }

        initialize_postgres(root, &pgdata, &pgport)?;
        tracing::info!(target: "scemas::postgres", "starting postgres via local postgres binaries");
        if let Err(error) = run_checked(
            root,
            "pg_ctl",
            &[
                OsString::from("-D"),
                pgdata.clone().into_os_string(),
                OsString::from("-l"),
                pgdata.join("postgres.log").into_os_string(),
                OsString::from("start"),
            ],
        ) {
            if local_postgres_running(root, &pgdata)? {
                tracing::warn!(target: "scemas::postgres", "pg_ctl start reported failure, but postgres is already running");
                if debug {
                    print_postgres_debug(root, &pgdata, &pgport);
                }
                return Ok(());
            }

            if debug {
                print_postgres_debug(root, &pgdata, &pgport);
            }

            return Err(error);
        }

        let _ = Command::new("createdb")
            .current_dir(root)
            .args([
                OsString::from("-h"),
                pgdata.as_os_str().to_owned(),
                OsString::from("-p"),
                OsString::from(pgport.clone()),
                OsString::from("-U"),
                OsString::from("scemas"),
                OsString::from("scemas"),
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()?;

        if debug {
            print_postgres_debug(root, &pgdata, &pgport);
        }

        return Ok(());
    }

    if has_command("docker") {
        tracing::info!(target: "scemas::postgres", "starting postgres via docker-compose");
        return run_checked(
            root,
            "docker",
            &[
                OsString::from("compose"),
                OsString::from("-f"),
                root.join("docker-compose.yml").into_os_string(),
                OsString::from("up"),
                OsString::from("-d"),
            ],
        );
    }

    Err(CliError::MissingCommand(
        "initdb + pg_ctl + createdb, or docker".to_owned(),
    ))
}

fn initialize_postgres(root: &Path, pgdata: &Path, pgport: &str) -> Result<(), CliError> {
    if pgdata.is_dir() {
        return Ok(());
    }

    tracing::info!(target: "scemas::postgres", pgdata = %pgdata.display(), "initializing postgres");
    run_checked(
        root,
        "initdb",
        &[
            OsString::from("-D"),
            pgdata.as_os_str().to_owned(),
            OsString::from("-U"),
            OsString::from("scemas"),
        ],
    )?;

    append_line(
        pgdata.join("pg_hba.conf"),
        "host all all 127.0.0.1/32 trust",
    )?;
    append_line(pgdata.join("pg_hba.conf"), "host all all ::1/128 trust")?;
    append_line(
        pgdata.join("postgresql.conf"),
        &format!("unix_socket_directories = '{}'", pgdata.display()),
    )?;
    append_line(pgdata.join("postgresql.conf"), &format!("port = {pgport}"))?;

    Ok(())
}

fn local_postgres_running(root: &Path, pgdata: &Path) -> Result<bool, CliError> {
    if !pgdata.is_dir() {
        return Ok(false);
    }

    let status = Command::new("pg_ctl")
        .current_dir(root)
        .args([
            OsString::from("-D"),
            pgdata.as_os_str().to_owned(),
            OsString::from("status"),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()?;

    Ok(status.success())
}

fn print_postgres_debug(root: &Path, pgdata: &Path, pgport: &str) {
    tracing::debug!(target: "scemas::postgres", pgdata = %pgdata.display(), pgport, "postgres debug state");
    print_command_output(
        root,
        "pg_ctl status",
        "pg_ctl",
        &[
            OsString::from("-D"),
            pgdata.as_os_str().to_owned(),
            OsString::from("status"),
        ],
    );
    print_command_output(
        root,
        "pg_isready",
        "pg_isready",
        &[
            OsString::from("-h"),
            OsString::from("127.0.0.1"),
            OsString::from("-p"),
            OsString::from(pgport),
            OsString::from("-U"),
            OsString::from("scemas"),
            OsString::from("-d"),
            OsString::from("scemas"),
        ],
    );
    print_log_tail(&pgdata.join("postgres.log"), 20);
}

fn print_command_output(root: &Path, label: &str, program: &str, args: &[OsString]) {
    if !has_command(program) {
        tracing::debug!(target: "scemas::postgres", label, "debug command not found on PATH");
        return;
    }

    match Command::new(program)
        .current_dir(root)
        .args(args)
        .stdin(Stdio::null())
        .output()
    {
        Ok(output) => {
            tracing::debug!(
                target: "scemas::postgres",
                label,
                command = %render_command(program, args),
                exit = %exit_code_string(&output.status),
                "debug command completed"
            );

            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
            if !stdout.is_empty() {
                for line in stdout.lines() {
                    tracing::debug!(target: "scemas::postgres", label, log_line = line, "debug command stdout");
                }
            }

            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
            if !stderr.is_empty() {
                for line in stderr.lines() {
                    tracing::debug!(target: "scemas::postgres", label, log_line = line, "debug command stderr");
                }
            }
        }
        Err(error) => {
            tracing::warn!(target: "scemas::postgres", label, %error, "debug command failed to execute");
        }
    }
}

fn print_log_tail(path: &Path, lines: usize) {
    match fs::read_to_string(path) {
        Ok(contents) => {
            let tail = contents.lines().rev().take(lines).collect::<Vec<&str>>();

            if tail.is_empty() {
                tracing::debug!(target: "scemas::postgres", path = %path.display(), "postgres log is empty");
                return;
            }

            tracing::debug!(
                target: "scemas::postgres",
                path = %path.display(),
                line_count = tail.len(),
                "postgres log tail"
            );
            for line in tail.iter().rev() {
                tracing::debug!(target: "scemas::postgres", log_line = *line, "postgres log");
            }
        }
        Err(error) => {
            tracing::warn!(target: "scemas::postgres", path = %path.display(), %error, "could not read postgres log");
        }
    }
}

fn append_line(path: PathBuf, line: &str) -> Result<(), CliError> {
    let mut file = OpenOptions::new().append(true).open(path)?;
    writeln!(file, "{line}")?;
    Ok(())
}

fn postgres_data_dir(root: &Path) -> PathBuf {
    env::var_os("PGDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| root.join(".pgdata"))
}

fn postgres_port() -> String {
    env::var("PGPORT").unwrap_or_else(|_| "5432".to_owned())
}

fn run_script(root: &Path, script_name: &str, passthrough_args: &[String]) -> Result<(), CliError> {
    let mut args = vec![
        OsString::from("run"),
        root.join("scripts").join(script_name).into_os_string(),
    ];
    args.extend(passthrough_args.iter().map(OsString::from));
    run_checked(root, "bun", &args)
}

fn run_checked(root: &Path, program: &str, args: &[OsString]) -> Result<(), CliError> {
    require_command(program)?;
    tracing::debug!(
        target: "scemas::command",
        command = %render_command(program, args),
        "running command"
    );

    let status = Command::new(program)
        .current_dir(root)
        .args(args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()?;

    ensure_success(program, args, status)
}

fn spawn_engine(root: &Path) -> Result<Child, CliError> {
    spawn_checked(
        root,
        "cargo",
        &[
            OsString::from("run"),
            OsString::from("-p"),
            OsString::from("scemas-server"),
        ],
    )
}

fn spawn_dashboard(root: &Path) -> Result<Child, CliError> {
    spawn_checked(
        root,
        "bun",
        &[
            OsString::from("--filter"),
            OsString::from("@scemas/dashboard"),
            OsString::from("dev"),
        ],
    )
}

fn spawn_checked(root: &Path, program: &str, args: &[OsString]) -> Result<Child, CliError> {
    require_command(program)?;
    tracing::debug!(
        target: "scemas::command",
        command = %render_command(program, args),
        "spawning command"
    );

    let child = TokioCommand::new(program)
        .current_dir(root)
        .args(args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()?;

    Ok(child)
}

async fn terminate_child(child: &mut Child) -> Result<(), CliError> {
    if child.id().is_none() {
        return Ok(());
    }

    if child.try_wait()?.is_some() {
        return Ok(());
    }

    child.kill().await?;
    let _ = child.wait().await?;
    Ok(())
}

fn ensure_success(program: &str, args: &[OsString], status: ExitStatus) -> Result<(), CliError> {
    if status.success() {
        return Ok(());
    }

    Err(CliError::CommandFailed {
        program: render_command(program, args),
        code: exit_code_string(&status),
    })
}

fn render_command(program: &str, args: &[OsString]) -> String {
    let rendered_args = args
        .iter()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect::<Vec<String>>()
        .join(" ");

    format!("{program} {rendered_args}").trim().to_owned()
}

fn require_command(program: &str) -> Result<(), CliError> {
    if has_command(program) {
        Ok(())
    } else {
        Err(CliError::MissingCommand(program.to_owned()))
    }
}

fn has_command(program: &str) -> bool {
    let Some(paths) = env::var_os("PATH") else {
        return false;
    };

    env::split_paths(&paths).any(|path| executable_in_path(&path, program))
}

fn executable_in_path(path: &Path, program: &str) -> bool {
    let direct = path.join(program);
    if direct.is_file() {
        return true;
    }

    #[cfg(windows)]
    {
        let executable = path.join(format!("{program}.exe"));
        executable.is_file()
    }

    #[cfg(not(windows))]
    {
        false
    }
}

async fn load_runtime() -> Result<ScemasRuntime, CliError> {
    let config = Config::from_env()?;
    ScemasRuntime::from_config(&config)
        .await
        .map_err(CliError::from)
}

fn find_project_root() -> Result<PathBuf, CliError> {
    let start = env::current_dir()?;

    for candidate in start.ancestors() {
        if candidate.join("Cargo.toml").is_file()
            && candidate.join("packages/dashboard/package.json").is_file()
            && candidate.join("crates/scemas-server/Cargo.toml").is_file()
        {
            return Ok(candidate.to_path_buf());
        }
    }

    Err(CliError::ProjectRootNotFound)
}

fn print_output<T, F>(format: OutputFormat, value: &T, text_renderer: F) -> Result<(), CliError>
where
    T: Serialize,
    F: FnOnce(&T) -> String,
{
    match format {
        OutputFormat::Text => {
            println!("{}", text_renderer(value));
            Ok(())
        }
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(value)?);
            Ok(())
        }
    }
}

fn format_rule_list(rules: &[ThresholdRule]) -> String {
    if rules.is_empty() {
        return "no rules found".to_owned();
    }

    rules
        .iter()
        .map(|rule| {
            format!(
                "{} {} {} {} zone={} status={}",
                rule.id,
                rule.metric_type,
                rule.comparison,
                rule.threshold_value,
                rule.zone.as_deref().unwrap_or("all_zones"),
                rule.rule_status,
            )
        })
        .collect::<Vec<String>>()
        .join("\n")
}

fn format_alert_list(alerts: &[AlertView]) -> String {
    if alerts.is_empty() {
        return "no alerts found".to_owned();
    }

    alerts
        .iter()
        .map(|alert| {
            format!(
                "{} {} {} {} value={} zone={} sensor={}",
                alert.id,
                alert.status,
                alert.severity,
                alert.metric_type,
                alert.triggered_value,
                alert.zone,
                alert.sensor_id,
            )
        })
        .collect::<Vec<String>>()
        .join("\n")
}

fn parse_metric_type(value: &str) -> Result<MetricType, String> {
    MetricType::from_str(value).map_err(|error| error.to_string())
}

fn parse_comparison(value: &str) -> Result<Comparison, String> {
    Comparison::from_str(value).map_err(|error| error.to_string())
}

fn parse_rule_status(value: &str) -> Result<RuleStatus, String> {
    RuleStatus::from_str(value).map_err(|error| error.to_string())
}

fn parse_alert_status(value: &str) -> Result<AlertStatus, String> {
    AlertStatus::from_str(value).map_err(|error| error.to_string())
}

fn exit_code_string(status: &ExitStatus) -> String {
    status
        .code()
        .map(|code| code.to_string())
        .unwrap_or_else(|| "signal".to_owned())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SuccessResponse {
    success: bool,
    id: Uuid,
    action: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthReport {
    ingestion_counters: IngestionCounters,
    platform_status: Vec<PlatformStatusView>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IngestionCounters {
    total_received: u64,
    total_accepted: u64,
    total_rejected: u64,
}

#[derive(Debug, FromRow)]
struct PlatformStatusRow {
    subsystem: String,
    status: String,
    uptime: Option<f64>,
    latency_ms: Option<f64>,
    error_rate: Option<f64>,
    time: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformStatusView {
    subsystem: String,
    status: String,
    uptime: Option<f64>,
    latency_ms: Option<f64>,
    error_rate: Option<f64>,
    time: DateTime<Utc>,
}

impl From<PlatformStatusRow> for PlatformStatusView {
    fn from(row: PlatformStatusRow) -> Self {
        Self {
            subsystem: row.subsystem,
            status: row.status,
            uptime: row.uptime,
            latency_ms: row.latency_ms,
            error_rate: row.error_rate,
            time: row.time,
        }
    }
}

#[derive(Debug, FromRow)]
struct ThresholdRuleRow {
    id: Uuid,
    metric_type: String,
    threshold_value: f64,
    comparison: String,
    zone: Option<String>,
    rule_status: String,
}

impl TryFrom<ThresholdRuleRow> for ThresholdRule {
    type Error = CliError;

    fn try_from(row: ThresholdRuleRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.id,
            metric_type: row.metric_type.parse()?,
            threshold_value: row.threshold_value,
            comparison: row.comparison.parse()?,
            zone: row.zone.map(|zone| regions::normalize_zone_id(&zone, None)),
            rule_status: row.rule_status.parse()?,
        })
    }
}

#[derive(Debug, FromRow)]
struct AlertRow {
    id: Uuid,
    rule_id: Option<Uuid>,
    sensor_id: String,
    severity: i32,
    status: String,
    triggered_value: f64,
    zone: String,
    metric_type: String,
    created_at: DateTime<Utc>,
    acknowledged_by: Option<Uuid>,
    acknowledged_at: Option<DateTime<Utc>>,
    resolved_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AlertView {
    id: Uuid,
    rule_id: Option<Uuid>,
    sensor_id: String,
    severity: Severity,
    status: AlertStatus,
    triggered_value: f64,
    zone: String,
    metric_type: MetricType,
    created_at: DateTime<Utc>,
    acknowledged_by: Option<Uuid>,
    acknowledged_at: Option<DateTime<Utc>>,
    resolved_at: Option<DateTime<Utc>>,
}

impl TryFrom<AlertRow> for AlertView {
    type Error = CliError;

    fn try_from(row: AlertRow) -> Result<Self, Self::Error> {
        let sensor_id = row.sensor_id;

        Ok(Self {
            id: row.id,
            rule_id: row.rule_id,
            sensor_id: sensor_id.clone(),
            severity: Severity::try_from(row.severity)?,
            status: row.status.parse()?,
            triggered_value: row.triggered_value,
            zone: regions::normalize_zone_id(&row.zone, Some(&sensor_id)),
            metric_type: row.metric_type.parse()?,
            created_at: row.created_at,
            acknowledged_by: row.acknowledged_by,
            acknowledged_at: row.acknowledged_at,
            resolved_at: row.resolved_at,
        })
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteAlert {
    id: Uuid,
    rule_id: Option<Uuid>,
    sensor_id: String,
    severity: i32,
    status: String,
    triggered_value: f64,
    zone: String,
    metric_type: String,
    created_at: DateTime<Utc>,
    acknowledged_by: Option<Uuid>,
    acknowledged_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteRule {
    id: Uuid,
    metric_type: String,
    threshold_value: f64,
    comparison: String,
    zone: Option<String>,
    rule_status: String,
}

#[cfg(test)]
mod tests {
    use super::{
        AlertRow, AlertStatus, AlertView, Cli, Commands, DevCommands, ThresholdRule,
        ThresholdRuleRow, resolve_dev_command,
    };
    use chrono::Utc;
    use clap::Parser;
    use scemas_core::models::{Comparison, MetricType, RuleStatus, Severity};
    use uuid::Uuid;

    #[test]
    fn threshold_rule_row_converts_into_domain_rule() {
        let row = ThresholdRuleRow {
            id: Uuid::nil(),
            metric_type: "air_quality".to_owned(),
            threshold_value: 35.0,
            comparison: "gte".to_owned(),
            zone: Some("downtown".to_owned()),
            rule_status: "active".to_owned(),
        };

        let rule = ThresholdRule::try_from(row).expect("rule should parse");

        assert_eq!(rule.metric_type, MetricType::AirQuality);
        assert_eq!(rule.comparison, Comparison::Gte);
        assert_eq!(rule.rule_status, RuleStatus::Active);
        assert_eq!(rule.zone.as_deref(), Some("downtown_core"));
    }

    #[test]
    fn alert_row_converts_into_agent_friendly_view() {
        let row = AlertRow {
            id: Uuid::nil(),
            rule_id: Some(Uuid::nil()),
            sensor_id: "temp-dt-001".to_owned(),
            severity: 2,
            status: "acknowledged".to_owned(),
            triggered_value: 42.5,
            zone: "downtown".to_owned(),
            metric_type: "temperature".to_owned(),
            created_at: Utc::now(),
            acknowledged_by: Some(Uuid::nil()),
            acknowledged_at: Some(Utc::now()),
            resolved_at: None,
        };

        let alert = AlertView::try_from(row).expect("alert should parse");

        assert_eq!(alert.metric_type, MetricType::Temperature);
        assert_eq!(alert.severity, Severity::Warning);
        assert_eq!(alert.status, AlertStatus::Acknowledged);
        assert_eq!(alert.zone, "downtown_core");
    }

    #[test]
    fn bare_dev_defaults_to_up() {
        let cli = Cli::try_parse_from(["scemas", "dev"]).expect("dev should parse");

        let Commands::Dev(args) = cli.command else {
            panic!("expected dev command");
        };

        let DevCommands::Up(up_args) = resolve_dev_command(args) else {
            panic!("bare dev should resolve to up");
        };

        assert!(!up_args.reload);
    }

    #[test]
    fn bare_dev_passes_reload_to_up() {
        let cli =
            Cli::try_parse_from(["scemas", "dev", "--reload"]).expect("dev reload should parse");

        let Commands::Dev(args) = cli.command else {
            panic!("expected dev command");
        };

        let DevCommands::Up(up_args) = resolve_dev_command(args) else {
            panic!("bare dev should resolve to up");
        };

        assert!(up_args.reload);
    }

    #[test]
    fn explicit_dev_subcommand_still_parses() {
        let cli = Cli::try_parse_from(["scemas", "dev", "engine", "--reload"])
            .expect("engine reload should parse");

        let Commands::Dev(args) = cli.command else {
            panic!("expected dev command");
        };

        let DevCommands::Engine(engine_args) = resolve_dev_command(args) else {
            panic!("expected explicit engine command");
        };

        assert!(engine_args.reload);
    }

    #[test]
    fn seed_subcommand_parses_native_flags() {
        let cli = Cli::try_parse_from([
            "scemas",
            "dev",
            "seed",
            "--rate",
            "4",
            "--spike-ratio",
            "0.1",
            "--remote",
            "http://localhost:3001",
            "--request-timeout-ms",
            "12000",
        ])
        .expect("seed command should parse");

        let Commands::Dev(args) = cli.command else {
            panic!("expected dev command");
        };

        let DevCommands::Seed(seed_args) = resolve_dev_command(args) else {
            panic!("expected seed command");
        };

        assert_eq!(seed_args.rate_per_second, 4.0);
        assert_eq!(seed_args.spike_ratio, Some(0.1));
        assert_eq!(
            seed_args.remote_url.as_deref(),
            Some("http://localhost:3001")
        );
        assert_eq!(seed_args.request_timeout_ms, Some(12_000));
        assert!(!seed_args.spike);
    }
}
