import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { themes } from '../data/themes'

export const usePreferencesStore = defineStore('preferences', () => {
  const themeId = ref('winter')
  const mode = ref('night')

  const theme = computed(() => themes.find((item) => item.id === themeId.value) ?? themes[0])
  const isDay = computed(() => mode.value === 'day')
  const background = computed(() => (isDay.value ? theme.value.day : theme.value.night))

  function setTheme(id) {
    if (themes.some((item) => item.id === id)) themeId.value = id
  }

  function toggleMode() {
    mode.value = isDay.value ? 'night' : 'day'
  }

  return { themeId, mode, theme, isDay, background, setTheme, toggleMode }
})
