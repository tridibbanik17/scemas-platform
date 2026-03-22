use crate::CliError;
use chrono::{Datelike, Local, NaiveDate, Timelike, Utc, Weekday};
use clap::Args;
use rand::random;
use reqwest::Url;
use scemas_core::models::{IndividualSensorReading, MetricType};
use serde::Deserialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::{Duration, Instant};

const DEFAULT_LOCAL_REQUEST_TIMEOUT_MS: u64 = 10_000;
const DEFAULT_REMOTE_REQUEST_TIMEOUT_MS: u64 = 45_000;
const DEFAULT_REMOTE_URL: &str = "http://localhost:3001";
const DEFAULT_DEVICE_AUTH_SECRET: &str = "change-me-device-ingest-secret";
const DEFAULT_CATALOG_PATH: &str = "data/hamilton-sensor-catalog.json";
// Hamilton airport monthly climatology anchors from 1992-2021 averages.
const HAMILTON_MONTHLY_TEMP_MEAN_C: [f64; 12] = [
    -5.0, -4.4, 0.0, 6.1, 12.8, 18.3, 21.1, 20.0, 16.1, 10.0, 3.9, -1.7,
];
const HAMILTON_MONTHLY_TEMP_HIGH_C: [f64; 12] = [
    -1.1, -0.6, 4.4, 11.7, 18.9, 24.4, 26.7, 25.6, 22.2, 14.4, 7.8, 1.7,
];
const HAMILTON_MONTHLY_TEMP_LOW_C: [f64; 12] = [
    -8.9, -8.9, -4.4, 1.1, 7.2, 12.8, 15.6, 14.4, 10.6, 5.0, -0.6, -5.0,
];
const HAMILTON_MONTHLY_DEW_POINT_C: [f64; 12] = [
    -7.8, -7.2, -4.4, 0.6, 7.2, 13.3, 16.1, 16.1, 12.2, 6.7, 0.6, -3.9,
];
// Seasonal AQ anchor is an inference from Ontario/Canada reporting: ozone rises in warm months,
// while particulates can also elevate in winter and during summer wildfire periods.
const HAMILTON_MONTHLY_AIR_QUALITY_INDEX: [f64; 12] = [
    22.0, 20.0, 17.0, 15.0, 16.0, 19.0, 23.0, 21.0, 18.0, 15.0, 16.0, 19.0,
];
const HAMILTON_MONTHLY_NOISE_OFFSET_DB: [f64; 12] = [
    -1.0, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 1.0, 0.5, 0.0, -0.5, -1.0,
];
const SEED_AFTER_LONG_HELP: &str = "\
examples:
  scemas dev seed
  scemas dev seed --spike
  scemas dev seed --rate 5 --spike-ratio 0.2
  scemas dev seed --remote http://localhost:3001 --request-timeout-ms 15000";

#[derive(Args, Debug, Clone)]
#[command(after_long_help = SEED_AFTER_LONG_HELP)]
pub(crate) struct SeedArgs {
    #[arg(long, help = "generate readings that should trigger alerts")]
    pub(crate) spike: bool,

    #[arg(
        long,
        value_parser = parse_spike_ratio,
        conflicts_with = "spike",
        help = "randomly emit spike readings at the given share, from 0 to 1"
    )]
    pub(crate) spike_ratio: Option<f64>,

    #[arg(
        long = "rate",
        default_value_t = 2.0,
        value_parser = parse_positive_rate,
        help = "aggregate poisson arrival rate across all sensors"
    )]
    pub(crate) rate_per_second: f64,

    #[arg(
        long = "remote",
        help = "override the rust engine url (default: INTERNAL_RUST_URL or localhost:3001)"
    )]
    pub(crate) remote_url: Option<String>,

    #[arg(
        long = "request-timeout-ms",
        value_parser = parse_positive_timeout_ms,
        help = "abort a stalled ingest request after the given timeout"
    )]
    pub(crate) request_timeout_ms: Option<u64>,
}

#[derive(Debug, Clone)]
struct SeedOptions {
    spike: bool,
    spike_ratio: f64,
    rate_per_second: f64,
    remote_url: String,
    request_timeout_ms: u64,
    device_auth_secret: String,
    catalog_path: PathBuf,
}

