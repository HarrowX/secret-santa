<script setup>
import { useRouter } from 'vue-router'
import { usePreferencesStore } from '../stores/preferences'
import { themes } from '../data/themes'
import CreateGameForm from '../components/CreateGameForm.vue'
import OrganizerDemo from '../components/OrganizerDemo.vue'

const router = useRouter()
const preferences = usePreferencesStore()

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
    :themes="themes"
    @created="openGame"
  />

  <OrganizerDemo :accent="preferences.theme.accent" @back="back" />
</template>
