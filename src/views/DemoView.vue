<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePreferencesStore } from '../stores/preferences'
import { themes } from '../data/themes'
import { api } from '../lib/api'
import CreateGameForm from '../components/CreateGameForm.vue'
import OrganizerDemo from '../components/OrganizerDemo.vue'

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

function back() {
  router.push('/')
}

function openGame(game) {
  router.push(`/game/${game.token}`)
}
</script>

<template>
  <CreateGameForm
    :accent="preferences.theme.accent"
    :theme-id="preferences.themeId"
    :themes="availableThemes"
    @created="openGame"
  />

  <OrganizerDemo :accent="preferences.theme.accent" @back="back" />
</template>
