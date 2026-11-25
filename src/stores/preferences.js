import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { themes } from '../data/themes'

const THEME_KEY = 'santa-theme'
const MODE_KEY = 'santa-mode'

function storedTheme() {
  const id = localStorage.getItem(THEME_KEY)
  return themes.some((item) => item.id === id) ? id : 'winter'
}

function storedMode() {
  const value = localStorage.getItem(MODE_KEY)
  return value === 'day' || value === 'night' ? value : 'night'
}

export const usePreferencesStore = defineStore('preferences', () => {
  const themeId = ref(storedTheme())
  const mode = ref(storedMode())

  const theme = computed(() => themes.find((item) => item.id === themeId.value) ?? themes[0])
  const isDay = computed(() => mode.value === 'day')
  const background = computed(() => (isDay.value ? theme.value.day : theme.value.night))

  function setTheme(id) {
    if (themes.some((item) => item.id === id)) themeId.value = id
  }

  function toggleMode() {
    mode.value = isDay.value ? 'night' : 'day'
  }

  watch(themeId, (value) => localStorage.setItem(THEME_KEY, value))
  watch(mode, (value) => localStorage.setItem(MODE_KEY, value))

  return { themeId, mode, theme, isDay, background, setTheme, toggleMode }
})
