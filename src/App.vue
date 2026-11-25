<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import { storeToRefs } from 'pinia'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import { usePreferencesStore } from './stores/preferences'
import { api } from './lib/api'

const route = useRoute()
const router = useRouter()
const preferences = usePreferencesStore()
const { theme, isDay, background } = storeToRefs(preferences)

const cookieConsent = ref(true)

const page = computed(() => {
  if (route.name === 'demo' || route.name === 'game' || route.name === 'join') return 'demo'
  return route.name ?? 'landing'
})

function navigate(target) {
  if (target === 'demo') router.push('/demo')
  else if (target === 'my') router.push('/my')
  else if (target === 'randomizer') router.push('/randomizer')
  else if (target === 'features') router.push({ path: '/', hash: '#features' })
  else router.push('/')
}

onMounted(async () => {
  cookieConsent.value = localStorage.getItem('cookie-consent') === 'accepted'
  try {
    const { tenant } = await api.tenants.current()
    if (tenant?.game?.token && route.name !== 'game') {
      router.push(`/game/${tenant.game.token}`)
    }
  } catch {
    router.push('/')
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
    :style="{ background, '--accent': theme.accent }"
  >
    <SiteHeader :page="page" :accent="theme.accent" :is-day="isDay" @navigate="navigate" />

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
