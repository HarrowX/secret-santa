<script setup>
import { computed, ref } from 'vue'
import SiteHeader from './components/SiteHeader.vue'
import HeroSection from './components/HeroSection.vue'
import ThemeShowcase from './components/ThemeShowcase.vue'
import StepsSection from './components/StepsSection.vue'
import FeatureSection from './components/FeatureSection.vue'
import CtaSection from './components/CtaSection.vue'
import OrganizerDemo from './components/OrganizerDemo.vue'
import SiteFooter from './components/SiteFooter.vue'
import { themes } from './data/themes'

const themeId = ref('winter')
const mode = ref('night')
const page = ref('landing')

const theme = computed(() => themes.find((item) => item.id === themeId.value) ?? themes[0])
const isDay = computed(() => mode.value === 'day')
const background = computed(() => (isDay.value ? theme.value.day : theme.value.night))
</script>

<template>
  <div
    class="min-h-screen transition-all duration-500"
    :class="isDay ? 'text-slate-900' : 'text-slate-100'"
    :style="{ background, '--accent': theme.accent }"
  >
    <SiteHeader :page="page" :accent="theme.accent" :is-day="isDay" @navigate="page = $event" />

    <main>
      <template v-if="page === 'landing'">
        <HeroSection :theme="theme" :accent="theme.accent" @open-demo="page = 'demo'" />
        <ThemeShowcase v-model:theme-id="themeId" v-model:mode="mode" :themes="themes" />
        <StepsSection :accent="theme.accent" />
        <FeatureSection :accent="theme.accent" @open-demo="page = 'demo'" />
        <CtaSection :accent="theme.accent" @open-demo="page = 'demo'" />
      </template>
      <OrganizerDemo v-else :accent="theme.accent" @back="page = 'landing'" />
    </main>

    <SiteFooter :accent="theme.accent" :is-day="isDay" />
  </div>
</template>
