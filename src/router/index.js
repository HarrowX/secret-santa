import { createRouter, createWebHistory } from 'vue-router'
import LandingView from '../views/LandingView.vue'
import DemoView from '../views/DemoView.vue'
import GameView from '../views/GameView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: LandingView },
    { path: '/demo', name: 'demo', component: DemoView },
    { path: '/game/:id', name: 'game', component: GameView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  },
})

export default router
