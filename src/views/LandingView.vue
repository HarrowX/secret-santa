<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePreferencesStore } from '../stores/preferences'
import { themes } from '../data/themes'
import { api } from '../lib/api'
import HeroSection from '../components/HeroSection.vue'
import ThemeShowcase from '../components/ThemeShowcase.vue'
import StepsSection from '../components/StepsSection.vue'
import FeatureSection from '../components/FeatureSection.vue'
import CtaSection from '../components/CtaSection.vue'

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

function openDemo() {
  router.push('/demo')
}
</script>

<template>
  <HeroSection :theme="preferences.theme" :accent="preferences.theme.accent" @open-demo="openDemo" />
  <ThemeShowcase v-model:theme-id="preferences.themeId" v-model:mode="preferences.mode" :themes="availableThemes" />
  <StepsSection :accent="preferences.theme.accent" />
  <FeatureSection :accent="preferences.theme.accent" @open-demo="openDemo" />
  <CtaSection :accent="preferences.theme.accent" @open-demo="openDemo" />
</template>
