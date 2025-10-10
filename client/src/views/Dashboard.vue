<template>
  <div class="dashboard">
    <h1>System Metrics Dashboard</h1>

    <section class="cards">
      <article class="card" v-for="card in metricCards" :key="card.label">
        <h2>{{ card.label }}</h2>
        <p class="value">
          <span v-if="card.value !== null">{{ card.value }}</span>
          <span v-else>--</span>
        </p>
        <p class="description">{{ card.description }}</p>
      </article>
    </section>

    <section class="chart-section">
      <header>
        <h2>Resource Usage History</h2>
        <p v-if="lastUpdated">Last updated: {{ lastUpdated }}</p>
        <p v-else>Waiting for historical data…</p>
      </header>
      <div class="chart-wrapper">
        <canvas
          ref="chartCanvas"
          aria-label="Line chart showing CPU, Memory, Disk, and Temperature history"
          role="img"
        ></canvas>
      </div>
    </section>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import axios from 'axios'
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineController,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const chartCanvas = ref(null)
const chartInstance = ref(null)
const errorMessage = ref('')
const currentMetrics = ref({
  cpu: null,
  memory: null,
  disk: null,
  temperature: null,
  timestamp: null,
})
const historyMetrics = ref([])
const historyConfig = ref({
  maxSamples: null,
})

const STREAM_ENDPOINT = '/api/metrics/stream'
const FALLBACK_POLL_INTERVAL_MS = 5000

let metricsStream = null
let fallbackIntervalId = null
let fallbackActive = false

watch(
  historyMetrics,
  () => {
    renderChart()
  },
  { deep: true }
)

const SCROLL_STORAGE_KEY = 'dashboard-scroll-position'
let scrollSaveFrame = null

const isBrowserEnvironment = () =>
  typeof window !== 'undefined' && typeof document !== 'undefined'

const getCurrentScrollPosition = () => {
  if (!isBrowserEnvironment()) return 0

  const scrollingElement =
    document.scrollingElement ?? document.documentElement ?? document.body

  return Math.max(
    0,
    Math.round(scrollingElement?.scrollTop ?? window.pageYOffset ?? 0)
  )
}

const applyScrollPosition = (position, behavior = 'auto') => {
  if (!isBrowserEnvironment()) return

  window.scrollTo({ top: Math.max(0, position), behavior })
}

const readStoredScrollPosition = () => {
  if (!isBrowserEnvironment()) {
    return null
  }

  try {
    const storedValue = window.sessionStorage?.getItem(SCROLL_STORAGE_KEY)
    if (!storedValue) return null

    const parsedValue = Number.parseInt(storedValue, 10)
    return Number.isFinite(parsedValue) ? Math.max(0, parsedValue) : null
  } catch (error) {
    console.warn('Unable to read stored scroll position', error)
    return null
  }
}

const saveScrollPosition = () => {
  if (!isBrowserEnvironment()) {
    return
  }

  try {
    window.sessionStorage?.setItem(
      SCROLL_STORAGE_KEY,
      String(getCurrentScrollPosition())
    )
  } catch (error) {
    console.warn('Unable to persist scroll position', error)
  }
}

const handleScroll = () => {
  if (!isBrowserEnvironment()) return

  if (scrollSaveFrame !== null) {
    window.cancelAnimationFrame(scrollSaveFrame)
  }

  scrollSaveFrame = window.requestAnimationFrame(() => {
    scrollSaveFrame = null
    saveScrollPosition()
  })
}

const restoreScrollPosition = () => {
  if (!isBrowserEnvironment()) return

  const savedPosition = readStoredScrollPosition()
  if (savedPosition === null) return

  applyScrollPosition(savedPosition)
}

const SCROLL_RESTORE_TOLERANCE = 2

