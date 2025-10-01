<script setup>
import { ref } from 'vue'
import Dashboard from './views/Dashboard.vue'
import Devices from './views/Devices.vue'

const activeView = ref('dashboard')

const setView = (view) => {
  activeView.value = view
}

const isActive = (view) => activeView.value === view
</script>

<template>
  <main class="app-shell">
    <nav class="nav">
      <button
        type="button"
        class="nav__button"
        :class="{ 'nav__button--active': isActive('dashboard') }"
        @click="setView('dashboard')"
      >
        Dashboard
      </button>
      <button
        type="button"
        class="nav__button"
        :class="{ 'nav__button--active': isActive('devices') }"
        @click="setView('devices')"
      >
        Devices
      </button>
    </nav>

    <section class="view-container">
      <Dashboard v-if="isActive('dashboard')" />
      <Devices v-else />
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

.nav {
  display: flex;
  justify-content: center;
  gap: 1rem;
  padding: 1.5rem 2rem 0.5rem;
}

.nav__button {
  position: relative;
  padding: 0.75rem 1.5rem;
  border-radius: 999px;
  border: none;
  background: rgba(255, 255, 255, 0.75);
  color: #0f172a;
  font-weight: 600;
  cursor: pointer;
  transition: transform 150ms ease-in-out, box-shadow 150ms ease-in-out;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.1);
}

.nav__button:hover {
  transform: translateY(-1px);
}

.nav__button--active {
  background: #2563eb;
  color: #fff;
  box-shadow: 0 15px 35px rgba(37, 99, 235, 0.35);
}

.view-container {
  flex: 1;
}

@media (prefers-color-scheme: dark) {
  .app-shell {
    background: radial-gradient(circle at top, #1e293b 0%, #020617 100%);
  }

  .nav__button {
    background: rgba(15, 23, 42, 0.85);
    color: #e2e8f0;
    box-shadow: 0 10px 30px rgba(2, 6, 23, 0.6);
  }

  .nav__button--active {
    background: #2563eb;
    box-shadow: 0 20px 45px rgba(37, 99, 235, 0.55);
  }
}
</style>
