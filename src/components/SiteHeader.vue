<script setup>
defineProps({
  page: String,
  accent: String,
  isDay: Boolean,
})

const emit = defineEmits(['navigate'])

const links = [
  { label: 'На главную', target: 'landing' },
  { label: 'Создать игру', target: 'demo' },
  { label: 'Быстрая жеребьёвка', target: 'demo' },
  { label: 'Возможности', target: 'landing' },
]
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b backdrop-blur-xl"
    :class="isDay ? 'border-slate-900/10 bg-white/45 text-slate-900' : 'border-white/10 bg-slate-950/35 text-slate-100'"
  >
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
      <button type="button" class="flex items-center gap-2 text-lg font-black tracking-tight text-inherit" @click="emit('navigate', 'landing')">
        <span class="grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-white/10">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3z" />
            <path d="M19 18l.8 2.2L22 21l-2.2.8L19 24l-.8-2.2L16 21l2.2-.8L19 18z" />
          </svg>
        </span>
        тайный санта<span :style="{ color: accent }">.</span>
      </button>

      <nav class="hidden items-center gap-6 text-sm md:flex">
        <button
          v-for="(link, index) in links"
          :key="index"
          type="button"
          class="text-inherit opacity-70 transition hover:opacity-100"
          @click="emit('navigate', link.target)"
        >
          {{ link.label }}
        </button>
      </nav>

      <button
        type="button"
        class="rounded-full border px-4 py-2 text-sm font-semibold text-inherit opacity-80 transition hover:opacity-100"
        :class="isDay ? 'border-slate-900/20' : 'border-white/25'"
      >
        Войти
      </button>
    </div>
  </header>
</template>
