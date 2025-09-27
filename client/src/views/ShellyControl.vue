<template>
  <div class="shelly-control">
    <header class="control-header">
      <div class="header-text">
        <h2>Panel oświetlenia Shelly</h2>
        <p>Steruj i monitoruj inteligentne światła w czasie rzeczywistym.</p>
      </div>
      <div class="device-selector" v-if="devices.length">
        <label>
          <span>Urządzenie</span>
          <select v-model="selectedDeviceId" :disabled="isLoadingDevices || isBusy">
            <option v-for="device in devices" :key="device.id" :value="device.id">
              {{ device.name }}
            </option>
          </select>
        </label>
        <p class="device-address" v-if="selectedDevice">Adres IP: {{ deviceAddress }}</p>
      </div>
    </header>

    <p v-if="isLoadingDevices" class="helper-text">Wyszukiwanie urządzeń Shelly…</p>
    <p v-else-if="deviceLoadError" class="error-message">{{ deviceLoadError }}</p>

    <section v-if="selectedDevice" class="power-section">
      <button
        type="button"
        class="power-button"
        :class="powerButtonClasses"
        :aria-pressed="isLightOn"
        :disabled="isBusy"
        @click="handlePowerButtonClick"
      >
        <svg class="power-button__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm-5.657 4.343a1 1 0 0 1 1.414 0A7 7 0 1 1 17.657 6.343a1 1 0 0 1 1.414-1.414 9 9 0 1 1-12.728 0 1 1 0 0 1 1.414 1.414Z"
            fill="currentColor"
          />
        </svg>
        <span class="power-button__label">{{ powerButtonLabel }}</span>
        <span class="power-button__state">{{ powerButtonState }}</span>
      </button>
      <div class="power-meta">
        <p>{{ statusSummary }}</p>
        <p v-if="formattedLastUpdated">Ostatnia aktualizacja: {{ formattedLastUpdated }}</p>
        <button
          type="button"
          class="refresh-button"
          :disabled="isBusy"
          @click="refreshStatus()"
        >
          Odśwież teraz
        </button>
      </div>
    </section>

    <section v-if="selectedDevice" class="status-card">
      <h3>Parametry urządzenia</h3>
      <div class="status-grid">
        <div class="status-tile">
          <span class="status-label">Stan przekaźnika</span>
          <span :class="['relay-pill', relayStateClass]">{{ relayStateLabel }}</span>
        </div>
        <div class="status-tile" v-if="temperatureDetails">
          <span class="status-label">Temperatura</span>
          <span class="status-value">
            <span v-if="temperatureDetails.celsius !== null">
              {{ temperatureDetails.celsius.toFixed(1) }} °C
            </span>
            <span
              v-if="temperatureDetails.celsius !== null && temperatureDetails.fahrenheit !== null"
              aria-hidden="true"
            >
              ·
            </span>
            <span v-if="temperatureDetails.fahrenheit !== null">
              {{ temperatureDetails.fahrenheit.toFixed(1) }} °F
            </span>
          </span>
          <span v-if="temperatureDetails.sensor" class="status-subtle">
            Czujnik: {{ temperatureDetails.sensor }}
          </span>
        </div>
        <div class="status-tile" v-if="meterDetails?.power !== null">
          <span class="status-label">Pobór mocy</span>
          <span class="status-value">{{ meterDetails.power.toFixed(1) }} W</span>
        </div>
        <div class="status-tile" v-if="meterDetails?.voltage !== null">
          <span class="status-label">Napięcie</span>
          <span class="status-value">{{ meterDetails.voltage.toFixed(1) }} V</span>
        </div>
        <div class="status-tile" v-if="meterDetails?.total !== null">
          <span class="status-label">Zużycie całkowite</span>
          <span class="status-value">{{ meterDetails.total.toFixed(1) }} Wh</span>
        </div>
        <div class="status-tile" v-if="relayDetails.source">
          <span class="status-label">Ostatnia akcja</span>
          <span class="status-value">{{ relayDetails.source }}</span>
        </div>
        <div class="status-tile" v-if="wifiDetails">
          <span class="status-label">Wi-Fi</span>
          <span class="status-value">
            <span v-if="wifiDetails.ssid">{{ wifiDetails.ssid }}</span>
            <span v-if="wifiDetails.ssid && wifiDetails.ip" aria-hidden="true"> · </span>
            <span v-if="wifiDetails.ip">{{ wifiDetails.ip }}</span>
            <span v-if="wifiDetails.rssi !== null" aria-hidden="true"> · </span>
            <span v-if="wifiDetails.rssi !== null">{{ wifiDetails.rssi }} dBm</span>
          </span>
        </div>
      </div>
    </section>

    <section v-if="selectedDevice && (deviceInfo || meterDetails)" class="details-card">
      <h3>Szczegóły techniczne</h3>
      <div class="details-grid">
        <div v-if="deviceInfo?.name" class="detail-item">
          <span class="detail-label">Nazwa</span>
          <span class="detail-value">{{ deviceInfo.name }}</span>
        </div>
        <div v-if="deviceInfo?.model" class="detail-item">
          <span class="detail-label">Model</span>
          <span class="detail-value">{{ deviceInfo.model }}</span>
        </div>
        <div v-if="deviceInfo?.firmware" class="detail-item">
          <span class="detail-label">Firmware</span>
          <span class="detail-value">{{ deviceInfo.firmware }}</span>
        </div>
        <div v-if="meterDetails?.energy !== null" class="detail-item">
          <span class="detail-label">Energia dzisiaj</span>
          <span class="detail-value">{{ meterDetails.energy.toFixed(1) }} Wh</span>
        </div>
      </div>
    </section>

    <details v-if="selectedDevice && shellyStatus" class="raw-section">
      <summary>Surowa odpowiedź urządzenia</summary>
      <pre>{{ formattedShellyStatus }}</pre>
    </details>

    <p v-if="helperMessage" class="helper-text">{{ helperMessage }}</p>
    <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
  </div>
