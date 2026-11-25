<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ensureSession } from '../lib/api'
import { usePreferencesStore } from '../stores/preferences'
import OrganizerDemo from '../components/OrganizerDemo.vue'

const router = useRouter()
const preferences = usePreferencesStore()
const creating = ref(false)
const error = ref('')

function back() {
  router.push('/')
}

async function createGame() {
  creating.value = true
  error.value = ''
  try {
    await ensureSession()
    const game = await api.games.create({ title: 'Новогодняя игра', themeId: preferences.themeId })
    router.push(`/game/${game.id}`)
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 pb-4">
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div>
        <p class="font-semibold">Попробуйте в реальной игре</p>
        <p class="text-xs opacity-60">Без регистрации и оплаты — игра появится сразу</p>
      </div>
      <button
        type="button"
        class="rounded-full px-5 py-2.5 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
        :style="{ background: preferences.theme.accent, color: '#0b1120' }"
        :disabled="creating"
        @click="createGame"
      >
        {{ creating ? 'Создаём…' : 'Создать игру' }}
      </button>
      <p v-if="error" role="alert" class="w-full text-sm text-rose-300">{{ error }}</p>
    </div>
  </div>

  <OrganizerDemo :accent="preferences.theme.accent" @back="back" />
</template>
