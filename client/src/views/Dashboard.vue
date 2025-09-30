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
          aria-label="Line chart showing CPU, Memory, and Temperature history"
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
  temperature: null,
  timestamp: null,
})
const historyMetrics = ref([])

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
      applyScrollPosition(previousPosition)
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
    label: 'Temperature',
    value: currentMetrics.value.temperature !== null ? `${currentMetrics.value.temperature.toFixed(1)}°C` : null,
    description: 'Current system temperature',
  },
])

const REFRESH_INTERVAL_MS = 1000

let stopPollingLoop

const startPolling = (fetcher) => {
  let timeoutId = null
  let stopped = false
  let inFlight = false

  const run = async () => {
    if (stopped || inFlight) return

    inFlight = true
    try {
      await fetcher()
    } finally {
      inFlight = false
      if (!stopped) {
        timeoutId = window.setTimeout(run, REFRESH_INTERVAL_MS)
      }
    }
  }

  run()

  return () => {
    stopped = true
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }
  }
}

const toFiniteNumber = (value) => {
  const numberValue = typeof value === 'string' ? Number.parseFloat(value) : value
  return Number.isFinite(numberValue) ? numberValue : null
}

const mapCurrentMetrics = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      cpu: null,
      memory: null,
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

  const temperatureMain = toFiniteNumber(data?.temperature?.main)
  const temperatureMax = toFiniteNumber(data?.temperature?.max)

  return {
    cpu: cpuLoad,
    memory: memoryPercent,
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

  const temperatureMain = toFiniteNumber(sample?.temperature?.main)
  const temperatureMax = toFiniteNumber(sample?.temperature?.max)

  return {
    timestamp: sample?.timestamp ?? null,
    cpu: cpuLoad,
    memory: memoryPercent,
    temperature: temperatureMain ?? temperatureMax,
  }
}

const fetchCurrentMetrics = async () => {
  const { data } = await axios.get('/api/metrics/current')
  currentMetrics.value = mapCurrentMetrics(data)
}

const fetchHistoryMetrics = async () => {
  const { data } = await axios.get('/api/metrics/history')
  historyMetrics.value = Array.isArray(data?.samples)
    ? data.samples.map((sample) => mapHistorySample(sample))
    : []
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

  errorMessage.value = encounteredError ? 'Unable to refresh some metrics.' : ''

  // Chart updates are driven by the historyMetrics watcher so we don't
  // duplicate renders here.
}

const buildDataset = (label, key, color) => ({
  label,
  data: historyMetrics.value.map((entry) =>
    Number.isFinite(entry?.[key]) ? entry[key] : null
  ),
  fill: true,
  tension: 0.35,
  borderColor: color,
  backgroundColor: `${color}33`,
  pointRadius: 3,
  pointHoverRadius: 5,
})

const datasetHasFiniteValues = (dataset) =>
  dataset.data.some((value) => Number.isFinite(value))

const destroyChartInstance = () => {
  if (!chartInstance.value) return

  chartInstance.value.destroy()
  chartInstance.value = null
}

const renderChart = () => {
  if (!chartCanvas.value) return

  const labels = historyMetrics.value.map((entry) => {
    if (!entry?.timestamp) return '—'
    const date = new Date(entry.timestamp)
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  })

  const datasets = [
    buildDataset('CPU Usage (%)', 'cpu', '#0ea5e9'),
    buildDataset('Memory Usage (%)', 'memory', '#22c55e'),
    buildDataset('Temperature (°C)', 'temperature', '#f97316'),
  ].filter(datasetHasFiniteValues)

  const hasHistorySamples = historyMetrics.value.length > 0
  const hasRenderableData = datasets.length > 0

  if (!hasHistorySamples || !hasRenderableData) {
    destroyChartInstance()
    return
  }

  const chartData = {
    labels,
    datasets,
  }

  if (!chartInstance.value) {
    const ctx = chartCanvas.value.getContext('2d')
    chartInstance.value = new Chart(ctx, {
      type: 'line',
      data: chartData,
      options: {
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
          y: {
            type: 'linear',
            beginAtZero: true,
            title: {
              display: true,
              text: 'Value',
            },
          },
          x: {
            type: 'category',
            title: {
              display: true,
              text: 'Time',
            },
          },
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.parsed?.y
                if (!Number.isFinite(value)) {
                  return `${context.dataset.label}: --`
                }
                return `${context.dataset.label}: ${value.toFixed(1)}`
              },
            },
          },
        },
      },
    })
    return
  }

  const existingLabels = chartInstance.value.data.labels
  existingLabels.splice(0, existingLabels.length, ...chartData.labels)

  const existingDatasets = chartInstance.value.data.datasets

  chartData.datasets.forEach((dataset, index) => {
    const existingDataset = existingDatasets[index]

    if (!existingDataset) {
      existingDatasets.push({ ...dataset, data: [...dataset.data] })
      return
    }

    existingDataset.label = dataset.label
    existingDataset.borderColor = dataset.borderColor
    existingDataset.backgroundColor = dataset.backgroundColor
    existingDataset.fill = dataset.fill
    existingDataset.tension = dataset.tension
    existingDataset.pointRadius = dataset.pointRadius
    existingDataset.pointHoverRadius = dataset.pointHoverRadius

    existingDataset.data.splice(0, existingDataset.data.length, ...dataset.data)
  })

  if (existingDatasets.length > chartData.datasets.length) {
    existingDatasets.splice(chartData.datasets.length)
  }

  chartInstance.value.update('none')
}

onMounted(async () => {
  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', handleScroll, { passive: true })
  }

  await refreshAllMetrics()

  await nextTick()
  restoreScrollPosition()

  stopPollingLoop = startPolling(() =>
    withScrollPreserved(async () => {
      await refreshAllMetrics()
    })
  )
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

  if (stopPollingLoop) stopPollingLoop()
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