</template>

<script setup>
import axios from 'axios'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const SHELLY_REFRESH_INTERVAL_MS = 2500

const devices = ref([])
const isLoadingDevices = ref(false)
const deviceLoadError = ref('')
const selectedDeviceId = ref('')

const shellyStatus = ref(null)
const isLoading = ref(false)
const isSilentRefreshing = ref(false)
const isToggling = ref(false)
const errorMessage = ref('')
const lastRefreshedAt = ref(null)
let refreshTimerId = null

const selectedDevice = computed(() =>
  devices.value.find((device) => device.id === selectedDeviceId.value) ?? null
)

const deviceAddress = computed(() => selectedDevice.value?.address ?? '')

const isBusy = computed(
  () => isLoading.value || isToggling.value || isSilentRefreshing.value
)

const toBooleanOrNull = (value) => {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  return null
}

const toFiniteNumberOrNull = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

const relayDetails = computed(() => {
  const relay =
    shellyStatus.value?.relays?.[0] ??
    shellyStatus.value?.switch?.[0] ??
    shellyStatus.value?.switches?.[0] ??
    null

  if (!relay) {
    return {
      isOn: null,
      source: '',
      timerActive: false
    }
  }

  const possibleStates = [relay.ison, relay.output, relay.state, relay.value]
  const isOn = possibleStates.map(toBooleanOrNull).find((value) => value !== null) ?? null

  return {
    isOn,
    source: relay.source ?? relay.apower_source ?? '',
    timerActive: relay.has_timer === true || Number(relay.timer_duration) > 0
  }
})

const isLightOn = computed(() => relayDetails.value.isOn === true)

const relayStateLabel = computed(() => {
  if (relayDetails.value.isOn === null) return 'Nieznany'
  return relayDetails.value.isOn ? 'Włączone' : 'Wyłączone'
})

