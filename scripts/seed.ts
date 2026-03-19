// seed script: continuously generates sensor data using poisson/gamma distributions
// usage: bun run scripts/seed.ts [--spike] [--rate <readings-per-second>]
//   ctrl-c to stop and print summary

const RUST_URL = process.env.INTERNAL_RUST_URL ?? 'http://localhost:3001'
const DEVICE_AUTH_SECRET =
  process.env.DEVICE_AUTH_SECRET ?? 'change-me-device-ingest-secret'
const seedOptions = parseSeedOptions(process.argv.slice(2))

interface Sensor {
  sensor_id: string
  device_type: string
  zone: string
}

// gamma distribution parameters per metric type
// shape k = mean^2/variance, scale theta = variance/mean
// chosen so k*theta ~ real-world baseline mean for hamilton, ON
const gammaParams: Record<
  string,
  { shape: number; scale: number; clamp: [number, number] }
> = {
  temperature: { shape: 12.96, scale: 1.39, clamp: [-10, 45] },
  humidity: { shape: 30.25, scale: 1.82, clamp: [0, 100] },
  air_quality: { shape: 5.44, scale: 6.43, clamp: [0, 500] },
  noise_level: { shape: 17.36, scale: 2.88, clamp: [0, 130] },
}

// spike values that should trigger alerts
const spikeValues: Record<string, number> = {
  temperature: 42,
  humidity: 95,
  air_quality: 180,
  noise_level: 95,
}

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

function generateReading(sensor: Sensor) {
  const params = gammaParams[sensor.device_type]
  if (!params) return null

  const raw = seedOptions.isSpike
    ? (spikeValues[sensor.device_type] ?? params.shape * params.scale)
    : gammaSample(params.shape, params.scale)

  const value = Math.max(params.clamp[0], Math.min(params.clamp[1], raw))

  return {
    sensorId: sensor.sensor_id,
    metricType: sensor.device_type,
    value: Math.round(value * 100) / 100,
    zone: sensor.zone,
    timestamp: new Date().toISOString(),
  }
}

async function main() {
  const sensorsFile = Bun.file('./data/hamilton-sensors.json')
  const sensors: Sensor[] = await sensorsFile.json()

  console.log(
    `continuous seed: ${sensors.length} sensors, \u03bb=${formatRate(seedOptions.ratePerSecond)}/s (${seedOptions.isSpike ? 'SPIKE' : 'normal'} mode)`,
  )
  console.log('ctrl-c to stop\n')

  let accepted = 0
  let rejected = 0
  let total = 0
  const startTime = Date.now()

  let running = true
  process.on('SIGINT', () => {
    running = false
  })

  while (running) {
    const sensor = sensors[Math.floor(Math.random() * sensors.length)]
    const reading = generateReading(sensor)
    if (!reading) continue

    total++

    try {
      const res = await fetch(`${RUST_URL}/internal/telemetry/ingest`, {
        method: 'POST',
        body: JSON.stringify(reading),
        headers: {
          'Content-Type': 'application/json',
          'x-scemas-device-id': sensor.sensor_id,
          'x-scemas-device-token': DEVICE_AUTH_SECRET,
        },
      })

      if (res.ok) {
        accepted++
        await res.json()
        console.log(
          `  \u2713 ${reading.sensorId}: ${reading.metricType} = ${reading.value}`,
        )
      } else {
        rejected++
        const err = await res.json()
        console.log(`  \u2717 ${reading.sensorId}: ${err.error}`)
      }
    } catch {
      rejected++
      console.log(`  \u2717 ${reading.sensorId}: connection failed`)
    }

    // poisson inter-arrival: sleep for Exp(lambda) seconds
    const delay = exponentialSample(seedOptions.ratePerSecond) * 1000
    await Bun.sleep(delay)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  const rate = (total / parseFloat(elapsed)).toFixed(1)
  console.log(
    `\nstopped. ${elapsed}s elapsed, ${total} sent (${rate}/s), accepted: ${accepted}, rejected: ${rejected}`,
  )
}

function parseSeedOptions(args: string[]): SeedOptions {
  let isSpike = false
  let ratePerSecond = 2

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (argument === '--spike') {
      isSpike = true
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

    printUsageAndExit(1, `unknown argument: ${argument}`)
  }

  return {
    isSpike,
    ratePerSecond,
  }
}

function parsePositiveRate(value: string): number {
  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    printUsageAndExit(1, `invalid --rate value: ${value}`)
  }

  return parsedValue
}

function printUsageAndExit(exitCode: number, errorMessage?: string): never {
  if (errorMessage) {
    console.error(`[scemas] ${errorMessage}`)
    console.error('')
  }

  console.log('usage: bun run scripts/seed.ts [--spike] [--rate <readings-per-second>]')
  console.log('')
  console.log('options:')
  console.log('  --spike          generate readings that should trigger alerts')
  console.log('  --rate <value>   aggregate poisson arrival rate across all sensors')
  console.log('  --help           show this help message')
  process.exit(exitCode)
}

function formatRate(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1)
}

type SeedOptions = {
  isSpike: boolean
  ratePerSecond: number
}

main()
