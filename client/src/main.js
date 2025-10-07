import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const message = event?.reason?.message
    if (
      typeof message === 'string' &&
      message.includes(
        'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received'
      )
    ) {
      event.preventDefault()
      console.warn(
        'Suppressed asynchronous message channel error. This typically originates from a misbehaving browser extension.'
      )
    }
  })
}

createApp(App).mount('#app')
