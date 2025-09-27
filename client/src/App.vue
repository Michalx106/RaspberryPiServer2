<script setup>
import { computed, ref } from 'vue'
import Dashboard from './views/Dashboard.vue'
import ShellyControl from './views/ShellyControl.vue'

const tabs = [
  { id: 'dashboard', label: 'System Metrics' },
  { id: 'shelly', label: 'Shelly Device' }
]

const activeTab = ref(tabs[0].id)

const selectTab = (tabId) => {
  activeTab.value = tabId
}

const activeTabComponent = computed(() =>
  activeTab.value === 'shelly' ? ShellyControl : Dashboard
)

const activeTabLabel = computed(
  () => tabs.find((tab) => tab.id === activeTab.value)?.label ?? ''
)
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <h1 class="app-title">Raspberry Pi Control Center</h1>
      <nav class="tab-navigation" aria-label="Primary">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="tab-button"
          :class="{ 'tab-button--active': tab.id === activeTab }"
          @click="selectTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </nav>
    </header>

    <section class="tab-panel" role="tabpanel" :aria-label="activeTabLabel">
      <component :is="activeTabComponent" />
    </section>
  </main>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%);
  display: flex;
  flex-direction: column;
}

.app-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  padding: 2rem 1.5rem 1rem;
  text-align: center;
}

.app-title {
  margin: 0;
  font-size: clamp(2rem, 3vw, 2.75rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #0f172a;
}

.tab-navigation {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}

.tab-button {
  border: none;
  border-radius: 9999px;
  padding: 0.65rem 1.75rem;
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
  font-weight: 600;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, background-color 150ms ease;
}

.tab-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 18px -16px rgba(15, 23, 42, 0.65);
}

.tab-button--active {
  background: #1d4ed8;
  color: #f8fafc;
  box-shadow: 0 12px 22px -16px rgba(29, 78, 216, 0.8);
}

.tab-button:disabled,
.tab-button--active:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.tab-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-bottom: 3rem;
}

@media (prefers-color-scheme: dark) {
  .app-shell {
    background: radial-gradient(circle at top, #1e293b 0%, #020617 100%);
  }

  .app-title {
    color: #f8fafc;
  }

  .tab-button {
    background: rgba(148, 163, 184, 0.15);
    color: #e2e8f0;
  }

  .tab-button--active {
    background: #2563eb;
    color: #f8fafc;
    box-shadow: 0 12px 22px -16px rgba(37, 99, 235, 0.9);
  }
}
</style>
