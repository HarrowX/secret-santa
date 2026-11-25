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
const actionError = ref('')
const loading = ref(true)
const busy = ref(false)
const newParticipant = ref('')

async function load(id) {
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
}

watch(() => route.params.id, load, { immediate: true })

function participantName(id) {
  return data.value?.participants.find((person) => person.id === id)?.name ?? 'Участник'
}

async function runAction(action) {
  busy.value = true
  actionError.value = ''
  try {
    await action()
    await load(route.params.id)
  } catch (requestError) {
    actionError.value = requestError.message
  } finally {
    busy.value = false
  }
}

function addParticipant() {
  const name = newParticipant.value.trim()
  if (!name) return
  newParticipant.value = ''
  return runAction(() => api.games.addParticipant(route.params.id, { name }))
}

function draw() {
  return runAction(() => api.games.draw(route.params.id))
}

function reveal(pair) {
  return runAction(() => api.games.reveal(route.params.id, pair.from_id))
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

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="font-bold">Организатор</h2>
            <p class="mt-1 text-sm opacity-60">Добавьте участников и распределите пары</p>
          </div>
          <button
            type="button"
            class="rounded-full px-5 py-2 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
            :style="{ background: preferences.theme.accent, color: '#0b1120' }"
            :disabled="busy || data.participants.length < 2"
            @click="draw"
          >
            Провести жеребьёвку
          </button>
        </div>
        <form class="mt-4 flex flex-wrap gap-2" @submit.prevent="addParticipant">
          <input
            v-model="newParticipant"
            type="text"
            maxlength="80"
            placeholder="Имя участника"
            class="min-w-48 flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
          />
          <button
            type="submit"
            class="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
            :disabled="busy || !newParticipant.trim()"
          >
            Добавить
          </button>
        </form>
        <p v-if="actionError" role="alert" class="mt-3 text-sm text-rose-300">{{ actionError }}</p>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 class="font-bold">Участники</h2>
          <ul class="mt-3 grid gap-2 text-sm opacity-80">
            <li v-for="person in data.participants" :key="person.id">• {{ person.name }}</li>
            <li v-if="!data.participants.length" class="opacity-50">Пока никто не присоединился</li>
          </ul>
        </div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 class="font-bold">Пары</h2>
          <ol class="mt-3 grid gap-2 text-sm opacity-80">
            <li v-for="pair in data.pairs" :key="pair.id" class="flex flex-wrap items-center gap-2">
              <span>{{ participantName(pair.from_id) }} → {{ participantName(pair.to_id) }}</span>
              <span v-if="pair.manual" class="opacity-50">(вручную)</span>
              <button
                v-if="!pair.revealed_at"
                type="button"
                class="rounded-full border border-white/20 px-2 py-0.5 text-xs transition hover:bg-white/10 disabled:opacity-50"
                :disabled="busy"
                @click="reveal(pair)"
              >
                Показать пару
              </button>
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
