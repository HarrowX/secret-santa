<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ensureSession } from '../lib/api'
import { usePreferencesStore } from '../stores/preferences'

const router = useRouter()
const preferences = usePreferencesStore()
const games = ref([])
const exchanges = ref([])
const error = ref('')
const loading = ref(true)

async function load() {
  loading.value = true
  error.value = ''
  try {
    await ensureSession()
    ;[games.value, exchanges.value] = await Promise.all([api.me.games(), api.me.exchanges()])
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
}

load()
</script>

<template>
  <section class="mx-auto max-w-5xl px-5 py-12">
    <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Личный кабинет</p>
    <h1 class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Мои игры и обмены</h1>

    <p v-if="loading" class="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm opacity-70">Загружаем кабинет…</p>
    <p v-else-if="error" role="alert" class="mt-8 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm text-rose-200">{{ error }}</p>

    <div v-else class="mt-8 grid gap-4">
      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">Игры</h2>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            v-for="game in games"
            :key="game.id"
            type="button"
            class="rounded-xl border border-white/15 bg-white/5 p-4 text-left transition hover:bg-white/10"
            @click="router.push(`/game/${game.token}`)"
          >
            <span class="block font-semibold">{{ game.title }}</span>
            <span class="mt-1 block text-xs opacity-60">{{ game.budget || 'без бюджета' }} · {{ game.exchange_date || 'дата не задана' }}</span>
          </button>
          <p v-if="!games.length" class="text-sm opacity-50">Пока нет игр. Создайте первую на демо-странице.</p>
        </div>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">Мой обмен</h2>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div v-for="exchange in exchanges" :key="exchange.game_id" class="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
            <p class="text-xs uppercase tracking-widest opacity-50">{{ exchange.title }}</p>
            <p class="mt-2 font-bold" :style="{ color: preferences.theme.accent }">Вы дарите: {{ exchange.receiver_name }}</p>
            <p v-if="!exchange.revealed_at" class="mt-2 text-xs opacity-60">Карточка откроется после того, как организатор раскроет пару</p>
            <template v-else>
              <p v-if="exchange.wishlist" class="mt-2 opacity-80">Желания: {{ exchange.wishlist }}</p>
              <p v-if="exchange.address" class="mt-1 opacity-80">Адрес: {{ exchange.address }}</p>
              <p v-if="exchange.notes" class="mt-1 opacity-80">Заметки: {{ exchange.notes }}</p>
            </template>
          </div>
          <p v-if="!exchanges.length" class="text-sm opacity-50">Пары появятся после жеребьёвки.</p>
        </div>
      </div>
    </div>
  </section>
</template>