const withScrollPreserved = async (operation) => {
  if (!isBrowserEnvironment()) {
    return operation()
  }

  const previousPosition = getCurrentScrollPosition()

  try {
    return await operation()
  } finally {
    await nextTick()
    window.requestAnimationFrame(() => {
      const currentPosition = getCurrentScrollPosition()
      if (Math.abs(currentPosition - previousPosition) <= SCROLL_RESTORE_TOLERANCE) {
        applyScrollPosition(previousPosition)
      }
    })
  }
}

const lastUpdated = computed(() => {
  if (!historyMetrics.value.length) return ''
  const lastEntry = historyMetrics.value.at(-1)
  if (!lastEntry?.timestamp) return ''
  const date = new Date(lastEntry.timestamp)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
})

const metricCards = computed(() => [
  {
    label: 'CPU Usage',
    value: currentMetrics.value.cpu !== null ? `${currentMetrics.value.cpu.toFixed(1)}%` : null,
    description: 'Current CPU utilization',
  },
  {
    label: 'Memory Usage',
    value: currentMetrics.value.memory !== null ? `${currentMetrics.value.memory.toFixed(1)}%` : null,
    description: 'Current memory consumption',
  },
  {
    label: 'Disk Usage',
    value: currentMetrics.value.disk !== null ? `${currentMetrics.value.disk.toFixed(1)}%` : null,
    description: 'Current disk utilization',
  },
  {
    label: 'Temperature',
    value: currentMetrics.value.temperature !== null ? `${currentMetrics.value.temperature.toFixed(1)}°C` : null,
    description: 'Current system temperature',
  },
])

const toFiniteNumber = (value) => {
  const numberValue = typeof value === 'string' ? Number.parseFloat(value) : value
  return Number.isFinite(numberValue) ? numberValue : null
}

const toPositiveInteger = (value) => {
  const numericValue = toFiniteNumber(value)
  if (!Number.isFinite(numericValue)) return null

  const integerValue = Math.trunc(numericValue)
  return integerValue > 0 ? integerValue : null
}

const mapCurrentMetrics = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      cpu: null,
      memory: null,
      disk: null,
      temperature: null,
      timestamp: null,
    }
  }

  const cpuLoad = toFiniteNumber(data?.cpu?.load)
  const memoryUsed = toFiniteNumber(data?.memory?.used)
  const memoryTotal = toFiniteNumber(data?.memory?.total)
  const memoryPercent =
    memoryUsed !== null && memoryTotal !== null && memoryTotal !== 0
      ? (memoryUsed / memoryTotal) * 100
      : null

  const diskUsed = toFiniteNumber(data?.disk?.used)
  const diskTotal = toFiniteNumber(data?.disk?.total)
  const diskPercent =
    diskUsed !== null && diskTotal !== null && diskTotal !== 0
      ? (diskUsed / diskTotal) * 100
      : null

  const temperatureMain = toFiniteNumber(data?.temperature?.main)
  const temperatureMax = toFiniteNumber(data?.temperature?.max)

  return {
    cpu: cpuLoad,
    memory: memoryPercent,
    disk: diskPercent,
    temperature: temperatureMain ?? temperatureMax,
    timestamp: data?.timestamp ?? null,
  }
}

const mapHistorySample = (sample) => {
  if (!sample || typeof sample !== 'object') {
    return {
      timestamp: null,
      cpu: null,
      memory: null,
      disk: null,
      temperature: null,
    }
  }

  const cpuLoad = toFiniteNumber(sample?.cpu?.load)
  const memoryUsed = toFiniteNumber(sample?.memory?.used)
  const memoryTotal = toFiniteNumber(sample?.memory?.total)
  const memoryPercent =
    memoryUsed !== null && memoryTotal !== null && memoryTotal !== 0
      ? (memoryUsed / memoryTotal) * 100
      : null

  const diskUsed = toFiniteNumber(sample?.disk?.used)
  const diskTotal = toFiniteNumber(sample?.disk?.total)
  const diskPercent =
    diskUsed !== null && diskTotal !== null && diskTotal !== 0
      ? (diskUsed / diskTotal) * 100
      : null

  const temperatureMain = toFiniteNumber(sample?.temperature?.main)
  const temperatureMax = toFiniteNumber(sample?.temperature?.max)

  return {
    timestamp: sample?.timestamp ?? null,
    cpu: cpuLoad,
    memory: memoryPercent,
    disk: diskPercent,
    temperature: temperatureMain ?? temperatureMax,
  }
}

