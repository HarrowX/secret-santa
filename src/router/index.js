import { createRouter, createWebHistory } from 'vue-router'
import LandingView from '../views/LandingView.vue'
import CreateGameView from '../views/CreateGameView.vue'
import InfoView from '../views/InfoView.vue'
import SupportView from '../views/SupportView.vue'
import GameView from '../views/GameView.vue'
import JoinView from '../views/JoinView.vue'
import MyGamesView from '../views/MyGamesView.vue'
import OrganizerInviteView from '../views/OrganizerInviteView.vue'
import RandomizerView from '../views/RandomizerView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: LandingView },
    { path: '/new', name: 'create', component: CreateGameView },
    { path: '/game/:token', name: 'game', component: GameView },
    { path: '/join/:token', name: 'join', component: JoinView },
    { path: '/participant/:token', name: 'participant', component: JoinView },
    { path: '/organizer/:token', name: 'organizer-invite', component: OrganizerInviteView },
    { path: '/my', name: 'my', component: MyGamesView },
    { path: '/randomizer', name: 'randomizer', component: RandomizerView },
    { path: '/faq', name: 'faq', component: InfoView, props: { kind: 'faq' } },
    { path: '/terms', name: 'terms', component: InfoView, props: { kind: 'terms' } },
    { path: '/privacy', name: 'privacy', component: InfoView, props: { kind: 'privacy' } },
    { path: '/support', name: 'support', component: SupportView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  },
})

export default router
