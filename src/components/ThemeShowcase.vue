<script setup>
defineProps({
  themes: Array,
  themeId: String,
  mode: String,
})

const emit = defineEmits(['update:themeId', 'update:mode'])

const activeClass = 'bg-white text-slate-950 shadow-sm'
const idleClass = 'text-inherit opacity-70 hover:opacity-100'
</script>

<template>
  <section class="mx-auto max-w-6xl px-5 pb-16">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Выберите свой мир</p>
        <h2 class="mt-2 text-2xl font-bold tracking-tight">Атмосфера вашей игры</h2>
        <p class="mt-2 text-sm opacity-60">{{ themes.length }} оформлений · каждая доступна бесплатно</p>
      </div>

      <div class="inline-flex rounded-full border border-white/20 bg-white/10 p-1 text-sm">
        <button
          type="button"
          class="rounded-full px-4 py-1.5 font-semibold transition"
          :class="mode === 'night' ? activeClass : idleClass"
          :aria-pressed="mode === 'night'"
          @click="emit('update:mode', 'night')"
        >
          Ночь
        </button>
        <button
          type="button"
          class="rounded-full px-4 py-1.5 font-semibold transition"
          :class="mode === 'day' ? activeClass : idleClass"
          :aria-pressed="mode === 'day'"
          @click="emit('update:mode', 'day')"
        >
          День
        </button>
      </div>
    </div>

    <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="item in themes"
        :key="item.id"
        type="button"
        class="group overflow-hidden rounded-2xl border p-1.5 text-left transition duration-300"
        :class="item.id === themeId ? 'bg-white/10' : 'border-white/10 hover:border-white/40 hover:bg-white/5'"
        :style="item.id === themeId ? { borderColor: item.accent } : {}"
        :aria-pressed="item.id === themeId"
        @click="emit('update:themeId', item.id)"
      >
        <div class="grid grid-cols-2 gap-1.5">
          <div class="relative h-20 overflow-hidden rounded-xl border border-white/15" :style="{ background: item.night }">
            <span class="absolute bottom-1.5 left-2 text-[10px] font-semibold uppercase tracking-widest text-white/70">Ночь</span>
          </div>
          <div class="relative h-20 overflow-hidden rounded-xl border border-black/10" :style="{ background: item.day }">
            <span class="absolute bottom-1.5 left-2 text-[10px] font-semibold uppercase tracking-widest text-slate-900/60">День</span>
          </div>
        </div>
        <span class="flex items-center justify-between gap-2 px-3 py-3">
          <span class="font-semibold">{{ item.name }}</span>
          <span class="flex items-center gap-2">
            <span class="text-xs opacity-60">{{ item.tag }}</span>
            <svg v-if="item.id === themeId" viewBox="0 0 24 24" class="h-4 w-4" :style="{ color: item.accent }" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
        </span>
      </button>
    </div>
  </section>
</template>