#[derive(Debug, Clone, Copy)]
struct SeedCalibration {
    temperature_mean: f64,
    humidity_mean: f64,
    air_quality_mean: f64,
    noise_mean: f64,
}

#[derive(Debug, Clone, Copy)]
struct TemporalContext {
    month_index: usize,
    next_month_index: usize,
    month_progress: f64,
    hour: f64,
    is_weekend: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct SeedSensor {
    sensor_id: String,
    display_name: String,
    #[serde(deserialize_with = "deserialize_metric_type")]
    device_type: MetricType,
    zone: String,
    region_label: String,
    site_name: String,
    sampling_interval_seconds: u64,
    telemetry_unit: String,
    simulation: SensorSimulationProfile,
}

#[derive(Debug, Clone, Deserialize)]
struct SensorSimulationProfile {
    mean: f64,
    variance: f64,
    spike: f64,
    min: f64,
    max: f64,
}

#[derive(Debug, Clone)]
struct WeightedSensor {
    sensor: SeedSensor,
    cumulative_weight: f64,
}

#[derive(Debug, Clone)]
struct GeneratedReading {
    is_spike: bool,
    reading: IndividualSensorReading,
}

#[derive(Debug)]
enum SubmitReadingResult {
    Accepted,
    Rejected { message: String },
    Failed { message: String },
}

pub(crate) async fn run(root: &Path, args: SeedArgs) -> Result<(), CliError> {
    let options = SeedOptions::from_args(root, args);
    let sensors = load_catalog(&options.catalog_path)?;
    let calibration = SeedCalibration::from_sensors(&sensors);
    let weighted_sensors = build_weighted_sensor_index(sensors);

    if weighted_sensors.is_empty() {
        tracing::warn!(target: "scemas::seed", "no sensors available in the catalog");
        return Ok(());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(options.request_timeout_ms))
        .build()?;

    tracing::info!(
        target: "scemas::seed",
        sensor_count = weighted_sensors.len(),
        rate_per_second = %format_rate(options.rate_per_second),
        spike_mode = %format_spike_mode(&options),
        "continuous seed started"
    );
    tracing::info!(
        target: "scemas::seed",
        target_url = %format!("{}/internal/telemetry/ingest", options.remote_url),
        timeout_ms = options.request_timeout_ms,
        "seed target configured"
    );
    tracing::info!(target: "scemas::seed", "press ctrl+c to stop");

    let started_at = Instant::now();
    let mut accepted = 0_u64;
    let mut rejected = 0_u64;
    let mut spike_events = 0_u64;
    let mut total = 0_u64;

    loop {
        let Some(sensor) = pick_sensor(&weighted_sensors) else {
            tracing::warn!(target: "scemas::seed", "weighted sensor index became empty");
            break;
        };

        let context = TemporalContext::current();
        let generated_reading = generate_reading(sensor, &options, &calibration, &context);
        if generated_reading.is_spike {
            spike_events += 1;
        }

        total += 1;
        let spike_suffix = if generated_reading.is_spike {
            " [SPIKE]"
        } else {
            ""
        };

        let submit_reading = submit_reading(&client, sensor, &generated_reading.reading, &options);
        tokio::pin!(submit_reading);

        let request_result = tokio::select! {
            _ = tokio::signal::ctrl_c() => break,
            result = &mut submit_reading => result,
        };

        match request_result {
            SubmitReadingResult::Accepted => {
                accepted += 1;
                tracing::info!(
                    target: "scemas::seed",
                    sensor = %sensor.display_name,
                    value = generated_reading.reading.value,
                    unit = %sensor.telemetry_unit,
                    site = %sensor.site_name,
                    region = %sensor.region_label,
                    spike = generated_reading.is_spike,
                    "{}: {} {} at {} ({}){}",
                    sensor.display_name,
                    generated_reading.reading.value,
                    sensor.telemetry_unit,
                    sensor.site_name,
                    sensor.region_label,
                    spike_suffix
                );
            }
            SubmitReadingResult::Rejected { message } | SubmitReadingResult::Failed { message } => {
                rejected += 1;
                tracing::warn!(
                    target: "scemas::seed",
                    sensor = %sensor.display_name,
                    region = %sensor.region_label,
                    spike = generated_reading.is_spike,
                    "{}: {} ({}){}",
                    sensor.display_name,
                    message,
                    sensor.region_label,
                    spike_suffix
                );
            }
        }

        let delay = exponential_sample(options.rate_per_second);
        let sleep = tokio::time::sleep(Duration::from_secs_f64(delay));
        tokio::pin!(sleep);
        tokio::select! {
            _ = tokio::signal::ctrl_c() => break,
            _ = &mut sleep => {}
        }
    }

    let elapsed = started_at.elapsed().as_secs_f64();
    let rate = if elapsed > 0.0 {
        total as f64 / elapsed
    } else {
        0.0
    };
    let spike_ratio = if total > 0 {
        spike_events as f64 / total as f64
    } else {
        0.0
    };

    tracing::info!(
        target: "scemas::seed",
        elapsed_seconds = format_args!("{elapsed:.1}"),
        sent = total,
        observed_rate = format_args!("{rate:.1}"),
        spikes = spike_events,
        spike_ratio = %format_ratio(spike_ratio),
        accepted,
        rejected,
        "seed stopped"
    );

    Ok(())
}

impl SeedOptions {
    fn from_args(root: &Path, args: SeedArgs) -> Self {
        let remote_url = args
            .remote_url
            .or_else(|| env::var("INTERNAL_RUST_URL").ok())
            .unwrap_or_else(|| DEFAULT_REMOTE_URL.to_owned());
        let request_timeout_ms = args
            .request_timeout_ms
            .unwrap_or_else(|| default_request_timeout_ms(&remote_url));
        let device_auth_secret = env::var("DEVICE_AUTH_SECRET")
            .unwrap_or_else(|_| DEFAULT_DEVICE_AUTH_SECRET.to_owned());
        let catalog_path = resolve_catalog_path(
            root,
            env::var("DEVICE_CATALOG_PATH")
                .ok()
                .unwrap_or_else(|| DEFAULT_CATALOG_PATH.to_owned()),
        );

        Self {
            spike: args.spike,
            spike_ratio: args.spike_ratio.unwrap_or(0.0),
            rate_per_second: args.rate_per_second,
            remote_url,
            request_timeout_ms,
            device_auth_secret,
            catalog_path,
        }
    }
}

impl SeedCalibration {
    fn from_sensors(sensors: &[SeedSensor]) -> Self {
        Self {
            temperature_mean: metric_group_mean(sensors, &MetricType::Temperature),
            humidity_mean: metric_group_mean(sensors, &MetricType::Humidity),
            air_quality_mean: metric_group_mean(sensors, &MetricType::AirQuality),
            noise_mean: metric_group_mean(sensors, &MetricType::NoiseLevel),
        }
    }

