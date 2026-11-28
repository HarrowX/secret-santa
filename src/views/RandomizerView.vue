<script setup>
import { ref } from 'vue'
import { api } from '../lib/api'
import { usePreferencesStore } from '../stores/preferences'

const preferences = usePreferencesStore()
const names = ref('')
const pairs = ref([])
const error = ref('')
const copyStatus = ref('')
const busy = ref(false)

async function draw() {
  busy.value = true
  error.value = ''
  copyStatus.value = ''
  pairs.value = []
  try {
    pairs.value = await api.randomizer.draw(names.value)
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    busy.value = false
  }
}

async function copyResult() {
  const text = pairs.value.map((pair) => `${pair.from} → ${pair.to}`).join('\n')
  try {
    await navigator.clipboard.writeText(text)
    copyStatus.value = 'Скопировано'
  } catch {
    copyStatus.value = 'Не удалось скопировать результат'
  }
}
</script>

<template>
  <section class="mx-auto max-w-3xl px-5 py-12">
    <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Без регистрации</p>
    <h1 class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Быстрая жеребьёвка</h1>
    <p class="mt-2 text-sm opacity-60">До 100 имён через запятую или с новой строки</p>

    <div class="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
      <form class="grid gap-3" @submit.prevent="draw">
        <textarea
          v-model="names"
          rows="8"
          maxlength="5000"
          placeholder="Аня, Борис, Вика"
          class="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
        ></textarea>
        <button
          type="submit"
          class="rounded-full px-5 py-2.5 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
          :style="{ background: preferences.theme.accent, color: '#0b1120' }"
          :disabled="busy || !names.trim()"
        >
          {{ busy ? 'Распределяем…' : 'Перемешать' }}
        </button>
      </form>
      <p v-if="error" role="alert" class="mt-3 text-sm text-rose-300">{{ error }}</p>

      <div v-if="pairs.length" class="mt-5">
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-bold">Пары</h2>
          <button
            type="button"
            class="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold transition hover:bg-white/10"
            @click="copyResult"
          >
            Скопировать
          </button>
        </div>
        <p
          v-if="copyStatus"
          role="status"
          aria-live="polite"
          class="mt-2 text-xs"
          :class="copyStatus === 'Скопировано' ? 'text-emerald-300' : 'text-rose-300'"
        >
          {{ copyStatus }}
        </p>
        <ol class="mt-3 grid gap-2 text-sm">
          <li
            v-for="(pair, index) in pairs"
            :key="index"
            class="rounded-xl border border-white/10 bg-white/5 px-4 py-2"
          >
            {{ pair.from }} → {{ pair.to }}
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>