const relayStateClass = computed(() => {
  if (relayDetails.value.isOn === null) return 'relay-pill--unknown'
  return relayDetails.value.isOn ? 'relay-pill--on' : 'relay-pill--off'
})

const meterDetails = computed(() => {
  const meter =
    shellyStatus.value?.meters?.[0] ??
    shellyStatus.value?.emeters?.[0] ??
    shellyStatus.value?.pm1_voltages?.[0] ??
    null

  if (!meter) {
    return null
  }

  const power = Number.isFinite(meter.power) ? meter.power : null
  const total = Number.isFinite(meter.total) ? meter.total : null
  const energy = Number.isFinite(meter.energy) ? meter.energy : null
  const voltage = Number.isFinite(meter.voltage) ? meter.voltage : null

  if ([power, total, energy, voltage].every((value) => value === null)) {
    return null
  }

  return { power, total, energy, voltage }
})

const wifiDetails = computed(() => {
  const wifi =
    shellyStatus.value?.wifi_sta ??
    shellyStatus.value?.wifi_sta1 ??
    shellyStatus.value?.wifi ??
    null

  if (!wifi) {
    return null
  }

  const ssid = wifi.ssid ?? wifi.ssid1 ?? ''
  const ip = wifi.ip ?? wifi.ipv4 ?? wifi.ipv6 ?? ''
  const rssi = Number.isFinite(wifi.rssi) ? wifi.rssi : null

  if (!ssid && !ip && rssi === null) {
    return null
  }

  return { ssid, ip, rssi }
})

const deviceInfo = computed(() => {
  if (!shellyStatus.value) {
    return null
  }

  const name = shellyStatus.value.device?.name ?? shellyStatus.value.name ?? ''
  const model = shellyStatus.value.device?.type ?? shellyStatus.value.model ?? ''
  const firmware = shellyStatus.value.fw ?? shellyStatus.value.firmware ?? ''

  if (!name && !model && !firmware) {
    return null
  }

  return { name, model, firmware }
})

const temperatureDetails = computed(() => {
  const temperature = shellyStatus.value?.temperature ?? null

  const getCandidateNumber = (candidates) =>
    candidates
      .map((candidate) => toFiniteNumberOrNull(candidate))
      .find((candidate) => candidate !== null) ?? null

  const celsiusCandidates = [
    temperature?.celsius,
    temperature?.temp,
    temperature?.temperature,
    temperature?.value,
    temperature?.t,
    temperature?.tc,
    temperature?.tC,
    shellyStatus.value?.temperatureC,
    shellyStatus.value?.temperature_c
  ]

  const fahrenheitCandidates = [
    temperature?.fahrenheit,
    temperature?.tF,
    temperature?.tf,
    shellyStatus.value?.temperatureF,
    shellyStatus.value?.temperature_f
  ]

  const celsius = getCandidateNumber(celsiusCandidates)
  const fahrenheit = getCandidateNumber(fahrenheitCandidates)

  if (celsius === null && fahrenheit === null) {
    return null
  }

  const sensorCandidate =
    temperature?.sensor ?? temperature?.id ?? temperature?.name ?? ''

  let sensor = ''
  if (typeof sensorCandidate === 'string') {
    sensor = sensorCandidate.trim()
  } else if (sensorCandidate != null) {
    sensor = String(sensorCandidate)
  }

  return {
    celsius,
    fahrenheit,
    sensor
  }
})

