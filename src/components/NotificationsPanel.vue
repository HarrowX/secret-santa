<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api } from '../lib/api'

const props = defineProps({
  gameId: {
    type: [String, Number],
    required: true,
  },
  inviteToken: {
    type: String,
    default: '',
  },
  gameToken: {
    type: String,
    default: '',
  },
  showNames: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: 'Уведомления',
  },
  pollMs: {
    type: Number,
    default: 15000,
  },
})

const items = ref([])
const error = ref('')
const loading = ref(false)
let timer = null

function kindText(kind) {
  if (kind === 'card_updated') return 'Карточка участника обновлена'
  if (kind === 'draw_changed') return 'Распределение пар изменилось'
  if (kind === 'pair_revealed') return 'Пара раскрыта — доступен «мой обмен»'
  if (kind === 'chat_message') return 'Новое сообщение в чате'
  return 'Изменение в игре'
}

function timeText(item) {
  const raw = item.created_at || item.sent_at
  if (!raw) return ''
  const date = new Date(String(raw).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return String(raw)
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

async function refresh() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    items.value = await api.games.notifications(props.gameId, props.inviteToken, props.gameToken)
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
}

function startPolling() {
  stopPolling()
  timer = window.setInterval(refresh, props.pollMs)
}

function stopPolling() {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}

onMounted(() => {
  refresh()
  startPolling()
})

onBeforeUnmount(stopPolling)

watch([() => props.gameId, () => props.inviteToken], () => {
  refresh()
  startPolling()
})

defineExpose({ refresh })
</script>

<template>
  <section class="rounded-2xl border border-white/10 bg-white/5 p-5" :aria-label="title">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="font-bold">{{ title }}</h2>
      <button
        type="button"
        class="rounded-full border border-white/20 px-3 py-1 text-xs transition hover:bg-white/10 disabled:opacity-50"
        :disabled="loading"
        @click="refresh"
      >
        Обновить уведомления
      </button>
    </div>
    <p class="mt-1 text-xs opacity-60">Обновляется автоматически каждые 15 секунд</p>
    <p v-if="error" role="alert" class="mt-3 text-sm text-rose-300">{{ error }}</p>
    <ol class="mt-3 grid gap-2 text-sm opacity-70">
      <li v-for="item in items" :key="item.id" class="flex flex-wrap items-center gap-x-2">
        <span>{{ kindText(item.kind) }}</span>
        <span v-if="showNames && item.participant_name" class="opacity-60">· {{ item.participant_name }}</span>
        <time v-if="timeText(item)" class="text-xs opacity-50">{{ timeText(item) }}</time>
      </li>
      <li v-if="!items.length && !error" class="opacity-50">Уведомлений пока нет</li>
    </ol>
  </section>
</template>
