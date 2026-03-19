// seed script: loads sample JSON data and POSTs to the Rust internal API
// usage: bun run scripts/seed.ts [--spike]

const RUST_URL = process.env.INTERNAL_RUST_URL ?? 'http://localhost:3001'
const isSpike = process.argv.includes('--spike')

interface Sensor {
  sensor_id: string
  device_type: string
  zone: string
}

// baseline ranges per metric type (hamilton, ON, typical)
const baselines: Record<string, { mean: number; stddev: number }> = {
  temperature: { mean: 18, stddev: 5 },
  humidity: { mean: 55, stddev: 10 },
  air_quality: { mean: 35, stddev: 15 }, // PM2.5 μg/m³
  noise_level: { mean: 50, stddev: 12 }, // decibels
}

// spike values that should trigger alerts
const spikeValues: Record<string, number> = {
  temperature: 42, // heatwave
  humidity: 95, // extreme
  air_quality: 180, // unhealthy
  noise_level: 95, // very loud
}

function gaussian(mean: number, stddev: number): number {
  // box-muller transform
  const u1 = Math.random()
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + z * stddev
}

function generateReading(sensor: Sensor) {
  const baseline = baselines[sensor.device_type]
  if (!baseline) return null

  const value = isSpike
    ? spikeValues[sensor.device_type] ?? baseline.mean
    : gaussian(baseline.mean, baseline.stddev)

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
    `seeding ${sensors.length} sensor readings (${isSpike ? 'SPIKE' : 'normal'} mode)`,
  )

  let accepted = 0
  let rejected = 0

  for (const sensor of sensors) {
    const reading = generateReading(sensor)
    if (!reading) continue

    try {
      const res = await fetch(`${RUST_URL}/internal/telemetry/ingest`, {
        method: 'POST',
        body: JSON.stringify(reading),
        headers: { 'Content-Type': 'application/json' },
      })

      if (res.ok) {
        accepted++
        const data = await res.json()
        console.log(`  ✓ ${reading.sensorId}: ${reading.metricType} = ${reading.value}`)
      } else {
        rejected++
        const err = await res.json()
        console.log(`  ✗ ${reading.sensorId}: ${err.error}`)
      }
    } catch (e) {
      rejected++
      console.log(`  ✗ ${reading.sensorId}: connection failed (is the rust server running?)`)
    }
  }

  console.log(`\ndone. accepted: ${accepted}, rejected: ${rejected}`)
}

main()
