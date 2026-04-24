import { computed, ref } from 'vue'
import adminCredentials from './config/adminCredentials.json'

const SESSION_STORAGE_KEY = 'roompi-admin-authenticated'

const isAuthenticated = ref(false)

const isBrowserEnvironment =
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'

const readStoredState = () => {
  if (!isBrowserEnvironment) {
    return false
  }

  return window.sessionStorage.getItem(SESSION_STORAGE_KEY) === 'true'
}

const persistState = (value) => {
  if (!isBrowserEnvironment) {
    return
  }

  window.sessionStorage.setItem(SESSION_STORAGE_KEY, value ? 'true' : 'false')
}

isAuthenticated.value = readStoredState()

const getCredentials = () => {
  if (!adminCredentials || typeof adminCredentials !== 'object') {
    return {
      username: '',
      password: '',
    }
  }

  return {
    username: adminCredentials.username ?? '',
    password: adminCredentials.password ?? '',
    token: adminCredentials.token ?? '',
  }
}

export const getAdminApiToken = () => getCredentials().token

export const useAdminAuth = () => {
  const login = ({ username, password }) => {
    const credentials = getCredentials()
    const loginSucceeded =
      username === credentials.username && password === credentials.password

    isAuthenticated.value = loginSucceeded
    persistState(loginSucceeded)
    return loginSucceeded
  }

  const logout = () => {
    isAuthenticated.value = false
    persistState(false)
  }

  return {
    isAuthenticated: computed(() => isAuthenticated.value),
    login,
    logout,
  }
}
