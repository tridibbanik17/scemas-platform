// seed script: continuously generates sensor data using poisson/gamma distributions
// usage: bun run scripts/seed.ts [--spike] [--spike-ratio <0..1>] [--rate <readings-per-second>] [--remote <url>] [--request-timeout-ms <milliseconds>]
//   ctrl-c to stop and print summary

const seedOptions = parseSeedOptions(process.argv.slice(2))
const RUST_URL = seedOptions.remoteUrl ?? process.env.INTERNAL_RUST_URL ?? 'http://localhost:3001'
const DEVICE_AUTH_SECRET = process.env.DEVICE_AUTH_SECRET ?? 'change-me-device-ingest-secret'
const DEFAULT_LOCAL_REQUEST_TIMEOUT_MS = 10_000
const DEFAULT_REMOTE_REQUEST_TIMEOUT_MS = 45_000

interface Sensor {
  sensor_id: string
  asset_id: string
  station_id: string
  display_name: string
  device_type: string
  zone: string
  region_label: string
  site_name: string
  placement: string
  provider: string
  sampling_interval_seconds: number
  telemetry_unit: string
  install_height_m: number
  simulation: SensorSimulationProfile
}

type SensorSimulationProfile = {
  mean: number
  variance: number
  spike: number
  min: number
  max: number
}

type WeightedSensor = { sensor: Sensor; cumulativeWeight: number }

type GeneratedReading = {
  isSpike: boolean
  reading: { sensorId: string; metricType: string; value: number; zone: string; timestamp: string }
}

type SubmitReadingResult =
  | { kind: 'accepted' }
  | { kind: 'rejected'; message: string }
  | { kind: 'failed'; message: string }

// marsaglia-tsang method for Gamma(shape, 1) where shape >= 1
function gammaSample(shape: number, scale: number): number {
  if (shape < 1) {
    return gammaSample(shape + 1, scale) * Math.pow(Math.random(), 1 / shape)
  }

  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)

  while (true) {
    let x: number
    let v: number

    do {
      x = gaussian01()
      v = 1 + c * x
    } while (v <= 0)

    v = v * v * v
    const u = Math.random()

    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v * scale
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v * scale
    }
  }
}

// standard normal via box-muller (helper for marsaglia-tsang)
function gaussian01(): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

// exponential distribution for poisson inter-arrival times
function exponentialSample(rate: number): number {
  return -Math.log(Math.random()) / rate
}

function generateReading(sensor: Sensor): GeneratedReading {
  const params = gammaParamsForSensor(sensor)
  const isSpike = seedOptions.isSpike || Math.random() < seedOptions.spikeRatio

  const raw = isSpike ? sensor.simulation.spike : gammaSample(params.shape, params.scale)

  const value = Math.max(sensor.simulation.min, Math.min(sensor.simulation.max, raw))

  return {
    isSpike,
    reading: {
      sensorId: sensor.sensor_id,
      metricType: sensor.device_type,
      value: Math.round(value * 100) / 100,
      zone: sensor.zone,
      timestamp: new Date().toISOString(),
    },
  }
}

