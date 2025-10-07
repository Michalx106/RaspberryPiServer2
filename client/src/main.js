import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

if (typeof window !== 'undefined') {
  const EXTENSION_MESSAGE_CHANNEL_ERROR =
    'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received'

  let hasLoggedSuppressionWarning = false

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason
    const message =
      typeof reason === 'string'
        ? reason
        : typeof reason?.message === 'string'
        ? reason.message
        : null

    if (typeof message === 'string' && message.includes(EXTENSION_MESSAGE_CHANNEL_ERROR)) {
      event.preventDefault()

      if (!hasLoggedSuppressionWarning) {
        hasLoggedSuppressionWarning = true
        console.warn(
          'Suppressed asynchronous message channel error. This typically originates from a misbehaving browser extension.'
        )
      }
    }
  })
}

createApp(App).mount('#app')