    fn mean_for_metric(&self, metric: &MetricType) -> f64 {
        match metric {
            MetricType::Temperature => self.temperature_mean,
            MetricType::Humidity => self.humidity_mean,
            MetricType::AirQuality => self.air_quality_mean,
            MetricType::NoiseLevel => self.noise_mean,
        }
    }
}

impl TemporalContext {
    fn current() -> Self {
        let now = Local::now();
        let year = now.year();
        let month = now.month();
        let day = now.day();
        let days_in_month = days_in_month(year, month);
        let hour = now.hour() as f64 + now.minute() as f64 / 60.0 + now.second() as f64 / 3600.0;
        let month_progress = ((day - 1) as f64 + hour / 24.0) / days_in_month as f64;
        let month_index = (month - 1) as usize;
        let next_month_index = (month_index + 1) % 12;

        Self {
            month_index,
            next_month_index,
            month_progress,
            hour,
            is_weekend: matches!(now.weekday(), Weekday::Sat | Weekday::Sun),
        }
    }

    #[cfg(test)]
    fn at(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> Self {
        let date = NaiveDate::from_ymd_opt(year, month, day).expect("valid test date");
        let month_index = (month - 1) as usize;
        let next_month_index = (month_index + 1) % 12;
        let fractional_hour = hour as f64 + minute as f64 / 60.0;
        let month_progress =
            ((day - 1) as f64 + fractional_hour / 24.0) / days_in_month(year, month) as f64;

        Self {
            month_index,
            next_month_index,
            month_progress,
            hour: fractional_hour,
            is_weekend: matches!(date.weekday(), Weekday::Sat | Weekday::Sun),
        }
    }
}

fn resolve_catalog_path(root: &Path, configured_path: String) -> PathBuf {
    let path = PathBuf::from(configured_path);
    if path.is_absolute() {
        path
    } else {
        root.join(path)
    }
}

fn load_catalog(path: &Path) -> Result<Vec<SeedSensor>, CliError> {
    let contents = fs::read_to_string(path)?;
    let sensors = serde_json::from_str(&contents)?;
    Ok(sensors)
}

fn deserialize_metric_type<'de, D>(deserializer: D) -> Result<MetricType, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = String::deserialize(deserializer)?;
    MetricType::from_str(&value).map_err(serde::de::Error::custom)
}

fn build_weighted_sensor_index(sensors: Vec<SeedSensor>) -> Vec<WeightedSensor> {
    let mut weighted_sensors = Vec::with_capacity(sensors.len());
    let mut cumulative_weight = 0.0;

    for sensor in sensors {
        cumulative_weight += 1.0 / (sensor.sampling_interval_seconds.max(1) as f64);
        weighted_sensors.push(WeightedSensor {
            sensor,
            cumulative_weight,
        });
    }

    weighted_sensors
}

fn pick_sensor(weighted_sensors: &[WeightedSensor]) -> Option<&SeedSensor> {
    let total_weight = weighted_sensors.last()?.cumulative_weight;
    if total_weight <= 0.0 {
        return None;
    }

    let target = uniform01() * total_weight;
    for weighted_sensor in weighted_sensors {
        if target <= weighted_sensor.cumulative_weight {
            return Some(&weighted_sensor.sensor);
        }
    }

    weighted_sensors.last().map(|sensor| &sensor.sensor)
}

fn generate_reading(
    sensor: &SeedSensor,
    options: &SeedOptions,
    calibration: &SeedCalibration,
    context: &TemporalContext,
) -> GeneratedReading {
    let is_spike = options.spike || uniform01() < options.spike_ratio;
    let raw_value = if is_spike {
        spike_value(sensor, calibration, context)
    } else {
        sampled_value(sensor, calibration, context)
    };
    let value = raw_value.clamp(sensor.simulation.min, sensor.simulation.max);

    GeneratedReading {
        is_spike,
        reading: IndividualSensorReading {
            sensor_id: sensor.sensor_id.clone(),
            metric_type: sensor.device_type.clone(),
            value: round_to_hundredths(value),
            zone: sensor.zone.clone(),
            timestamp: Utc::now(),
        },
    }
}

fn sampled_value(
    sensor: &SeedSensor,
    calibration: &SeedCalibration,
    context: &TemporalContext,
) -> f64 {
    let mean = target_mean(sensor, calibration, context);
    let base_std_dev = sensor.simulation.variance.max(0.25).sqrt();

    match sensor.device_type {
        MetricType::Temperature => mean + gaussian01() * base_std_dev * 0.45,
        MetricType::Humidity => mean + gaussian01() * base_std_dev * 0.65,
        MetricType::NoiseLevel => mean + gaussian01() * base_std_dev * 0.7,
        MetricType::AirQuality => {
            let variance = air_quality_variance(sensor, context);
            let params = gamma_params_from_mean_variance(mean.max(0.5), variance);
            gamma_sample(params.shape, params.scale)
        }
    }
}

fn spike_value(
    sensor: &SeedSensor,
    calibration: &SeedCalibration,
    context: &TemporalContext,
) -> f64 {
    let mean = target_mean(sensor, calibration, context);

    match sensor.device_type {
        MetricType::Temperature => {
            let seasonal_high =
                temperature_high(context) + sensor_local_offset(sensor, calibration);
            (seasonal_high + 10.0).max(mean + 6.0)
        }
        MetricType::Humidity => mean.max(sensor.simulation.spike - 5.0) + 12.0,
        MetricType::AirQuality => sensor.simulation.spike.max(mean + 50.0),
        MetricType::NoiseLevel => sensor.simulation.spike.max(mean + 15.0),
    }
}

fn target_mean(
    sensor: &SeedSensor,
    calibration: &SeedCalibration,
    context: &TemporalContext,
) -> f64 {
    let local_offset = sensor_local_offset(sensor, calibration);

    match sensor.device_type {
        MetricType::Temperature => target_temperature(local_offset, context),
        MetricType::Humidity => target_humidity(local_offset, context),
        MetricType::AirQuality => target_air_quality(local_offset, context),
        MetricType::NoiseLevel => {
            target_noise(sensor, calibration.noise_mean, local_offset, context)
        }
    }
}

fn sensor_local_offset(sensor: &SeedSensor, calibration: &SeedCalibration) -> f64 {
    sensor.simulation.mean - calibration.mean_for_metric(&sensor.device_type)
}

fn target_temperature(local_offset: f64, context: &TemporalContext) -> f64 {
    temperature_mean(context) + temperature_diurnal_component(context) + local_offset
}

fn target_humidity(local_offset: f64, context: &TemporalContext) -> f64 {
    let base_rh = relative_humidity(
        temperature_mean(context) + temperature_diurnal_component(context),
        monthly_value(&HAMILTON_MONTHLY_DEW_POINT_C, context),
    );
    (base_rh + local_offset).clamp(10.0, 100.0)
}

fn target_air_quality(local_offset: f64, context: &TemporalContext) -> f64 {
    let monthly_baseline = monthly_value(&HAMILTON_MONTHLY_AIR_QUALITY_INDEX, context);
    let seasonal_temp = temperature_mean(context);
    let warm_season = seasonal_temp >= 12.0;
    let midday_ozone = if warm_season {
        5.0 * hourly_bump(context.hour, 14.0, 3.2)
    } else {
        0.0
    };
    let cold_season = seasonal_temp <= 5.0;
    let inversion = if cold_season {
        2.8 * hourly_bump(context.hour, 8.0, 2.2) + 2.1 * hourly_bump(context.hour, 19.0, 2.8)
    } else {
        1.2 * hourly_bump(context.hour, 8.0, 2.4)
    };
    let weekend_adjustment = if context.is_weekend { -1.2 } else { 0.0 };

    (monthly_baseline + midday_ozone + inversion + weekend_adjustment + local_offset).max(0.0)
}

fn target_noise(
    sensor: &SeedSensor,
    annual_mean: f64,
    local_offset: f64,
    context: &TemporalContext,
) -> f64 {
    let seasonal = monthly_value(&HAMILTON_MONTHLY_NOISE_OFFSET_DB, context);
    let morning_commute = 4.0 * hourly_bump(context.hour, 8.0, 1.6);
    let evening_commute = 5.5 * hourly_bump(context.hour, 17.5, 1.9);
    let midday_activity = 2.0 * hourly_bump(context.hour, 12.5, 2.8);
    let overnight_quiet = -8.5 * hourly_bump(context.hour, 2.5, 3.6);
    let weekend_adjustment = if context.is_weekend {
        -2.0 * hourly_bump(context.hour, 8.0, 2.0) - 1.5 * hourly_bump(context.hour, 17.5, 2.0)
            + 1.0 * hourly_bump(context.hour, 21.0, 2.5)
    } else {
        0.0
    };
    let site_bias = if sensor.zone == "downtown_core" {
        1.0
    } else {
        0.0
    };

    (annual_mean + local_offset)
        + seasonal
        + morning_commute
        + evening_commute
        + midday_activity
        + overnight_quiet
        + weekend_adjustment
        + site_bias
}

fn air_quality_variance(sensor: &SeedSensor, context: &TemporalContext) -> f64 {
    let warm_season = temperature_mean(context) >= 12.0;
    let multiplier = if warm_season { 1.35 } else { 1.15 };
    (sensor.simulation.variance * multiplier).max(1.0)
}

fn temperature_mean(context: &TemporalContext) -> f64 {
    monthly_value(&HAMILTON_MONTHLY_TEMP_MEAN_C, context)
}

fn temperature_high(context: &TemporalContext) -> f64 {
    monthly_value(&HAMILTON_MONTHLY_TEMP_HIGH_C, context)
}

fn temperature_low(context: &TemporalContext) -> f64 {
    monthly_value(&HAMILTON_MONTHLY_TEMP_LOW_C, context)
}

fn temperature_diurnal_component(context: &TemporalContext) -> f64 {
    let amplitude = ((temperature_high(context) - temperature_low(context)) / 2.0).max(1.0);
    amplitude * diurnal_cosine(context.hour, 15.0)
}

fn relative_humidity(temperature_c: f64, dew_point_c: f64) -> f64 {
    let a = 17.625;
    let b = 243.04;
    let numerator = (a * dew_point_c) / (b + dew_point_c);
    let denominator = (a * temperature_c) / (b + temperature_c);
    (100.0 * (numerator - denominator).exp()).clamp(0.0, 100.0)
}

fn gamma_params_from_mean_variance(mean: f64, variance: f64) -> GammaParams {
    let safe_mean = mean.max(0.01);
    let safe_variance = variance.max(0.01);

    GammaParams {
        shape: (safe_mean * safe_mean) / safe_variance,
        scale: safe_variance / safe_mean,
    }
}

fn metric_group_mean(sensors: &[SeedSensor], metric: &MetricType) -> f64 {
    let mut total = 0.0;
    let mut count = 0.0;

    for sensor in sensors {
        if &sensor.device_type == metric {
            total += sensor.simulation.mean;
            count += 1.0;
        }
    }

    if count == 0.0 { 0.0 } else { total / count }
}

fn monthly_value(values: &[f64; 12], context: &TemporalContext) -> f64 {
    lerp(
        values[context.month_index],
        values[context.next_month_index],
        context.month_progress.clamp(0.0, 1.0),
    )
}

fn lerp(start: f64, end: f64, progress: f64) -> f64 {
    start + (end - start) * progress
}

fn diurnal_cosine(hour: f64, peak_hour: f64) -> f64 {
    (2.0 * std::f64::consts::PI * (hour - peak_hour) / 24.0).cos()
}

fn hourly_bump(hour: f64, center: f64, width: f64) -> f64 {
    let delta = circular_hour_distance(hour, center);
    (-0.5 * (delta / width).powi(2)).exp()
}

fn circular_hour_distance(hour: f64, center: f64) -> f64 {
    let delta = (hour - center).abs();
    delta.min(24.0 - delta)
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let current_month = NaiveDate::from_ymd_opt(year, month, 1).expect("valid month");
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    let next_month = NaiveDate::from_ymd_opt(next_year, next_month, 1).expect("valid next month");

    (next_month - current_month).num_days() as u32
}

async fn submit_reading(
    client: &reqwest::Client,
    sensor: &SeedSensor,
    reading: &IndividualSensorReading,
    options: &SeedOptions,
) -> SubmitReadingResult {
    let request = client
        .post(format!("{}/internal/telemetry/ingest", options.remote_url))
        .json(reading)
        .header("x-scemas-device-id", &sensor.sensor_id)
        .header("x-scemas-device-token", &options.device_auth_secret);

    match request.send().await {
        Ok(response) => {
            let status = response.status();
            let body = match response.text().await {
                Ok(body) => body,
                Err(error) => {
                    return SubmitReadingResult::Failed {
                        message: format!("connection failed: {error}"),
                    };
                }
            };

            if status.is_success() {
                SubmitReadingResult::Accepted
            } else {
                SubmitReadingResult::Rejected {
                    message: format_error_response(
                        status.as_u16(),
                        status.canonical_reason(),
                        &body,
                    ),
                }
            }
        }
        Err(error) if error.is_timeout() => SubmitReadingResult::Failed {
            message: format!("request timed out after {}ms", options.request_timeout_ms),
        },
        Err(error) => SubmitReadingResult::Failed {
            message: format!("connection failed: {error}"),
        },
    }
}

fn format_error_response(status: u16, status_text: Option<&str>, response_body: &str) -> String {
    let body_error = parse_json_error(response_body)
        .unwrap_or_else(|| response_body.trim().to_owned())
        .trim()
        .to_owned();
    let message = if body_error.is_empty() {
        status_text.unwrap_or("request failed").to_owned()
    } else {
        body_error
    };

    format!("{message} [{status}]")
}

fn parse_json_error(response_body: &str) -> Option<String> {
    let parsed_value = serde_json::from_str::<serde_json::Value>(response_body).ok()?;
    parsed_value
        .get("error")
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned)
}

