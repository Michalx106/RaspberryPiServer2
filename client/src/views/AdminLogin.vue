<template>
  <div class="admin-login">
    <section class="admin-login__card">
      <h1>Admin Login</h1>
      <p>Zaloguj się, aby otworzyć panel administracyjny.</p>

      <form class="admin-login__form" @submit.prevent="submitLogin">
        <label for="admin-username">Login</label>
        <input
          id="admin-username"
          v-model.trim="username"
          type="text"
          autocomplete="username"
          required
        />

        <label for="admin-password">Hasło</label>
        <input
          id="admin-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
        />

        <button type="submit">Zaloguj</button>
      </form>

      <p v-if="errorMessage" class="admin-login__error" role="alert">{{ errorMessage }}</p>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminAuth } from '../auth'

const username = ref('')
const password = ref('')
const errorMessage = ref('')
const router = useRouter()
const route = useRoute()
const { login } = useAdminAuth()

const submitLogin = () => {
  errorMessage.value = ''

  const isSuccess = login({
    username: username.value,
    password: password.value,
  })

  if (!isSuccess) {
    errorMessage.value = 'Niepoprawny login lub hasło.'
    return
  }

  const redirectPath = typeof route.query.redirect === 'string' ? route.query.redirect : '/admin'
  router.push(redirectPath)
}
</script>

<style scoped>
.admin-login {
  display: flex;
  justify-content: center;
  padding: 2rem;
}

.admin-login__card {
  width: min(420px, 100%);
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.1);
}

.admin-login__form {
  display: grid;
  gap: 0.75rem;
}

.admin-login__form input {
  border: 1px solid #cbd5e1;
  border-radius: 0.6rem;
  padding: 0.7rem;
}

.admin-login__form button {
  border: none;
  border-radius: 0.6rem;
  background: #2563eb;
  color: white;
  padding: 0.7rem;
  font-weight: 600;
  cursor: pointer;
}

.admin-login__error {
  margin-top: 0.8rem;
  color: #b91c1c;
}

@media (prefers-color-scheme: dark) {
  .admin-login__card {
    background: rgba(15, 23, 42, 0.9);
    box-shadow: 0 16px 30px rgba(2, 6, 23, 0.6);
  }

  .admin-login__form input {
    border-color: #334155;
    background: #0f172a;
    color: #e2e8f0;
  }
}
</style>