const formattedLastUpdated = computed(() => {
  if (!lastRefreshedAt.value) return ''
  const date = new Date(lastRefreshedAt.value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
})

const formattedShellyStatus = computed(() => {
  if (!shellyStatus.value) return ''
  return JSON.stringify(shellyStatus.value, null, 2)
})

const powerButtonLabel = computed(() => {
  if (!selectedDevice.value) return 'Brak urządzenia'
  if (isBusy.value) return 'Przetwarzanie…'
  if (relayDetails.value.isOn === null) return 'Sprawdź stan'
  return relayDetails.value.isOn ? 'Wyłącz światło' : 'Włącz światło'
})

const powerButtonState = computed(() => {
  if (!selectedDevice.value) return ''
  if (relayDetails.value.isOn === null) return 'Stan nieznany'
  return relayDetails.value.isOn ? 'Światło jest włączone' : 'Światło jest wyłączone'
})

const statusSummary = computed(() => {
  if (!selectedDevice.value) return ''
  if (isBusy.value) return 'Aktualizuję stan urządzenia…'
  if (relayDetails.value.isOn === null) return 'Oczekiwanie na dane z urządzenia Shelly.'
  const deviceName = selectedDevice.value.name
  const stateText = relayDetails.value.isOn
    ? `Światło „${deviceName}” świeci.`
    : `Światło „${deviceName}” jest wyłączone.`

  const temperatureInfo = temperatureDetails.value
  const hasTemperature =
    temperatureInfo &&
    (temperatureInfo.celsius !== null || temperatureInfo.fahrenheit !== null)

  const temperatureText = hasTemperature
    ? (() => {
        const parts = []
        if (temperatureInfo.celsius !== null) {
          parts.push(`${temperatureInfo.celsius.toFixed(1)}°C`)
        }
        if (temperatureInfo.fahrenheit !== null) {
          parts.push(`${temperatureInfo.fahrenheit.toFixed(1)}°F`)
        }
        return `Temperatura urządzenia wynosi ${parts.join(' / ')}.`
      })()
    : ''

  return temperatureText ? `${stateText} ${temperatureText}` : stateText
})

const powerButtonClasses = computed(() => ({
  'power-button--on': relayDetails.value.isOn === true,
  'power-button--off': relayDetails.value.isOn === false,
  'power-button--unknown': relayDetails.value.isOn === null,
  'power-button--busy': isBusy.value
}))

const helperMessage = computed(() => {
  if (isToggling.value) {
    return 'Wysyłam polecenie do urządzenia…'
  }
  if (isLoading.value) {
    return 'Ładuję najnowszy status urządzenia Shelly…'
  }
  if (isSilentRefreshing.value) {
    return 'Odświeżam stan światła w tle…'
  }
  return ''
})

const stopRefreshLoop = () => {
  if (typeof window === 'undefined') return
  if (refreshTimerId) {
    window.clearInterval(refreshTimerId)
    refreshTimerId = null
  }
}

const startRefreshLoop = () => {
  stopRefreshLoop()
  if (typeof window === 'undefined' || !selectedDevice.value) return
  refreshTimerId = window.setInterval(() => {
    refreshStatus({ silent: true })
  }, SHELLY_REFRESH_INTERVAL_MS)
}

const refreshStatus = async ({ silent = false } = {}) => {
  if (!selectedDevice.value) {
    return
  }

  if (silent) {
    if (isSilentRefreshing.value || isLoading.value || isToggling.value) {
      return
    }
    isSilentRefreshing.value = true
  } else {
    if (isLoading.value) {
      return
    }
    isLoading.value = true
    errorMessage.value = ''
  }

  try {
    const { data } = await axios.get(`/api/shelly/${selectedDevice.value.id}/status`)
    shellyStatus.value = data
    lastRefreshedAt.value = new Date().toISOString()
    errorMessage.value = ''
  } catch (error) {
    console.error('Failed to retrieve Shelly status', error)
    const message =
      'Nie udało się pobrać stanu urządzenia Shelly. Sprawdź połączenie i spróbuj ponownie.'
    if (silent) {
      if (!errorMessage.value) {
        errorMessage.value = message
      }
    } else {
      errorMessage.value = message
    }
  } finally {
    if (silent) {
      isSilentRefreshing.value = false
    } else {
      isLoading.value = false
    }
  }
}

const sendRelayCommand = async (turn) => {
  if (!selectedDevice.value) return
  if (isToggling.value || isLoading.value) {
    return
  }

  isToggling.value = true
  errorMessage.value = ''

  try {
    await axios.post(`/api/shelly/${selectedDevice.value.id}/relay`, { turn })
    await refreshStatus({ silent: true })
  } catch (error) {
    console.error('Failed to update Shelly relay state', error)
    errorMessage.value = 'Nie udało się zmienić stanu światła.'
  } finally {
    isToggling.value = false
  }
}

const handlePowerButtonClick = async () => {
  if (!selectedDevice.value) return
  if (relayDetails.value.isOn === null) {
    await refreshStatus()
    return
  }

  const desiredAction = relayDetails.value.isOn ? 'off' : 'on'
  await sendRelayCommand(desiredAction)
}

const loadDevices = async () => {
  isLoadingDevices.value = true
  deviceLoadError.value = ''

  try {
    const { data } = await axios.get('/api/shelly/devices')
    const list = Array.isArray(data?.devices) ? data.devices : []
    devices.value = list

    if (!list.length) {
      deviceLoadError.value = 'Nie znaleziono skonfigurowanych urządzeń Shelly.'
      selectedDeviceId.value = ''
      return
    }

    if (!selectedDeviceId.value || !list.some((device) => device.id === selectedDeviceId.value)) {
      selectedDeviceId.value = list[0].id
    }
  } catch (error) {
    console.error('Failed to load Shelly device list', error)
    deviceLoadError.value = 'Nie udało się pobrać listy urządzeń Shelly.'
    devices.value = []
    selectedDeviceId.value = ''
  } finally {
    isLoadingDevices.value = false
  }
}

watch(selectedDeviceId, async (newId, oldId) => {
  if (!newId) {
    shellyStatus.value = null
    stopRefreshLoop()
    return
  }

  if (newId !== oldId) {
    shellyStatus.value = null
    errorMessage.value = ''
    await refreshStatus()
    startRefreshLoop()
  }
})

onMounted(async () => {
  await loadDevices()
})

onBeforeUnmount(() => {
  stopRefreshLoop()
})
</script>

<style scoped>
.shelly-control {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  padding: 2rem;
  max-width: 960px;
  margin: 0 auto;
}

.control-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.header-text h2 {
  margin: 0;
  font-size: clamp(2rem, 3vw, 2.5rem);
  font-weight: 700;
}

.header-text p {
  margin: 0.35rem 0 0;
  color: #4b5563;
}

.device-selector {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  text-align: right;
}

.device-selector label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-weight: 600;
}