struct GammaParams {
    shape: f64,
    scale: f64,
}

fn gamma_sample(shape: f64, scale: f64) -> f64 {
    if shape < 1.0 {
        return gamma_sample(shape + 1.0, scale) * uniform01().powf(1.0 / shape);
    }

    let d = shape - (1.0 / 3.0);
    let c = 1.0 / (9.0 * d).sqrt();

    loop {
        let x = gaussian01();
        let v = 1.0 + (c * x);
        if v <= 0.0 {
            continue;
        }

        let v_cubed = v * v * v;
        let u = uniform01();

        if u < 1.0 - 0.0331 * x.powi(4) {
            return d * v_cubed * scale;
        }

        if u.ln() < 0.5 * x * x + d * (1.0 - v_cubed + v_cubed.ln()) {
            return d * v_cubed * scale;
        }
    }
}

fn gaussian01() -> f64 {
    let u1 = uniform01();
    let u2 = uniform01();
    (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
}

fn exponential_sample(rate: f64) -> f64 {
    -uniform01().ln() / rate
}

fn uniform01() -> f64 {
    loop {
        let value = random::<f64>();
        if value > 0.0 {
            return value;
        }
    }
}

fn round_to_hundredths(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn parse_positive_rate(value: &str) -> Result<f64, String> {
    let parsed_value = value
        .parse::<f64>()
        .map_err(|_| format!("invalid --rate value: {value}"))?;
    if parsed_value <= 0.0 {
        return Err(format!("invalid --rate value: {value}"));
    }

    Ok(parsed_value)
}

fn parse_spike_ratio(value: &str) -> Result<f64, String> {
    let parsed_value = value
        .parse::<f64>()
        .map_err(|_| format!("invalid --spike-ratio value: {value}"))?;
    if !(0.0..=1.0).contains(&parsed_value) {
        return Err(format!("invalid --spike-ratio value: {value}"));
    }

    Ok(parsed_value)
}

fn parse_positive_timeout_ms(value: &str) -> Result<u64, String> {
    let parsed_value = value
        .parse::<u64>()
        .map_err(|_| format!("invalid --request-timeout-ms value: {value}"))?;
    if parsed_value == 0 {
        return Err(format!("invalid --request-timeout-ms value: {value}"));
    }

    Ok(parsed_value)
}

fn default_request_timeout_ms(url: &str) -> u64 {
    let Ok(parsed_url) = Url::parse(url) else {
        return DEFAULT_REMOTE_REQUEST_TIMEOUT_MS;
    };

    let host = parsed_url.host_str().unwrap_or_default();
    if matches!(host, "localhost" | "127.0.0.1" | "0.0.0.0") {
        DEFAULT_LOCAL_REQUEST_TIMEOUT_MS
    } else {
        DEFAULT_REMOTE_REQUEST_TIMEOUT_MS
    }
}

fn format_rate(rate: f64) -> String {
    if rate.fract() == 0.0 {
        format!("{rate:.0}")
    } else {
        format!("{rate:.1}")
    }
}

fn format_ratio(ratio: f64) -> String {
    format!("{:.1}%", ratio * 100.0)
}

fn format_spike_mode(options: &SeedOptions) -> String {
    if options.spike {
        return "SPIKE mode".to_owned();
    }

    if options.spike_ratio > 0.0 {
        return format!(
            "mixed mode, spike ratio {}",
            format_ratio(options.spike_ratio)
        );
    }

    "normal mode".to_owned()
}

#[cfg(test)]
mod tests {
    use crate::seed::{
        DEFAULT_LOCAL_REQUEST_TIMEOUT_MS, DEFAULT_REMOTE_REQUEST_TIMEOUT_MS, SeedCalibration,
        SeedOptions, SeedSensor, SensorSimulationProfile, TemporalContext,
        build_weighted_sensor_index, default_request_timeout_ms, generate_reading,
        target_air_quality, target_humidity, target_noise, target_temperature,
    };
    use scemas_core::models::MetricType;
    use std::path::Path;

    #[test]
    fn local_hosts_use_local_timeout() {
        assert_eq!(
            default_request_timeout_ms("http://localhost:3001"),
            DEFAULT_LOCAL_REQUEST_TIMEOUT_MS
        );
        assert_eq!(
            default_request_timeout_ms("http://127.0.0.1:3001"),
            DEFAULT_LOCAL_REQUEST_TIMEOUT_MS
        );
    }

    #[test]
    fn remote_hosts_use_remote_timeout() {
        assert_eq!(
            default_request_timeout_ms("https://example.com"),
            DEFAULT_REMOTE_REQUEST_TIMEOUT_MS
        );
    }

    #[test]
    fn weighted_sensor_index_accumulates_sampling_weights() {
        let weighted_sensors =
            build_weighted_sensor_index(vec![test_sensor("fast", 10), test_sensor("slow", 20)]);

        assert_eq!(weighted_sensors.len(), 2);
        assert!((weighted_sensors[0].cumulative_weight - 0.1).abs() < 1e-9);
        assert!((weighted_sensors[1].cumulative_weight - 0.15).abs() < 1e-9);
    }

    #[test]
    fn forced_spike_pushes_reading_above_catalog_baseline() {
        let options = SeedOptions {
            spike: true,
            spike_ratio: 0.0,
            rate_per_second: 2.0,
            remote_url: "http://localhost:3001".to_owned(),
            request_timeout_ms: DEFAULT_LOCAL_REQUEST_TIMEOUT_MS,
            device_auth_secret: "secret".to_owned(),
            catalog_path: Path::new("data/hamilton-sensor-catalog.json").to_path_buf(),
        };
        let sensor = test_sensor("air", 30);
        let calibration = SeedCalibration::from_sensors(std::slice::from_ref(&sensor));
        let context = TemporalContext::at(2026, 7, 10, 14, 0);

        let reading = generate_reading(&sensor, &options, &calibration, &context);

        assert!(reading.is_spike);
        assert!(reading.reading.value >= sensor.simulation.spike);
    }

    #[test]
    fn temperature_targets_track_hamilton_seasons() {
        let january_midday = TemporalContext::at(2026, 1, 15, 14, 0);
        let july_midday = TemporalContext::at(2026, 7, 15, 14, 0);

        let january = target_temperature(0.0, &january_midday);
        let july = target_temperature(0.0, &july_midday);

        assert!(january < 2.0);
        assert!(july > 24.0);
        assert!(july - january > 20.0);
    }

    #[test]
    fn humidity_targets_follow_dew_point_climatology() {
        let january_morning = TemporalContext::at(2026, 1, 15, 6, 0);
        let july_afternoon = TemporalContext::at(2026, 7, 15, 15, 0);

        let january = target_humidity(0.0, &january_morning);
        let july = target_humidity(0.0, &july_afternoon);

        assert!(january > july);
        assert!(january > 75.0);
        assert!(july < 75.0);
    }

    #[test]
    fn air_quality_targets_rise_on_summer_afternoons() {
        let spring_night = TemporalContext::at(2026, 4, 15, 2, 0);
        let summer_afternoon = TemporalContext::at(2026, 7, 15, 14, 0);

        let spring = target_air_quality(0.0, &spring_night);
        let summer = target_air_quality(0.0, &summer_afternoon);

        assert!(summer > spring);
    }

    #[test]
    fn noise_targets_show_commute_pattern() {
        let sensor = noise_sensor("noise", 30);
        let overnight = TemporalContext::at(2026, 6, 17, 2, 0);
        let rush_hour = TemporalContext::at(2026, 6, 17, 17, 30);

        let overnight_level = target_noise(&sensor, 58.7, 0.0, &overnight);
        let rush_hour_level = target_noise(&sensor, 58.7, 0.0, &rush_hour);

        assert!(rush_hour_level > overnight_level + 6.0);
    }

    fn test_sensor(sensor_id: &str, sampling_interval_seconds: u64) -> SeedSensor {
        SeedSensor {
            sensor_id: sensor_id.to_owned(),
            display_name: sensor_id.to_owned(),
            device_type: MetricType::AirQuality,
            zone: "downtown_core".to_owned(),
            region_label: "downtown".to_owned(),
            site_name: "test site".to_owned(),
            sampling_interval_seconds,
            telemetry_unit: "aqi".to_owned(),
            simulation: SensorSimulationProfile {
                mean: 12.0,
                variance: 3.0,
                spike: 55.0,
                min: 0.0,
                max: 100.0,
            },
        }
    }

    fn noise_sensor(sensor_id: &str, sampling_interval_seconds: u64) -> SeedSensor {
        SeedSensor {
            sensor_id: sensor_id.to_owned(),
            display_name: sensor_id.to_owned(),
            device_type: MetricType::NoiseLevel,
            zone: "downtown_core".to_owned(),
            region_label: "downtown".to_owned(),
            site_name: "test site".to_owned(),
            sampling_interval_seconds,
            telemetry_unit: "db".to_owned(),
            simulation: SensorSimulationProfile {
                mean: 58.7,
                variance: 12.0,
                spike: 92.0,
                min: 0.0,
                max: 130.0,
            },
        }
    }
}
