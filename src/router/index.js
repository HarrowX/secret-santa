import { createRouter, createWebHistory } from 'vue-router'
import LandingView from '../views/LandingView.vue'
import DemoView from '../views/DemoView.vue'
import GameView from '../views/GameView.vue'
import JoinView from '../views/JoinView.vue'
import MyGamesView from '../views/MyGamesView.vue'
import OrganizerInviteView from '../views/OrganizerInviteView.vue'
import RandomizerView from '../views/RandomizerView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: LandingView },
    { path: '/demo', name: 'demo', component: DemoView },
    { path: '/game/:token', name: 'game', component: GameView },
    { path: '/join/:token', name: 'join', component: JoinView },
    { path: '/organizer/:token', name: 'organizer-invite', component: OrganizerInviteView },
    { path: '/my', name: 'my', component: MyGamesView },
    { path: '/randomizer', name: 'randomizer', component: RandomizerView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  },
})

export default router