.device-selector select {
  border-radius: 0.75rem;
  border: 1px solid rgba(15, 23, 42, 0.2);
  padding: 0.5rem 0.75rem;
  font-size: 1rem;
}

.device-address {
  margin: 0;
  font-size: 0.9rem;
  color: #64748b;
}

.power-section {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: center;
  justify-content: center;
}

.power-button {
  position: relative;
  width: min(60vw, 220px);
  height: min(60vw, 220px);
  border-radius: 50%;
  border: none;
  background: radial-gradient(circle at top, #1f2937, #0f172a 70%);
  color: #f8fafc;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  cursor: pointer;
  box-shadow: 0 20px 45px -25px rgba(15, 23, 42, 0.9);
  transition: transform 200ms ease, box-shadow 200ms ease, filter 200ms ease;
}

.power-button:disabled {
  cursor: not-allowed;
  filter: grayscale(0.35);
}

.power-button:not(:disabled):hover {
  transform: translateY(-4px);
  box-shadow: 0 25px 60px -30px rgba(59, 130, 246, 0.7);
}

.power-button__icon {
  width: 70px;
  height: 70px;
}

.power-button__label {
  font-size: 1.2rem;
  font-weight: 700;
}

.power-button__state {
  font-size: 0.95rem;
  opacity: 0.85;
}

.power-button--on {
  background: radial-gradient(circle at top, rgba(34, 197, 94, 0.9), rgba(6, 95, 70, 0.95));
  box-shadow: 0 25px 70px -25px rgba(34, 197, 94, 0.75);
  animation: powerPulse 2.2s ease-in-out infinite;
}

.power-button--off {
  background: radial-gradient(circle at top, rgba(226, 232, 240, 0.12), rgba(15, 23, 42, 0.95));
}

.power-button--unknown {
  background: radial-gradient(circle at top, rgba(148, 163, 184, 0.4), rgba(51, 65, 85, 0.95));
}

.power-button--busy {
  animation: none;
  box-shadow: 0 10px 25px -18px rgba(15, 23, 42, 0.9);
}

@keyframes powerPulse {
  0%,
  100% {
    box-shadow: 0 0 20px rgba(34, 197, 94, 0.45), 0 0 45px rgba(34, 197, 94, 0.35);
  }
  50% {
    box-shadow: 0 0 30px rgba(34, 197, 94, 0.7), 0 0 70px rgba(34, 197, 94, 0.6);
  }
}

.power-meta {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  text-align: center;
  color: #334155;
}

.refresh-button {
  align-self: center;
  border: none;
  border-radius: 9999px;
  padding: 0.5rem 1.5rem;
  background: #1d4ed8;
  color: #f8fafc;
  font-weight: 600;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
}

.refresh-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.refresh-button:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 22px -16px rgba(29, 78, 216, 0.8);
}

