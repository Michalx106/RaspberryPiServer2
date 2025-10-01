const KNOWN_SUFFIX_UNITS = new Map([
  ['Percent', '%'],
  ['C', '°C'],
  ['F', '°F'],
  ['K', 'K']
])

const isPlainObject = (value) => {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

const humanize = (input) => {
  if (!input) {
    return ''
  }

  const spaced = input
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!spaced) {
    return ''
  }

  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const normalizeKey = (key) => {
  for (const [suffix, unit] of KNOWN_SUFFIX_UNITS) {
    if (key.endsWith(suffix) && key.length > suffix.length) {
      const baseKey = key.slice(0, key.length - suffix.length)
      return {
        label: humanize(baseKey),
        unit
      }
    }
  }

  return {
    label: humanize(key),
    unit: ''
  }
}

const formatValueWithUnit = (value, unit) => {
  if (value === null || value === undefined) {
    return null
  }

  const stringValue =
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
      ? String(value)
      : null

  if (stringValue === null) {
    return null
  }

  return unit ? `${stringValue} ${unit}` : stringValue
}

export const formatSensorReading = (state) => {
  if (!state || typeof state !== 'object') {
    return 'Unavailable'
  }

  if (Object.prototype.hasOwnProperty.call(state, 'value')) {
    const { value, unit } = state

    if (value === null || value === undefined) {
      return 'Unavailable'
    }

    return `${value}${unit ? ` ${unit}` : ''}`
  }

  if (!isPlainObject(state)) {
    return 'Unavailable'
  }

  const formattedEntries = Object.entries(state)
    .map(([key, value]) => {
      const { label, unit } = normalizeKey(key)
      const formattedValue = formatValueWithUnit(value, unit)

      if (!label || formattedValue === null) {
        return null
      }

      return `${label}: ${formattedValue}`
    })
    .filter((entry) => entry !== null)

  if (!formattedEntries.length) {
    return 'Unavailable'
  }

  return formattedEntries.join('\n')
}

export default formatSensorReading
