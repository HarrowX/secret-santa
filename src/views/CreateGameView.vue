<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePreferencesStore } from '../stores/preferences'
import { themes } from '../data/themes'
import { api } from '../lib/api'
import CreateGameForm from '../components/CreateGameForm.vue'

const router = useRouter()
const preferences = usePreferencesStore()
const availableThemes = ref(themes)

onMounted(async () => {
  try {
    const loaded = await api.themes.list()
    if (loaded.length) availableThemes.value = loaded
  } catch {
    availableThemes.value = themes
  }
})

function openGame(game) {
  router.push(`/game/${game.token}`)
}
</script>

<template>
  <section class="mx-auto max-w-6xl px-5 pb-4 pt-12">
    <button
      type="button"
      class="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10"
      @click="router.push('/')"
    >
      ← На главную
    </button>
  </section>

  <CreateGameForm
    :accent="preferences.theme.accent"
    :theme-id="preferences.themeId"
    :themes="availableThemes"
    @created="openGame"
  />
</template>