.status-card,
.details-card,
.raw-section {
  background: #ffffff;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 18px 40px -30px rgba(15, 23, 42, 0.4);
}

.status-card h3,
.details-card h3 {
  margin: 0 0 1.25rem;
  font-size: 1.35rem;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.status-tile {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.85rem;
  border-radius: 0.85rem;
  background: rgba(241, 245, 249, 0.65);
}

.status-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.status-value {
  font-size: 1rem;
  font-weight: 600;
  color: #0f172a;
}

.status-subtle {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: #94a3b8;
}

.relay-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.85rem;
  border-radius: 9999px;
  font-weight: 700;
  color: #0f172a;
}

.relay-pill--on {
  background: rgba(34, 197, 94, 0.15);
  color: #166534;
}

.relay-pill--off {
  background: rgba(239, 68, 68, 0.15);
  color: #991b1b;
}

.relay-pill--unknown {
  background: rgba(148, 163, 184, 0.2);
  color: #475569;
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.85rem;
  border-radius: 0.85rem;
  background: rgba(241, 245, 249, 0.65);
}

.detail-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.detail-value {
  font-size: 1rem;
  font-weight: 600;
  color: #0f172a;
}

.raw-section summary {
  cursor: pointer;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: #0f172a;
}

.raw-section pre {
  margin: 0;
  overflow-x: auto;
  background: #0f172a;
  color: #e2e8f0;
  padding: 1rem;
  border-radius: 0.75rem;
  font-size: 0.85rem;
}

.helper-text {
  margin: 0;
  font-size: 0.95rem;
  color: #4b5563;
  text-align: center;
}

.error-message {
  margin: 0;
  color: #b91c1c;
  font-weight: 600;
  text-align: center;
}

@media (max-width: 640px) {
  .shelly-control {
    padding: 1.5rem;
  }

  .device-selector {
    align-items: flex-start;
    text-align: left;
  }
}

@media (prefers-color-scheme: dark) {
  .header-text p,
  .device-address,
  .power-meta,
  .status-label,
  .status-value,
  .status-subtle,
  .detail-label,
  .detail-value,
  .helper-text,
  .error-message {
    color: inherit;
  }

  .device-selector select {
    background: rgba(15, 23, 42, 0.6);
    color: #f8fafc;
    border-color: rgba(148, 163, 184, 0.35);
  }

  .status-card,
  .details-card,
  .raw-section {
    background: rgba(15, 23, 42, 0.85);
    box-shadow: 0 18px 40px -30px rgba(15, 23, 42, 0.9);
  }

  .status-tile,
  .detail-item {
    background: rgba(30, 41, 59, 0.6);
  }

  .raw-section pre {
    background: #020617;
    color: #f1f5f9;
  }

  .refresh-button {
    background: #2563eb;
  }
}
</style>