const applyHistorySamples = (samples) => {
  historyMetrics.value = Array.isArray(samples)
    ? samples.map((sample) => mapHistorySample(sample))
    : []
}

const updateHistoryConfig = (payload) => {
  const maxSamples =
    toPositiveInteger(payload?.maxSamples) ??
    (Array.isArray(payload?.samples) ? toPositiveInteger(payload.samples.length) : null)

  historyConfig.value = {
    ...historyConfig.value,
    maxSamples: maxSamples ?? historyConfig.value.maxSamples,
  }
}

const appendHistorySample = (sample) => {
  const mappedSample = mapHistorySample(sample)
  const limit = toPositiveInteger(historyConfig.value.maxSamples)

  const nextHistory = [...historyMetrics.value]
  const lastEntry = nextHistory.at(-1)

  if (lastEntry?.timestamp && lastEntry.timestamp === mappedSample.timestamp) {
    nextHistory.splice(nextHistory.length - 1, 1, mappedSample)
  } else {
    nextHistory.push(mappedSample)
  }

  if (limit && nextHistory.length > limit) {
    historyMetrics.value = nextHistory.slice(nextHistory.length - limit)
  } else {
    historyMetrics.value = nextHistory
  }
}

const stopFallbackPolling = () => {
  if (!isBrowserEnvironment() || !fallbackActive) return

  fallbackActive = false
  if (fallbackIntervalId !== null) {
    window.clearInterval(fallbackIntervalId)
    fallbackIntervalId = null
  }
}

const runFallbackRefresh = async () => {
  try {
    await withScrollPreserved(async () => {
      await refreshAllMetrics()
    })
  } catch (error) {
    console.error('Fallback polling refresh failed', error)
  }
}

const startFallbackPolling = () => {
  if (!isBrowserEnvironment() || fallbackActive) return

  fallbackActive = true
  void runFallbackRefresh()
  fallbackIntervalId = window.setInterval(() => {
    void runFallbackRefresh()
  }, FALLBACK_POLL_INTERVAL_MS)
}

const closeMetricsStream = () => {
  if (!isBrowserEnvironment() || !metricsStream) return

  metricsStream.close()
  metricsStream = null
}

const parseEventData = (event) => {
  if (!event?.data) return null
  try {
    return JSON.parse(event.data)
  } catch (error) {
    console.warn('Unable to parse metrics stream payload', error)
    return null
  }
}

const handleStreamOpen = () => {
  stopFallbackPolling()
  errorMessage.value = ''
}

const handleStreamHistory = (event) => {
  const payload = parseEventData(event)
  if (!payload) return

  updateHistoryConfig(payload)
  applyHistorySamples(payload?.samples)

  const lastSample = Array.isArray(payload?.samples)
    ? payload.samples.at(-1)
    : null

  if (lastSample) {
    currentMetrics.value = mapCurrentMetrics(lastSample)
  }
}

const handleStreamSample = (event) => {
  const sample = parseEventData(event)
  if (!sample) return

  currentMetrics.value = mapCurrentMetrics(sample)
  appendHistorySample(sample)
}

const handleStreamServerError = (event) => {
  const payload = parseEventData(event)
  if (payload?.message) {
    errorMessage.value = payload.message
  }
}

const handleStreamNetworkError = () => {
  if (!fallbackActive) {
    errorMessage.value =
      'Live metrics stream interrupted. Switching to fallback polling.'
    startFallbackPolling()
  }
}

