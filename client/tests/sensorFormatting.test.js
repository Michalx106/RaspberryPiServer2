import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatSensorReading } from '../src/utils/sensorFormatting.js'

test('returns Unavailable for null or non-object states', () => {
  assert.equal(formatSensorReading(null), 'Unavailable')
  assert.equal(formatSensorReading(undefined), 'Unavailable')
  assert.equal(formatSensorReading('offline'), 'Unavailable')
})

test('preserves value/unit sensor shape', () => {
  assert.equal(formatSensorReading({ value: 12 }), '12')
  assert.equal(formatSensorReading({ value: 12, unit: 'Lux' }), '12 Lux')
  assert.equal(formatSensorReading({ value: null, unit: 'Lux' }), 'Unavailable')
})

test('formats multi-field sensor objects with known suffixes', () => {
  const reading = formatSensorReading({
    temperatureC: 24.2,
    humidityPercent: 40
  })

  assert.equal(reading, 'Temperature: 24.2 °C, Humidity: 40 %')
})

test('ignores keys with empty values and falls back when nothing remains', () => {
  assert.equal(
    formatSensorReading({ temperatureC: null, humidityPercent: undefined }),
    'Unavailable'
  )
})

test('returns Unavailable for non-plain objects', () => {
  const date = new Date()
  assert.equal(formatSensorReading(date), 'Unavailable')
})

test('humanises unknown suffix keys without appending units', () => {
  assert.equal(formatSensorReading({ dew_point: 13 }), 'Dew point: 13')
})
