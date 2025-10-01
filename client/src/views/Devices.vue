<template>
  <div class="devices">
    <header class="devices__header">
      <h1>Devices</h1>
      <button
        class="refresh-button"
        type="button"
        @click="refreshDevices"
        :disabled="isRefreshing"
        :aria-busy="isRefreshing"
      >
        {{ isRefreshing ? 'Refreshing…' : 'Refresh' }}
      </button>
    </header>

    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

    <section v-if="devices.length" class="device-grid">
      <article class="device-card" v-for="device in devices" :key="device.id">
        <header class="device-card__header">
          <h2>{{ device.name }}</h2>
          <span class="device-type">{{ device.type }}</span>
        </header>

        <div class="device-card__content">
          <template v-if="device.type === 'switch'">
            <p class="device-state">Status: {{ device.state?.on ? 'On' : 'Off' }}</p>
            <button
              class="action-button"
              :class="[
                device.state?.on ? 'action-button--on' : 'action-button--off',
                { 'action-button--pending': isDevicePending(device.id) }
              ]"
              type="button"
              @click="toggleSwitch(device)"
              :disabled="isRefreshing || isDevicePending(device.id)"
              :aria-pressed="device.state?.on ?? false"
              :aria-busy="isDevicePending(device.id)"
            >
              <span class="power-icon" aria-hidden="true">⏻</span>
              <span class="action-label">{{ device.state?.on ? 'Turn off' : 'Turn on' }}</span>
            </button>
          </template>

          <template v-else-if="device.type === 'dimmer'">
            <label class="slider-label" :for="`dimmer-${device.id}`">
              Brightness: <span>{{ device.state?.level ?? 0 }}%</span>
            </label>
            <input
              class="slider"
              type="range"
              min="0"
              max="100"
              step="1"
              :id="`dimmer-${device.id}`"
              :value="device.state?.level ?? 0"
              :disabled="isRefreshing || isDevicePending(device.id)"
              :aria-busy="isDevicePending(device.id)"
              @change="(event) => updateDimmer(device, Number.parseInt(event.target.value, 10))"
            />
          </template>

          <template v-else-if="device.type === 'sensor'">
            <p class="device-state">
              Reading: {{ formatSensorReading(device.state) }}
            </p>
            <p class="device-hint">Sensors are read-only.</p>
          </template>

          <template v-else>
            <p class="device-state">
              Unsupported device type. Check configuration.
            </p>
          </template>
        </div>
      </article>
    </section>

    <p v-else-if="!isRefreshing" class="empty-state">No devices configured yet.</p>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import axios from 'axios'

const devices = ref([])
const isRefreshing = ref(false)
const errorMessage = ref('')
const pendingDeviceIds = ref(new Set())

const AUTO_REFRESH_INTERVAL_MS = 5000
let autoRefreshTimerId = null

const isDevicePending = (deviceId) => pendingDeviceIds.value.has(deviceId)

const setPendingState = (deviceId, isPending) => {
  const next = new Set(pendingDeviceIds.value)
  if (isPending) {
    next.add(deviceId)
  } else {
    next.delete(deviceId)
  }
  pendingDeviceIds.value = next
}

const handleError = (error) => {
  console.error('Failed to interact with device API:', error)
  const defaultMessage = 'Unexpected error while communicating with the device API.'

  if (error.response?.data?.error) {
    errorMessage.value = error.response.data.error
    return
  }

  errorMessage.value = error.message ?? defaultMessage
}

const refreshDevices = async () => {
  if (isRefreshing.value) {
    return
  }
  isRefreshing.value = true
  errorMessage.value = ''

  try {
    const { data } = await axios.get('/api/devices')
    devices.value = Array.isArray(data) ? data : []
  } catch (error) {
    handleError(error)
  } finally {
    isRefreshing.value = false
  }
}

const updateDeviceInList = (nextDevice) => {
  const index = devices.value.findIndex((device) => device.id === nextDevice.id)
  if (index === -1) {
    devices.value.push(nextDevice)
    return
  }

  devices.value.splice(index, 1, nextDevice)
}

const performDeviceAction = async (device, payload) => {
  if (isDevicePending(device.id)) {
    return
  }
  setPendingState(device.id, true)
  errorMessage.value = ''
  try {
    const { data } = await axios.post(`/api/devices/${device.id}/actions`, payload)
    updateDeviceInList(data)
  } catch (error) {
    handleError(error)
  } finally {
    setPendingState(device.id, false)
  }
}

