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
      </div>

      <div class="inline-flex rounded-full border border-white/20 bg-white/10 p-1 text-sm">
        <button
          type="button"
          class="rounded-full px-4 py-1.5 font-semibold transition"
          :class="mode === 'night' ? activeClass : idleClass"
          @click="emit('update:mode', 'night')"
        >
          Ночь
        </button>
        <button
          type="button"
          class="rounded-full px-4 py-1.5 font-semibold transition"
          :class="mode === 'day' ? activeClass : idleClass"
          @click="emit('update:mode', 'day')"
        >
          День
        </button>
      </div>
    </div>

    <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="theme in themes"
        :key="theme.id"
        type="button"
        class="group overflow-hidden rounded-2xl border p-1.5 text-left transition duration-300"
        :class="theme.id === themeId ? 'border-white/70 bg-white/10' : 'border-white/10 hover:border-white/40 hover:bg-white/5'"
        @click="emit('update:themeId', theme.id)"
      >
        <span class="block h-24 rounded-xl" :style="{ background: theme.night }"></span>
        <span class="flex items-center justify-between gap-2 px-3 py-3">
          <span class="font-semibold">{{ theme.name }}</span>
          <span class="text-xs opacity-60">{{ theme.tag }}</span>
        </span>
      </button>
    </div>
  </section>
</template>