async function main() {
  const sensorsFile = Bun.file('./data/hamilton-sensor-catalog.json')
  const sensors: Sensor[] = await sensorsFile.json()
  const weightedSensors = buildWeightedSensorIndex(sensors)
  const requestTimeoutMs = seedOptions.requestTimeoutMs ?? defaultRequestTimeoutMs(RUST_URL)

  console.log(
    `continuous seed: ${sensors.length} sensors, \u03bb=${formatRate(seedOptions.ratePerSecond)}/s (${formatSpikeMode(seedOptions)})`,
  )
  console.log(`target: ${RUST_URL}/internal/telemetry/ingest, timeout=${requestTimeoutMs}ms`)
  console.log('ctrl-c to stop\n')

  let accepted = 0
  let rejected = 0
  let spikeEvents = 0
  let total = 0
  const startTime = Date.now()

  let running = true
  let activeRequestAbortController: AbortController | null = null
  process.on('SIGINT', () => {
    running = false
    activeRequestAbortController?.abort('seed interrupted')
  })

  while (running) {
    const sensor = pickSensor(weightedSensors)
    if (!sensor) {
      console.log('  \u2717 no sensors available in the catalog')
      break
    }

    const generatedReading = generateReading(sensor)
    const reading = generatedReading.reading
    const spikeSuffix = generatedReading.isSpike ? ' [SPIKE]' : ''
    if (generatedReading.isSpike) {
      spikeEvents += 1
    }

    total++

    const submitResult = await submitReading(sensor, reading, requestTimeoutMs, {
      setController(controller) {
        activeRequestAbortController = controller
      },
      clearController(controller) {
        if (activeRequestAbortController === controller) {
          activeRequestAbortController = null
        }
      },
    })

    if (submitResult.kind === 'accepted') {
      accepted++
      console.log(
        `  \u2713 ${sensor.display_name}: ${reading.value} ${sensor.telemetry_unit} at ${sensor.site_name} (${sensor.region_label})${spikeSuffix}`,
      )
    } else {
      rejected++
      console.log(
        `  \u2717 ${sensor.display_name}: ${submitResult.message} (${sensor.region_label})${spikeSuffix}`,
      )
    }

    if (!running) {
      break
    }

    // poisson inter-arrival: sleep for Exp(lambda) seconds
    const delay = exponentialSample(seedOptions.ratePerSecond) * 1000
    await sleepInterruptibly(delay, () => running)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  const rate = (total / parseFloat(elapsed)).toFixed(1)
  console.log(
    `\nstopped. ${elapsed}s elapsed, ${total} sent (${rate}/s), spikes: ${spikeEvents} (${formatRatio(total === 0 ? 0 : spikeEvents / total)}), accepted: ${accepted}, rejected: ${rejected}`,
  )
}

function parseSeedOptions(args: string[]): SeedOptions {
  let isSpike = false
  let spikeRatio = 0
  let ratePerSecond = 2
  let remoteUrl: string | undefined
  let requestTimeoutMs: number | undefined

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (argument === '--spike') {
      isSpike = true
      continue
    }

    if (argument === '--spike-ratio') {
      const nextArgument = args[index + 1]
      if (!nextArgument) {
        printUsageAndExit(1, 'missing value for --spike-ratio')
      }

      spikeRatio = parseSpikeRatio(nextArgument)
      index += 1
      continue
    }

    if (argument.startsWith('--spike-ratio=')) {
      spikeRatio = parseSpikeRatio(argument.slice('--spike-ratio='.length))
      continue
    }

    if (argument === '--help' || argument === '-h') {
      printUsageAndExit(0)
    }

    if (argument === '--rate') {
      const nextArgument = args[index + 1]
      if (!nextArgument) {
        printUsageAndExit(1, 'missing value for --rate')
      }

      ratePerSecond = parsePositiveRate(nextArgument)
      index += 1
      continue
    }

    if (argument.startsWith('--rate=')) {
      ratePerSecond = parsePositiveRate(argument.slice('--rate='.length))
      continue
    }

    if (argument === '--remote') {
      const nextArgument = args[index + 1]
      if (!nextArgument) {
        printUsageAndExit(1, 'missing value for --remote')
      }

      remoteUrl = nextArgument
      index += 1
      continue
    }

    if (argument.startsWith('--remote=')) {
      remoteUrl = argument.slice('--remote='.length)
      continue
    }

    if (argument === '--request-timeout-ms') {
      const nextArgument = args[index + 1]
      if (!nextArgument) {
        printUsageAndExit(1, 'missing value for --request-timeout-ms')
      }

      requestTimeoutMs = parsePositiveTimeoutMs(nextArgument)
      index += 1
      continue
    }

    if (argument.startsWith('--request-timeout-ms=')) {
      requestTimeoutMs = parsePositiveTimeoutMs(argument.slice('--request-timeout-ms='.length))
      continue
    }

    printUsageAndExit(1, `unknown argument: ${argument}`)
  }

  if (isSpike && spikeRatio > 0) {
    printUsageAndExit(1, 'use either --spike or --spike-ratio, not both')
  }

  return { isSpike, spikeRatio, ratePerSecond, remoteUrl, requestTimeoutMs }
}

function parsePositiveRate(value: string): number {
  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    printUsageAndExit(1, `invalid --rate value: ${value}`)
  }

  return parsedValue
}

function parseSpikeRatio(value: string): number {
  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 1) {
    printUsageAndExit(1, `invalid --spike-ratio value: ${value}`)
  }

  return parsedValue
}

function parsePositiveTimeoutMs(value: string): number {
  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    printUsageAndExit(1, `invalid --request-timeout-ms value: ${value}`)
  }

  return Math.round(parsedValue)
}

function gammaParamsForSensor(sensor: Sensor) {
  const mean = Math.max(sensor.simulation.mean, 0.01)
  const variance = Math.max(sensor.simulation.variance, 0.01)

  return { shape: (mean * mean) / variance, scale: variance / mean }
}

function buildWeightedSensorIndex(sensors: Sensor[]): WeightedSensor[] {
  const weightedSensors: WeightedSensor[] = []
  let cumulativeWeight = 0

  for (const sensor of sensors) {
    cumulativeWeight += 1 / Math.max(sensor.sampling_interval_seconds, 1)
    weightedSensors.push({ sensor, cumulativeWeight })
  }

  return weightedSensors
}

function pickSensor(weightedSensors: WeightedSensor[]): Sensor | null {
  const totalWeight = weightedSensors.at(-1)?.cumulativeWeight
  if (!totalWeight) {
    return null
  }

  const target = Math.random() * totalWeight
  for (const weightedSensor of weightedSensors) {
    if (target <= weightedSensor.cumulativeWeight) {
      return weightedSensor.sensor
    }
  }

  return weightedSensors.at(-1)?.sensor ?? null
}

