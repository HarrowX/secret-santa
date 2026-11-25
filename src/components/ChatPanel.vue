<script setup>
import { ref, watch } from 'vue'
import { api } from '../lib/api'

const props = defineProps({
  gameToken: {
    type: String,
    required: true,
  },
  inviteToken: {
    type: String,
    required: true,
  },
  accent: String,
})

const messages = ref([])
const body = ref('')
const imageUrl = ref('')
const busy = ref(false)
const error = ref('')

watch(
  () => [props.gameToken, props.inviteToken],
  async () => {
    error.value = ''
    try {
      messages.value = await api.games.chat(props.gameToken, props.inviteToken)
    } catch (requestError) {
      error.value = requestError.message
    }
  },
  { immediate: true },
)

async function send() {
  if (!body.value.trim() && !imageUrl.value.trim()) return
  busy.value = true
  error.value = ''
  try {
    await api.games.sendChat(props.gameToken, { body: body.value, imageUrl: imageUrl.value || null }, props.inviteToken)
    body.value = ''
    imageUrl.value = ''
    messages.value = await api.games.chat(props.gameToken, props.inviteToken)
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
    <h3 class="text-sm font-bold">Анонимный чат</h3>
    <p class="mt-1 text-xs opacity-60">Сообщения видны только вам и вашему Санте/получателю.</p>

    <div class="mt-3 grid max-h-64 gap-2 overflow-y-auto">
      <p v-if="!messages.length" class="text-xs opacity-50">Сообщений пока нет.</p>
      <div
        v-for="message in messages"
        :key="message.id"
        class="max-w-[85%] rounded-xl px-3 py-2 text-sm"
        :class="message.mine ? 'ml-auto' : 'mr-auto'"
        :style="message.mine ? { background: accent, color: '#0b1120' } : { background: 'rgba(255,255,255,0.08)' }"
      >
        <p v-if="message.body" class="whitespace-pre-wrap break-words">{{ message.body }}</p>
        <a v-if="message.imageUrl" :href="message.imageUrl" target="_blank" rel="noopener" class="underline">
          Изображение
        </a>
        <p class="mt-1 text-[10px] opacity-50">{{ message.mine ? 'Вы' : 'Собеседник' }}</p>
      </div>
    </div>

    <form class="mt-3 grid gap-2" @submit.prevent="send">
      <textarea
        v-model="body"
        rows="2"
        maxlength="1000"
        placeholder="Написать анонимно"
        class="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
      ></textarea>
      <input
        v-model="imageUrl"
        type="url"
        maxlength="500"
        placeholder="Ссылка на изображение (необязательно)"
        class="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
      />
      <p v-if="error" role="alert" class="text-xs text-rose-300">{{ error }}</p>
      <button
        type="submit"
        class="justify-self-end rounded-full px-4 py-2 text-xs font-bold transition hover:opacity-80 disabled:opacity-50"
        :style="{ background: accent, color: '#0b1120' }"
        :disabled="busy || (!body.trim() && !imageUrl.trim())"
      >
        {{ busy ? 'Отправляем…' : 'Отправить' }}
      </button>
    </form>
  </div>
</template>
