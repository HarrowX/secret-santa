<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps({
  page: String,
  accent: String,
  isDay: Boolean,
})

const emit = defineEmits(['navigate'])

const menuOpen = ref(false)

const links = [
  { label: 'На главную', target: 'landing' },
  { label: 'Создать игру', target: 'demo' },
  { label: 'Мои игры', target: 'my' },
  { label: 'Быстрая жеребьёвка', target: 'randomizer' },
  { label: 'Возможности', target: 'features' },
]

function go(target) {
  emit('navigate', target)
  menuOpen.value = false
}

function onKeydown(event) {
  if (event.key === 'Escape') menuOpen.value = false
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b backdrop-blur-xl"
    :class="isDay ? 'border-slate-900/10 bg-white/45 text-slate-900' : 'border-white/10 bg-slate-950/35 text-slate-100'"
  >
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
      <button
        type="button"
        class="flex items-center gap-2 text-lg font-black tracking-tight text-inherit"
        aria-label="На главную"
        @click="go('landing')"
      >
        <span class="grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-white/10">
          <svg
            viewBox="0 0 24 24"
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3z" />
            <path d="M19 18l.8 2.2L22 21l-2.2.8L19 24l-.8-2.2L16 21l2.2-.8L19 18z" />
          </svg>
        </span>
        тайный санта<span :style="{ color: accent }">.</span>
      </button>

      <nav class="hidden items-center gap-6 text-sm md:flex" aria-label="Основная навигация">
        <button
          v-for="(link, index) in links"
          :key="index"
          type="button"
          class="text-inherit opacity-70 transition hover:opacity-100"
          :class="page === link.target ? 'opacity-100' : ''"
          :style="page === link.target ? { color: accent } : {}"
          :aria-current="page === link.target ? 'page' : undefined"
          @click="go(link.target)"
        >
          {{ link.label }}
        </button>
      </nav>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-full border px-4 py-2 text-sm font-semibold transition hover:opacity-80"
          :class="isDay ? 'border-slate-900/20' : 'border-white/25'"
          :style="{ color: accent }"
          @click="go('demo')"
        >
          Открыть демо
        </button>
        <button
          type="button"
          class="grid h-9 w-9 place-items-center rounded-full border md:hidden"
          :class="isDay ? 'border-slate-900/20' : 'border-white/25'"
          :aria-expanded="menuOpen"
          :aria-controls="'mobile-menu'"
          :aria-label="menuOpen ? 'Закрыть меню' : 'Открыть меню'"
          @click="menuOpen = !menuOpen"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path v-if="menuOpen" d="M6 6l12 12M18 6L6 18" />
            <path v-else d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>
    </div>

    <div
      v-if="menuOpen"
      id="mobile-menu"
      class="border-t px-5 py-3 md:hidden"
      :class="isDay ? 'border-slate-900/10' : 'border-white/10'"
    >
      <nav class="mx-auto grid max-w-6xl gap-1" aria-label="Мобильная навигация">
        <button
          v-for="(link, index) in links"
          :key="index"
          type="button"
          class="rounded-xl px-3 py-2 text-left text-sm opacity-75 transition hover:bg-white/10 hover:opacity-100"
          :class="page === link.target ? 'bg-white/10 opacity-100' : ''"
          :style="page === link.target ? { color: accent } : {}"
          @click="go(link.target)"
        >
          {{ link.label }}
        </button>
      </nav>
    </div>
  </header>
</template>
