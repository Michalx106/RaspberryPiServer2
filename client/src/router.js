import { createRouter, createWebHistory } from 'vue-router'
import Devices from './views/Devices.vue'
import Dashboard from './views/Dashboard.vue'

const routes = [
  {
    path: '/',
    redirect: '/devices',
  },
  {
    path: '/devices',
    name: 'devices',
    component: Devices,
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: Dashboard,
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