function printUsageAndExit(exitCode: number, errorMessage?: string): never {
  if (errorMessage) {
    console.error(`[scemas] ${errorMessage}`)
    console.error('')
  }

  console.log(
    'usage: bun run scripts/seed.ts [--spike] [--spike-ratio <0..1>] [--rate <readings-per-second>] [--remote <url>] [--request-timeout-ms <milliseconds>]',
  )
  console.log('')
  console.log('options:')
  console.log('  --spike          generate readings that should trigger alerts')
  console.log('  --spike-ratio    randomly emit spike readings at the given share, from 0 to 1')
  console.log('  --rate <value>   aggregate poisson arrival rate across all sensors')
  console.log(
    '  --remote <url>   override the rust engine URL (default: INTERNAL_RUST_URL or localhost:3001)',
  )
  console.log(
    '  --request-timeout-ms <value>  abort a stalled ingest request after the given timeout',
  )
  console.log('  --help           show this help message')
  process.exit(exitCode)
}

function formatRate(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1)
}

function formatRatio(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatSpikeMode(options: SeedOptions): string {
  if (options.isSpike) {
    return 'SPIKE mode'
  }

  if (options.spikeRatio > 0) {
    return `mixed mode, spike ratio ${formatRatio(options.spikeRatio)}`
  }

  return 'normal mode'
}

type SeedOptions = {
  isSpike: boolean
  spikeRatio: number
  ratePerSecond: number
  remoteUrl?: string
  requestTimeoutMs?: number
}

function defaultRequestTimeoutMs(url: string): number {
  try {
    const parsedUrl = new URL(url)
    const isLocalHost =
      parsedUrl.hostname === 'localhost' ||
      parsedUrl.hostname === '127.0.0.1' ||
      parsedUrl.hostname === '0.0.0.0'

    return isLocalHost ? DEFAULT_LOCAL_REQUEST_TIMEOUT_MS : DEFAULT_REMOTE_REQUEST_TIMEOUT_MS
  } catch {
    return DEFAULT_REMOTE_REQUEST_TIMEOUT_MS
  }
}

async function submitReading(
  sensor: Sensor,
  reading: GeneratedReading['reading'],
  requestTimeoutMs: number,
  requestState: {
    setController(controller: AbortController): void
    clearController(controller: AbortController): void
  },
): Promise<SubmitReadingResult> {
  const controller = new AbortController()
  requestState.setController(controller)

  const timeoutId = setTimeout(() => {
    controller.abort(`request timed out after ${requestTimeoutMs}ms`)
  }, requestTimeoutMs)

  try {
    const response = await fetch(`${RUST_URL}/internal/telemetry/ingest`, {
      method: 'POST',
      body: JSON.stringify(reading),
      headers: {
        'Content-Type': 'application/json',
        'x-scemas-device-id': sensor.sensor_id,
        'x-scemas-device-token': DEVICE_AUTH_SECRET,
      },
      signal: controller.signal,
    })

    const responseBody = await response.text()
    if (response.ok) {
      return { kind: 'accepted' }
    }

    return {
      kind: 'rejected',
      message: formatErrorResponse(response.status, response.statusText, responseBody),
    }
  } catch (error) {
    return {
      kind: 'failed',
      message: formatFetchFailure(error, requestTimeoutMs, controller.signal.aborted),
    }
  } finally {
    clearTimeout(timeoutId)
    requestState.clearController(controller)
  }
}

function formatErrorResponse(status: number, statusText: string, responseBody: string): string {
  const parsedBody = parseJsonObject(responseBody)
  const bodyError =
    parsedBody && typeof parsedBody.error === 'string'
      ? parsedBody.error
      : responseBody.trim() || statusText || 'request failed'

  return `${bodyError} [${status}]`
}

function formatFetchFailure(
  error: unknown,
  requestTimeoutMs: number,
  wasAborted: boolean,
): string {
  if (wasAborted || (error instanceof DOMException && error.name === 'AbortError')) {
    return `request timed out after ${requestTimeoutMs}ms`
  }

  if (error instanceof Error && error.message.length > 0) {
    return `connection failed: ${error.message}`
  }

  return 'connection failed'
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  if (!value.trim()) {
    return null
  }

  try {
    const parsedValue = JSON.parse(value)
    return isJsonObject(parsedValue) ? parsedValue : null
  } catch {
    return null
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function sleepInterruptibly(delayMs: number, shouldContinue: () => boolean): Promise<void> {
  const sleepStepMs = 250
  let remainingDelayMs = delayMs

  while (shouldContinue() && remainingDelayMs > 0) {
    const currentStepMs = Math.min(sleepStepMs, remainingDelayMs)
    await Bun.sleep(currentStepMs)
    remainingDelayMs -= currentStepMs
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[scemas] seed failed: ${message}`)
  process.exit(1)
})
