<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import { storeToRefs } from 'pinia'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import { usePreferencesStore } from './stores/preferences'
import { ApiError, api } from './lib/api'
import { domain } from './config'

const route = useRoute()
const router = useRouter()
const preferences = usePreferencesStore()
const { theme, isDay, mode, background } = storeToRefs(preferences)

const cookieConsent = ref(localStorage.getItem('cookie-consent') === 'accepted')
const tenantError = ref('')
const initialPath = route.fullPath
const personalRoutes = new Set([
  'join',
  'participant',
  'organizer-invite',
  'game',
  'randomizer',
  'my',
  'support',
  'create',
])
const gameRoutes = new Set(['game', 'join', 'participant', 'organizer-invite'])

const page = computed(() => route.name ?? 'landing')

function navigate(target) {
  if (target === 'create') router.push('/new')
  else if (target === 'my') router.push('/my')
  else if (target === 'randomizer') router.push('/randomizer')
  else if (target === 'features') router.push({ path: '/', hash: '#features' })
  else router.push('/')
}

function isUnknownSubdomain() {
  const host = window.location.hostname.toLowerCase()
  const base = domain.toLowerCase()
  if (!base || host === base || host === `www.${base}`) return false
  if (!host.endsWith(`.${base}`)) return false
  return !host.slice(0, -(base.length + 1)).includes('.')
}

onMounted(async () => {
  try {
    const current = await api.tenants.current()
    const tenant = current?.tenant ?? null
    if (route.fullPath !== initialPath) return
    if (tenant?.game?.token) {
      if (!personalRoutes.has(route.name)) router.push(`/game/${tenant.game.token}`)
      return
    }
    if (isUnknownSubdomain()) router.push('/')
  } catch (requestError) {
    if (route.fullPath !== initialPath) return
    if (requestError instanceof ApiError && requestError.status === 404) {
      if (route.name !== 'landing') router.push('/')
      return
    }
    if (!gameRoutes.has(route.name)) return
    tenantError.value = 'Не удалось проверить адрес игры. Данные на странице могут быть неактуальны.'
  }
})

function acceptCookies() {
  localStorage.setItem('cookie-consent', 'accepted')
  cookieConsent.value = true
}
</script>

<template>
  <div
    class="min-h-screen transition-all duration-500"
    :class="isDay ? 'text-slate-900' : 'text-slate-100'"
    :data-mode="mode"
    :style="{ background, '--accent': theme.accent }"
  >
    <SiteHeader :page="page" :accent="theme.accent" :is-day="isDay" @navigate="navigate" />

    <p
      v-if="tenantError"
      role="status"
      class="mx-auto mt-3 max-w-6xl rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200"
    >
      {{ tenantError }}
    </p>

    <main>
      <RouterView />
    </main>

    <div v-if="!cookieConsent" class="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-3xl px-5 pb-5" role="status">
      <div class="rounded-2xl border border-white/15 bg-slate-950/90 p-4 text-sm shadow-2xl backdrop-blur">
        <p class="opacity-80">
          Используем только технические cookie для входа и сохранения сессии. Подробнее — в
          <RouterLink to="/privacy" class="underline">политике приватности</RouterLink>.
        </p>
        <button
          type="button"
          class="mt-3 rounded-full px-4 py-2 text-xs font-bold"
          :style="{ background: theme.accent, color: '#0b1120' }"
          @click="acceptCookies"
        >
          Понятно
        </button>
      </div>
    </div>

    <SiteFooter :accent="theme.accent" :is-day="isDay" />
  </div>
</template>