const toggleSwitch = async (device) => {
  await performDeviceAction(device, { action: 'toggle' })
}

const updateDimmer = async (device, level) => {
  if (!Number.isFinite(level)) return

  await performDeviceAction(device, { level })
}

const formatSensorReading = (state) => {
  if (!state || typeof state !== 'object') {
    return 'Unavailable'
  }

  if (state.value === undefined) {
    return JSON.stringify(state)
  }

  return `${state.value}${state.unit ? ` ${state.unit}` : ''}`
}

const stopAutoRefresh = () => {
  if (autoRefreshTimerId !== null && typeof window !== 'undefined') {
    window.clearInterval(autoRefreshTimerId)
    autoRefreshTimerId = null
  }
}

const startAutoRefresh = () => {
  stopAutoRefresh()

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  autoRefreshTimerId = window.setInterval(() => {
    if (!document.hidden) {
      refreshDevices()
    }
  }, AUTO_REFRESH_INTERVAL_MS)
}

const handleVisibilityChange = () => {
  if (typeof document === 'undefined') {
    return
  }

  if (!document.hidden) {
    refreshDevices()
  }
}

onMounted(() => {
  refreshDevices()
  startAutoRefresh()

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})

onUnmounted(() => {
  stopAutoRefresh()

  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
})
</script>

<style scoped>
.devices {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 2rem;
  max-width: 1100px;
  margin: 0 auto;
}

.devices__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.refresh-button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 150ms ease-in-out, transform 150ms ease-in-out;
}

.refresh-button:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

.refresh-button:not(:disabled):hover {
  background: #1d4ed8;
}

.refresh-button:not(:disabled):active {
  transform: scale(0.97);
}

.device-grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.device-card {
  background: #ffffff;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 25px -15px rgba(15, 23, 42, 0.3);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.device-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.device-type {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  color: #64748b;
}

.device-card__content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.device-state {
  font-size: 1rem;
  font-weight: 500;
  color: #0f172a;
}

.device-hint {
  font-size: 0.875rem;
  color: #475569;
}

.action-button {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.75rem;
  border-radius: 999px;
  border: none;
  font-size: 1.05rem;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  transition: transform 150ms ease-in-out, box-shadow 150ms ease-in-out, background-color 150ms ease-in-out;
}

.action-button--on {
  background: #dc2626;
  box-shadow: 0 12px 25px rgba(220, 38, 38, 0.2);
}

.action-button--off {
  background: #16a34a;
  box-shadow: 0 12px 25px rgba(22, 163, 74, 0.2);
}

.action-button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
  box-shadow: none;
}

.action-button--pending {
  position: relative;
}

.action-button--pending::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(15, 23, 42, 0.15);
  animation: pulse 1.2s ease-in-out infinite;
}

.action-button--on:not(:disabled):hover {
  background: #b91c1c;
}

.action-button--off:not(:disabled):hover {
  background: #15803d;
}

.action-button:not(:disabled):active {
  transform: scale(0.96);
}

.action-button:focus-visible {
  outline: 3px solid rgba(250, 204, 21, 0.9);
  outline-offset: 4px;
}

.power-icon {
  font-size: 1.75rem;
  line-height: 1;
}

.action-label {
  letter-spacing: 0.04em;
}

.slider-label {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  color: #0f172a;
}

.slider {
  width: 100%;
}

.error {
  color: #b91c1c;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
}

.empty-state {
  text-align: center;
  color: #475569;
  font-size: 1rem;
  margin-top: 2rem;
}

@media (prefers-color-scheme: dark) {
  .device-card {
    background: #0f172a;
    color: #e2e8f0;
    box-shadow: 0 10px 25px -20px rgba(15, 23, 42, 0.9);
  }

  .device-state,
  .slider-label {
    color: #e2e8f0;
  }

  .device-type {
    color: #94a3b8;
  }

  .device-hint,
  .empty-state {
    color: #cbd5f5;
  }

  .error {
    color: #fecaca;
    background: rgba(239, 68, 68, 0.2);
  }
}

@keyframes pulse {
  0% {
    opacity: 0.25;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 0.25;
  }
}
</style>
