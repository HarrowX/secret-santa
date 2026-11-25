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
        <p class="mt-2 text-sm opacity-60">{{ themes.length }} оформлений · каждое бесплатно</p>
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

    <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="item in themes"
        :key="item.id"
        type="button"
        class="group overflow-hidden rounded-3xl border p-2 text-left transition duration-300 hover:-translate-y-0.5"
        :class="item.id === themeId
          ? 'border-transparent'
          : mode === 'day'
            ? 'border-slate-900/10 hover:border-slate-900/25'
            : 'border-white/10 hover:border-white/30'"
        :style="item.id === themeId ? { boxShadow: `0 0 0 2px ${item.accent}, 0 18px 40px -24px ${item.glow}` } : {}"
        :aria-pressed="item.id === themeId"
        @click="emit('update:themeId', item.id)"
      >
        <div class="relative h-28 overflow-hidden rounded-2xl" :style="{ background: mode === 'day' ? item.day : item.night }">
          <div
            class="absolute inset-0"
            :style="{ background: mode === 'day' ? 'linear-gradient(to top, rgb(255 255 255 / 0.3), transparent)' : 'linear-gradient(to top, rgb(2 6 23 / 0.45), transparent 60%)' }"
          ></div>
          <span
            class="absolute left-3 top-3 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest backdrop-blur"
            :class="mode === 'day' ? 'bg-white/60 text-slate-800' : 'bg-slate-950/35 text-white/80'"
          >
            {{ item.tag }}
          </span>
          <span v-if="item.id === themeId" class="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-slate-950 shadow-sm">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
        </div>
        <div class="flex items-center justify-between gap-2 px-3 py-3">
          <span class="font-semibold">{{ item.name }}</span>
          <span class="text-[11px] opacity-50 transition group-hover:opacity-80">
            {{ item.id === themeId ? 'Выбрано' : 'Выбрать' }}
          </span>
        </div>
      </button>
    </div>
  </section>
</template>
