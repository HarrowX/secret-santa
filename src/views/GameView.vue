<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../lib/api'
import { usePreferencesStore } from '../stores/preferences'

const route = useRoute()
const router = useRouter()
const preferences = usePreferencesStore()
const data = ref(null)
const error = ref('')
const loading = ref(true)

watch(
  () => route.params.id,
  async (id) => {
    loading.value = true
    error.value = ''
    data.value = null
    try {
      data.value = await api.games.get(id)
    } catch (requestError) {
      error.value = requestError.message
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

function participantName(id) {
  return data.value?.participants.find((person) => person.id === id)?.name ?? 'Участник'
}
</script>

<template>
  <section class="mx-auto max-w-5xl px-5 py-12">
    <button
      type="button"
      class="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10"
      @click="router.push('/demo')"
    >
      ← К демо
    </button>

    <div class="mt-8">
      <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Игра #{{ route.params.id }}</p>
      <h1 class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{{ data?.game.title ?? 'Загрузка игры' }}</h1>
    </div>

    <p v-if="loading" class="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm opacity-70">Загружаем данные игры…</p>
    <p v-else-if="error" role="alert" class="mt-8 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm text-rose-200">{{ error }}</p>

    <div v-else-if="data" class="mt-8 grid gap-4">
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p class="text-xs uppercase tracking-widest opacity-50">Участников</p>
          <p class="mt-1 text-2xl font-black" :style="{ color: preferences.theme.accent }">{{ data.participants.length }}</p>
        </div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p class="text-xs uppercase tracking-widest opacity-50">Бюджет</p>
          <p class="mt-1 text-lg font-bold">{{ data.game.budget || 'Не задан' }}</p>
        </div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p class="text-xs uppercase tracking-widest opacity-50">Дата обмена</p>
          <p class="mt-1 text-lg font-bold">{{ data.game.exchange_date || 'Не задана' }}</p>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 class="font-bold">Участники</h2>
          <ul class="mt-3 grid gap-2 text-sm opacity-80">
            <li v-for="person in data.participants" :key="person.id">• {{ person.name }}</li>
          </ul>
        </div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 class="font-bold">Пары</h2>
          <ol class="mt-3 grid gap-2 text-sm opacity-80">
            <li v-for="pair in data.pairs" :key="pair.id">
              {{ participantName(pair.from_id) }} → {{ participantName(pair.to_id) }}
              <span v-if="pair.manual" class="opacity-50">(вручную)</span>
            </li>
            <li v-if="!data.pairs.length" class="opacity-50">Пары ещё не распределены</li>
          </ol>
        </div>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">История</h2>
        <ol class="mt-3 grid gap-2 text-sm opacity-70">
          <li v-for="item in data.events" :key="item.id">{{ item.created_at }} · {{ item.text }}</li>
          <li v-if="!data.events.length" class="opacity-50">Событий пока нет</li>
        </ol>
      </div>
    </div>
  </section>
</template>
