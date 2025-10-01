<template>
  <div class="devices">
    <header class="devices__header">
      <h1>Devices</h1>
      <button class="refresh-button" type="button" @click="refreshDevices" :disabled="loading">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </header>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

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
              type="button"
              @click="() => toggleSwitch(device)"
              :disabled="loading"
            >
              Toggle
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
              :disabled="loading"
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

    <p v-else-if="!loading" class="empty-state">No devices configured yet.</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import axios from 'axios'

const devices = ref([])
const loading = ref(false)
const errorMessage = ref('')

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
  loading.value = true
  errorMessage.value = ''

  try {
    const { data } = await axios.get('/api/devices')
    devices.value = Array.isArray(data) ? data : []
  } catch (error) {
    handleError(error)
  } finally {
    loading.value = false
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

const toggleSwitch = async (device) => {
  loading.value = true
  errorMessage.value = ''
  try {
    const { data } = await axios.post(`/api/devices/${device.id}/actions`, {
      action: 'toggle',
    })
    updateDeviceInList(data)
  } catch (error) {
    handleError(error)
  } finally {
    loading.value = false
  }
}

const updateDimmer = async (device, level) => {
  if (!Number.isFinite(level)) return

  loading.value = true
  errorMessage.value = ''
  try {
    const { data } = await axios.post(`/api/devices/${device.id}/actions`, {
      level,
    })
    updateDeviceInList(data)
  } catch (error) {
    handleError(error)
  } finally {
    loading.value = false
  }
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

onMounted(() => {
  refreshDevices()
})
</script>

<style scoped>
.devices {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: clamp(1.5rem, 2.5vw, 3rem);
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
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.device-card {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 1rem;
  padding: 1.25rem;
  box-shadow: 0 15px 35px rgba(15, 23, 42, 0.08);
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
  padding: 0.5rem 1rem;
  border-radius: 0.75rem;
  border: none;
  background: #10b981;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 150ms ease-in-out, transform 150ms ease-in-out;
}

.action-button:disabled {
  background: #6ee7b7;
  cursor: not-allowed;
}

.action-button:not(:disabled):hover {
  background: #059669;
}

.action-button:not(:disabled):active {
  transform: scale(0.97);
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
    background: rgba(15, 23, 42, 0.85);
    color: #e2e8f0;
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
</style>
