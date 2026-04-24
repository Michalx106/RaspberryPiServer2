<template>
  <div class="admin-panel">
    <section class="admin-panel__card">
      <h1>Panel administratora</h1>
      <p>Zarządzaj urządzeniami: dodawaj, edytuj i usuwaj wpisy w konfiguracji backendu.</p>

      <p v-if="errorMessage" class="admin-panel__error" role="alert">{{ errorMessage }}</p>
      <p v-if="successMessage" class="admin-panel__success" role="status">{{ successMessage }}</p>

      <form class="device-form" @submit.prevent="saveDevice">
        <h2>{{ editingDeviceId ? 'Edytuj urządzenie' : 'Dodaj urządzenie' }}</h2>

        <div class="form-grid">
          <label>
            ID
            <input v-model.trim="form.id" :disabled="Boolean(editingDeviceId)" required placeholder="np. desk-light" />
          </label>

          <label>
            Nazwa
            <input v-model.trim="form.name" required placeholder="np. Lampka biurkowa" />
          </label>

          <label>
            Typ
            <select v-model="form.type" required>
              <option value="switch">switch</option>
              <option value="dimmer">dimmer</option>
              <option value="sensor">sensor</option>
              <option value="camera">camera</option>
            </select>
          </label>

          <label>
            Topic MQTT (opcjonalnie)
            <input v-model.trim="form.topic" placeholder="np. roompi/devices/desk-light/state" />
          </label>

          <label v-if="form.type === 'switch'">
            Stan (on/off)
            <select v-model="form.state.on">
              <option :value="true">on</option>
              <option :value="false">off</option>
            </select>
          </label>

          <label v-else-if="form.type === 'dimmer'">
            Poziom (0-100)
            <input v-model.number="form.state.level" type="number" min="0" max="100" required />
          </label>

          <label v-else>
            State JSON (opcjonalnie)
            <textarea
              v-model="rawStateJson"
              rows="4"
              placeholder='np. {"temperatureC": 23.4, "humidity": 45}'
            />
          </label>
        </div>

        <div class="device-form__actions">
          <button type="submit">{{ editingDeviceId ? 'Zapisz zmiany' : 'Dodaj urządzenie' }}</button>
          <button v-if="editingDeviceId" type="button" class="secondary" @click="resetForm">Anuluj edycję</button>
        </div>
      </form>

      <h2>Lista urządzeń</h2>
      <table v-if="devices.length" class="device-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Nazwa</th>
            <th>Typ</th>
            <th>Akcje</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="device in devices" :key="device.id">
            <td>{{ device.id }}</td>
            <td>{{ device.name || '—' }}</td>
            <td>{{ device.type }}</td>
            <td class="device-table__actions">
              <button type="button" class="secondary" @click="startEdit(device)">Edytuj</button>
              <button type="button" class="danger" @click="removeDevice(device)">Usuń</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>Brak urządzeń.</p>

      <div class="admin-panel__actions">
        <RouterLink to="/devices" class="admin-panel__action-link">Przejdź do Devices</RouterLink>
        <RouterLink to="/dashboard" class="admin-panel__action-link">Przejdź do Dashboard</RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup>