const initializeMetricsStream = () => {
  if (!isBrowserEnvironment() || metricsStream) return

  if (typeof window.EventSource !== 'function') {
    errorMessage.value = 'Live metrics streaming is unavailable in this browser. Using fallback polling.'
    startFallbackPolling()
    return
  }

  const eventSource = new EventSource(STREAM_ENDPOINT)
  metricsStream = eventSource

  eventSource.addEventListener('open', handleStreamOpen)
  eventSource.addEventListener('history', handleStreamHistory)
  eventSource.addEventListener('sample', handleStreamSample)
  eventSource.addEventListener('stream-error', handleStreamServerError)
  eventSource.addEventListener('error', handleStreamNetworkError)
}

const fetchCurrentMetrics = async () => {
  const { data } = await axios.get('/api/metrics/current')
  currentMetrics.value = mapCurrentMetrics(data)
}

const fetchHistoryMetrics = async () => {
  const { data } = await axios.get('/api/metrics/history')
  updateHistoryConfig(data)
  applyHistorySamples(data?.samples)
}

const refreshAllMetrics = async () => {
  const [currentResult, historyResult] = await Promise.allSettled([
    fetchCurrentMetrics(),
    fetchHistoryMetrics(),
  ])

  let encounteredError = false

  if (currentResult.status === 'rejected') {
    encounteredError = true
    console.error('Failed to fetch current metrics', currentResult.reason)
  }

  if (historyResult.status === 'rejected') {
    encounteredError = true
    console.error('Failed to fetch history metrics', historyResult.reason)
  }

  if (encounteredError) {
    errorMessage.value = 'Unable to refresh some metrics.'
  } else if (!fallbackActive) {
    errorMessage.value = ''
  }

  // Chart updates are driven by the historyMetrics watcher so we don't
  // duplicate renders here.
}

const buildDataset = ({ label, key, color, yAxisID, unit }) => ({
  label,
  data: historyMetrics.value.map((entry) =>
    Number.isFinite(entry?.[key]) ? entry[key] : null
  ),
  fill: false,
  tension: 0.35,
  spanGaps: true,
  borderColor: color,
  borderWidth: 2,
  pointRadius: 0,
  pointHoverRadius: 0,
  pointHoverBorderWidth: 0,
  pointHoverBackgroundColor: color,
  pointHitRadius: 10,
  yAxisID,
  unit,
})

const datasetHasFiniteValues = (dataset) =>
  dataset.data.some((value) => Number.isFinite(value))

const destroyChartInstance = () => {
  if (!chartInstance.value) return

  chartInstance.value.destroy()
  chartInstance.value = null
}

const getChartOptions = () => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    duration: 0,
  },
  interaction: {
    mode: 'index',
    intersect: false,
  },
  scales: {
    yPercent: {
      type: 'linear',
      beginAtZero: true,
      suggestedMax: 100,
      title: {
        display: true,
        text: 'Usage (%)',
      },
      ticks: {
        callback: (value) => `${value}%`,
      },
      grid: {
        color: 'rgba(148, 163, 184, 0.2)',
      },
    },
    yTemperature: {
      type: 'linear',
      position: 'right',
      beginAtZero: true,
      suggestedMax: 110,
      title: {
        display: true,
        text: 'Temperature (°C)',
      },
      ticks: {
        callback: (value) => `${value}°C`,
      },
      grid: {
        drawOnChartArea: false,
      },
    },
    x: {
      type: 'category',
      title: {
        display: true,
        text: 'Time',
      },
      ticks: {
        maxRotation: 0,
        autoSkipPadding: 10,
      },
      grid: {
        color: 'rgba(148, 163, 184, 0.14)',
      },
    },
  },
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: {
        usePointStyle: true,
        padding: 20,
      },
    },
    tooltip: {
      callbacks: {
        label: (context) => {
          const value = context.parsed?.y
          if (!Number.isFinite(value)) {
            return `${context.dataset.label}: --`
          }
          const unitSuffix = context.dataset?.unit ?? ''
          const formattedValue = value.toFixed(1)
          return `${context.dataset.label}: ${formattedValue}${unitSuffix}`
        },
      },
    },
  },
})

