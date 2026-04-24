import axios from 'axios'
import { computed, ref } from 'vue'

const AUTH_STORAGE_KEY = 'roompi-admin-auth'

const authState = ref({
  isAuthenticated: false,
  token: '',
})

const isBrowserEnvironment =
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'

const readStoredState = () => {
  if (!isBrowserEnvironment) {
    return { isAuthenticated: false, token: '' }
  }

  try {
    const raw = window.sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) {
      return { isAuthenticated: false, token: '' }
    }

    const parsed = JSON.parse(raw)
    const token = typeof parsed?.token === 'string' ? parsed.token : ''

    return {
      isAuthenticated: Boolean(token),
      token,
    }
  } catch {
    return { isAuthenticated: false, token: '' }
  }
}

const persistState = (value) => {
  if (!isBrowserEnvironment) {
    return
  }

  if (!value.token) {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
    return
  }

  window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(value))
}

const applyAuthHeader = (token) => {
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`
    return
  }

  delete axios.defaults.headers.common.Authorization
}

authState.value = readStoredState()
applyAuthHeader(authState.value.token)

export const useAdminAuth = () => {
  const login = async ({ username, password }) => {
    const { data } = await axios.post('/api/admin/login', {
      username,
      password,
    })

    const token = typeof data?.accessToken === 'string' ? data.accessToken : ''

    authState.value = {
      isAuthenticated: Boolean(token),
      token,
    }

    persistState(authState.value)
    applyAuthHeader(token)

    return authState.value.isAuthenticated
  }

  const logout = () => {
    authState.value = {
      isAuthenticated: false,
      token: '',
    }

    persistState(authState.value)
    applyAuthHeader('')
  }

  return {
    isAuthenticated: computed(() => authState.value.isAuthenticated),
    login,
    logout,
  }
}