import axios from 'axios'
import { onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { getAdminApiToken } from '../auth'

const devices = ref([])
const errorMessage = ref('')
const successMessage = ref('')
const editingDeviceId = ref('')
const rawStateJson = ref('')

const form = reactive({
  id: '',
  name: '',
  type: 'switch',
  topic: '',
  state: {
    on: false,
    level: 0,
  },
})

const resetForm = () => {
  editingDeviceId.value = ''
  rawStateJson.value = ''
  form.id = ''
  form.name = ''
  form.type = 'switch'
  form.topic = ''
  form.state = { on: false, level: 0 }
}

const fetchDevices = async () => {
  const { data } = await axios.get('/api/devices')
  devices.value = Array.isArray(data) ? data : []
}

const getAdminRequestConfig = () => ({
  headers: {
    Authorization: `Bearer ${getAdminApiToken()}`,
  },
})

const buildPayload = () => {
  const payload = {
    name: form.name,
    type: form.type,
  }

  if (!editingDeviceId.value) {
    payload.id = form.id
  }

  if (form.topic) {
    payload.topic = form.topic
  }

  if (form.type === 'switch') {
    payload.state = { on: Boolean(form.state.on) }
    return payload
  }

  if (form.type === 'dimmer') {
    payload.state = { level: Number(form.state.level) }
    return payload
  }

  if (rawStateJson.value.trim()) {
    payload.state = JSON.parse(rawStateJson.value)
  }

  return payload
}

const saveDevice = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const payload = buildPayload()

    if (editingDeviceId.value) {
      await axios.put(`/api/admin/devices/${editingDeviceId.value}`, payload, getAdminRequestConfig())
      successMessage.value = 'Zapisano zmiany urządzenia.'
    } else {
      await axios.post('/api/admin/devices', payload, getAdminRequestConfig())
      successMessage.value = 'Dodano nowe urządzenie.'
    }

    await fetchDevices()
    resetForm()
  } catch (error) {
    errorMessage.value = error?.response?.data?.detail ?? error?.message ?? 'Nie udało się zapisać urządzenia.'
  }
}

const startEdit = (device) => {
  editingDeviceId.value = device.id
  form.id = device.id
  form.name = device.name || ''
  form.type = device.type || 'switch'
  form.topic = device.topic || ''

  if (form.type === 'switch') {
    form.state = { on: Boolean(device.state?.on) }
    rawStateJson.value = ''
  } else if (form.type === 'dimmer') {
    form.state = { level: Number(device.state?.level ?? 0) }
    rawStateJson.value = ''
  } else {
    form.state = { on: false, level: 0 }
    rawStateJson.value = JSON.stringify(device.state || {}, null, 2)
  }
}

const removeDevice = async (device) => {
  errorMessage.value = ''
  successMessage.value = ''

  try {
    await axios.delete(`/api/admin/devices/${device.id}`, getAdminRequestConfig())
    if (editingDeviceId.value === device.id) {
      resetForm()
    }
    await fetchDevices()
    successMessage.value = `Usunięto urządzenie: ${device.name || device.id}.`
  } catch (error) {
    errorMessage.value = error?.response?.data?.detail ?? error?.message ?? 'Nie udało się usunąć urządzenia.'
  }
}

onMounted(async () => {
  try {
    await fetchDevices()
  } catch (error) {
    errorMessage.value = error?.response?.data?.detail ?? error?.message ?? 'Nie udało się pobrać urządzeń.'
  }
})
</script>

<style scoped>
.admin-panel {
  display: flex;
  justify-content: center;
  padding: 2rem;
}

.admin-panel__card {
  width: min(980px, 100%);
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.1);
}

.admin-panel__error {
  color: #dc2626;
  font-weight: 600;
}

.admin-panel__success {
  color: #15803d;
  font-weight: 600;
}

.device-form {
  margin: 1rem 0 1.5rem;
  padding: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 0.8rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0.9rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.95rem;
}

input,
select,
textarea,
button {
  font: inherit;
}

input,
select,
textarea {
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.5rem 0.6rem;
}

.device-form__actions,
.admin-panel__actions,
.device-table__actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

button,
.admin-panel__action-link {
  background: #2563eb;
  color: white;
  border: none;
  padding: 0.55rem 0.9rem;
  border-radius: 0.6rem;
  text-decoration: none;
  cursor: pointer;
}

button.secondary {
  background: #475569;
}

button.danger {
  background: #dc2626;
}

.device-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.6rem;
}

.device-table th,
.device-table td {
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
  padding: 0.6rem 0.4rem;
}

.admin-panel__actions {
  margin-top: 1rem;
}

@media (prefers-color-scheme: dark) {
  .admin-panel__card {
    background: rgba(15, 23, 42, 0.9);
    box-shadow: 0 16px 30px rgba(2, 6, 23, 0.6);
  }

  input,
  select,
  textarea {
    background: rgba(15, 23, 42, 0.8);
    color: #f8fafc;
    border-color: rgba(148, 163, 184, 0.4);
  }

  .device-form,
  .device-table th,
  .device-table td {
    border-color: rgba(148, 163, 184, 0.4);
  }
}
</style>