const renderChart = () => {
  if (!chartCanvas.value) return

  const labels = historyMetrics.value.map((entry) => {
    if (!entry?.timestamp) return '—'
    const date = new Date(entry.timestamp)
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  })

  const datasetDefinitions = [
    {
      label: 'CPU Usage',
      key: 'cpu',
      color: '#0ea5e9',
      yAxisID: 'yPercent',
      unit: '%',
    },
    {
      label: 'Memory Usage',
      key: 'memory',
      color: '#22c55e',
      yAxisID: 'yPercent',
      unit: '%',
    },
    {
      label: 'Disk Usage',
      key: 'disk',
      color: '#a855f7',
      yAxisID: 'yPercent',
      unit: '%',
    },
    {
      label: 'Temperature',
      key: 'temperature',
      color: '#f97316',
      yAxisID: 'yTemperature',
      unit: '°C',
    },
  ]

  const datasets = datasetDefinitions
    .map((definition) => buildDataset(definition))
    .filter(datasetHasFiniteValues)

  const hasHistorySamples = historyMetrics.value.length > 0
  const hasRenderableData = datasets.length > 0

  if (!hasHistorySamples || !hasRenderableData) {
    destroyChartInstance()
    return
  }

  const ctx = chartCanvas.value.getContext('2d')
  if (!ctx) {
    destroyChartInstance()
    return
  }

  if (!chartInstance.value) {
    chartInstance.value = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets,
      },
      options: getChartOptions(),
    })
    return
  }

  const chart = chartInstance.value
  chart.data.labels = labels
  chart.data.datasets = datasets
  chart.update('none')
}

onMounted(async () => {
  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', handleScroll, { passive: true })
  }

  await withScrollPreserved(async () => {
    await refreshAllMetrics()
  })

  await nextTick()
  restoreScrollPosition()

  initializeMetricsStream()
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('scroll', handleScroll)
    if (scrollSaveFrame !== null) {
      window.cancelAnimationFrame(scrollSaveFrame)
      scrollSaveFrame = null
    }
    saveScrollPosition()
  }

  stopFallbackPolling()
  closeMetricsStream()
  destroyChartInstance()
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 2rem;
  max-width: 1100px;
  margin: 0 auto;
}

h1 {
  font-size: 2rem;
  font-weight: 700;
  text-align: center;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.5rem;
}

.card {
  background: #ffffff;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 25px -15px rgba(15, 23, 42, 0.3);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card h2 {
  font-size: 1.1rem;
  font-weight: 600;
  color: #1f2937;
}

.card .value {
  font-size: 1.75rem;
  font-weight: 700;
  color: #111827;
}

.card .description {
  font-size: 0.9rem;
  color: #6b7280;
}

.chart-section {
  background: #ffffff;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 25px -15px rgba(15, 23, 42, 0.3);
  min-height: 360px;
  display: flex;
  flex-direction: column;
}

.chart-section header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 1rem;
}

.chart-section h2 {
  font-size: 1.3rem;
  font-weight: 600;
}

.chart-section p {
  color: #6b7280;
  font-size: 0.9rem;
}

.chart-wrapper {
  position: relative;
  flex: 1;
  min-height: 320px;
  height: clamp(260px, 45vh, 420px);
}

.chart-section canvas {
  position: absolute;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
}

.error {
  color: #b91c1c;
  text-align: center;
}

@media (prefers-color-scheme: dark) {
  .dashboard {
    color: #f8fafc;
  }

  .card,
  .chart-section {
    background: #0f172a;
    box-shadow: 0 10px 25px -20px rgba(15, 23, 42, 0.9);
  }

  .card h2,
  .card .value,
  .chart-section h2 {
    color: #f8fafc;
  }

  .card .description,
  .chart-section p {
    color: #cbd5f5;
  }

  .error {
    color: #fca5a5;
  }
}
</style>
