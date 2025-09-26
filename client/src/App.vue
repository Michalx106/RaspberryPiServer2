<script setup>
import Dashboard from './views/Dashboard.vue'
</script>

<template>
  <main class="app-shell">
    <Dashboard />
  </main>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%);
}

@media (prefers-color-scheme: dark) {
  .app-shell {
    background: radial-gradient(circle at top, #1e293b 0%, #020617 100%);
  }
}
</style>
