import axios from 'axios'
import { computed, ref } from 'vue'

const SESSION_STORAGE_AUTH_KEY = 'roompi-admin-authenticated'
const SESSION_STORAGE_TOKEN_KEY = 'roompi-admin-token'

const isAuthenticated = ref(false)
const adminToken = ref('')

const isBrowserEnvironment =
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'

const readStoredState = () => {
  if (!isBrowserEnvironment) {
    return {
      isAuthenticated: false,
      token: '',
    }
  }

  const storedToken = window.sessionStorage.getItem(SESSION_STORAGE_TOKEN_KEY) || ''
  return {
    isAuthenticated: window.sessionStorage.getItem(SESSION_STORAGE_AUTH_KEY) === 'true' && Boolean(storedToken),
    token: storedToken,
  }
}

const persistState = ({ authenticated, token }) => {
  if (!isBrowserEnvironment) {
    return
  }

  window.sessionStorage.setItem(SESSION_STORAGE_AUTH_KEY, authenticated ? 'true' : 'false')

  if (token) {
    window.sessionStorage.setItem(SESSION_STORAGE_TOKEN_KEY, token)
    return
  }

  window.sessionStorage.removeItem(SESSION_STORAGE_TOKEN_KEY)
}

const initialState = readStoredState()
isAuthenticated.value = initialState.isAuthenticated
adminToken.value = initialState.token

export const getAdminApiToken = () => adminToken.value

export const useAdminAuth = () => {
  const login = async ({ username, password }) => {
    const { data } = await axios.post('/api/admin/login', {
      username,
      password,
    })

    const token = data?.access_token || ''
    const loginSucceeded = Boolean(token)

    isAuthenticated.value = loginSucceeded
    adminToken.value = token
    persistState({ authenticated: loginSucceeded, token })

    return loginSucceeded
  }

  const logout = () => {
    isAuthenticated.value = false
    adminToken.value = ''
    persistState({ authenticated: false, token: '' })
  }

  return {
    isAuthenticated: computed(() => isAuthenticated.value),
    login,
    logout,
  }
}
