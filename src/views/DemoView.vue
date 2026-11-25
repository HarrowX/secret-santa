<script setup>
import { useRouter } from 'vue-router'
import { usePreferencesStore } from '../stores/preferences'
import OrganizerDemo from '../components/OrganizerDemo.vue'

const router = useRouter()
const preferences = usePreferencesStore()

function back() {
  router.push('/')
}
</script>

<template>
  <OrganizerDemo :accent="preferences.theme.accent" @back="back" />
</template>
