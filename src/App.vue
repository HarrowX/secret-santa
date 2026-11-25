<script setup>
import { computed } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import { storeToRefs } from 'pinia'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import { usePreferencesStore } from './stores/preferences'

const route = useRoute()
const router = useRouter()
const preferences = usePreferencesStore()
const { theme, isDay, background } = storeToRefs(preferences)

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

    <SiteFooter :accent="theme.accent" :is-day="isDay" />
  </div>
</template>
