<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePreferencesStore } from '../stores/preferences'
import { api } from '../lib/api'
import HeroSection from '../components/HeroSection.vue'
import ThemeShowcase from '../components/ThemeShowcase.vue'
import StepsSection from '../components/StepsSection.vue'
import FeatureSection from '../components/FeatureSection.vue'
import CtaSection from '../components/CtaSection.vue'

const router = useRouter()
const preferences = usePreferencesStore()
const availableThemes = ref([])
const themesMessage = ref('Загружаем оформления…')
const themesError = ref('')

onMounted(async () => {
  try {
    const loaded = await api.themes.list()
    availableThemes.value = Array.isArray(loaded) ? loaded : []
    themesMessage.value = availableThemes.value.length ? '' : 'Оформления пока не добавлены'
  } catch {
    availableThemes.value = []
    themesError.value = 'Оформления временно недоступны. Попробуйте зайти позже.'
  }
})

function openCreate() {
  router.push('/new')
}
</script>

<template>
  <HeroSection :theme="preferences.theme" :accent="preferences.theme.accent" @open-create="openCreate" />
  <ThemeShowcase
    v-model:theme-id="preferences.themeId"
    v-model:mode="preferences.mode"
    :themes="availableThemes"
    :themes-message="themesMessage"
    :themes-error="themesError"
  />
  <StepsSection :accent="preferences.theme.accent" />
  <FeatureSection
    :themes="availableThemes"
    :themes-message="themesMessage"
    :themes-error="themesError"
    :accent="preferences.theme.accent"
    @open-create="openCreate"
  />
  <CtaSection :accent="preferences.theme.accent" @open-create="openCreate" />
</template>
