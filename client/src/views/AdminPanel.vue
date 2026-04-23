<template>
  <div class="admin-panel">
    <section class="admin-panel__card">
      <h1>Panel administratora</h1>
      <p>Masz dostęp do sekcji chronionej.</p>

      <ul>
        <li>Monitoruj urządzenia i metryki systemu.</li>
        <li>Dodaj własne akcje administracyjne w tym widoku.</li>
      </ul>

      <div class="admin-panel__actions">
        <RouterLink to="/devices" class="admin-panel__action-link">Przejdź do Devices</RouterLink>
        <RouterLink to="/dashboard" class="admin-panel__action-link">Przejdź do Dashboard</RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup>
import { RouterLink } from 'vue-router'
</script>

<style scoped>
.admin-panel {
  display: flex;
  justify-content: center;
  padding: 2rem;
}

.admin-panel__card {
  width: min(780px, 100%);
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.1);
}

.admin-panel__actions {
  margin-top: 1rem;
  display: flex;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.admin-panel__action-link {
  background: #2563eb;
  color: white;
  padding: 0.65rem 1rem;
  border-radius: 0.65rem;
  text-decoration: none;
  font-weight: 600;
}

@media (prefers-color-scheme: dark) {
  .admin-panel__card {
    background: rgba(15, 23, 42, 0.9);
    box-shadow: 0 16px 30px rgba(2, 6, 23, 0.6);
  }
}
</style>
