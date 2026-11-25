<script setup>
import { useRouter } from 'vue-router'
import { usePreferencesStore } from '../stores/preferences'
import { themes } from '../data/themes'
import HeroSection from '../components/HeroSection.vue'
import ThemeShowcase from '../components/ThemeShowcase.vue'
import StepsSection from '../components/StepsSection.vue'
import FeatureSection from '../components/FeatureSection.vue'
import CtaSection from '../components/CtaSection.vue'

const router = useRouter()
const preferences = usePreferencesStore()

function openDemo() {
  router.push('/demo')
}
</script>

<template>
  <HeroSection :theme="preferences.theme" :accent="preferences.theme.accent" @open-demo="openDemo" />
  <ThemeShowcase v-model:theme-id="preferences.themeId" v-model:mode="preferences.mode" :themes="themes" />
  <StepsSection :accent="preferences.theme.accent" />
  <FeatureSection :accent="preferences.theme.accent" @open-demo="openDemo" />
  <CtaSection :accent="preferences.theme.accent" @open-demo="openDemo" />
</template>
