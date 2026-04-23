import { createRouter, createWebHistory } from 'vue-router'
import Devices from './views/Devices.vue'
import Dashboard from './views/Dashboard.vue'
import AdminLogin from './views/AdminLogin.vue'
import AdminPanel from './views/AdminPanel.vue'
import { useAdminAuth } from './auth'

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
  {
    path: '/admin/login',
    name: 'admin-login',
    component: AdminLogin,
    meta: {
      requiresGuest: true,
    },
  },
  {
    path: '/admin',
    name: 'admin',
    component: AdminPanel,
    meta: {
      requiresAdmin: true,
    },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const { isAuthenticated } = useAdminAuth()

  if (to.meta.requiresAdmin && !isAuthenticated.value) {
    return { path: '/admin/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresGuest && isAuthenticated.value) {
    return '/admin'
  }

  return true
})

export default router
