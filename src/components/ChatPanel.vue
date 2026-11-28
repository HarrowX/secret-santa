<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
  contacts: {
    type: Array,
    default: () => [],
  },
  initialToId: {
    type: [String, Number],
    default: null,
  },
  accent: String,
})

const messages = ref([])
const body = ref('')
const imageUrl = ref('')
const busy = ref(false)
const loading = ref(false)
const error = ref('')
const selectedToId = ref(null)
const activeTab = ref('receiver')
let timer = null

function normalizedContacts() {
  if (props.contacts.length) {
    return props.contacts.filter((contact) => contact.id && contact.revealed !== false)
  }
  if (props.initialToId) {
    return [
      {
        id: props.initialToId,
        name: 'Собеседник',
        direction: 'receiver',
      },
    ]
  }
  return []
}

const tabs = computed(() => {
  const contacts = normalizedContacts()
  return [
    { key: 'receiver', label: 'Получателю', contacts: contacts.filter((item) => item.direction !== 'santa') },
    { key: 'santa', label: 'От Санты', contacts: contacts.filter((item) => item.direction === 'santa') },
  ].filter((tab) => tab.contacts.length)
})

const selectedContact = computed(() =>
  normalizedContacts().find((item) => String(item.id) === String(selectedToId.value)),
)

function chooseTab(tab) {
  activeTab.value = tab.key
  selectedToId.value = tab.contacts[0].id
}

watch(
  () => [props.gameToken, props.inviteToken, props.contacts, props.initialToId],
  () => {
    const available = tabs.value
    if (!available.length) {
      selectedToId.value = null
      return
    }
    const current = available.find((tab) => tab.key === activeTab.value) ?? available[0]
    activeTab.value = current.key
    const stillAvailable = available.some((tab) =>
      tab.contacts.some((contact) => String(contact.id) === String(selectedToId.value)),
    )
    if (!stillAvailable) selectedToId.value = current.contacts[0].id
  },
  { immediate: true, deep: true },
)

function stopPolling() {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}

async function loadMessages() {
  const toId = selectedToId.value
  if (!toId || loading.value) return
  loading.value = true
  try {
    const loaded = await api.games.chat(props.gameToken, toId, props.inviteToken, props.gameToken)
    if (String(selectedToId.value) === String(toId)) messages.value = loaded
  } catch (requestError) {
    if (String(selectedToId.value) === String(toId)) error.value = requestError.message
  } finally {
    loading.value = false
  }
}

watch(
  selectedToId,
  () => {
    error.value = ''
    messages.value = []
    stopPolling()
    if (selectedToId.value) {
      loadMessages()
      timer = window.setInterval(() => {
        if (document.visibilityState !== 'hidden') loadMessages()
      }, 5000)
    }
  },
  { immediate: true },
)

onBeforeUnmount(stopPolling)

async function send() {
  const toId = selectedToId.value
  if (!toId || (!body.value.trim() && !imageUrl.value.trim())) return
  busy.value = true
  error.value = ''
  try {
    await api.games.sendChat(
      props.gameToken,
      { toId, body: body.value, imageUrl: imageUrl.value || null },
      props.inviteToken,
      props.gameToken,
    )
    body.value = ''
    imageUrl.value = ''
    await loadMessages()
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
    <p class="mt-1 text-xs opacity-60">Сообщения видны только вам и выбранному собеседнику.</p>

    <p v-if="!tabs.length" class="mt-3 text-sm opacity-60">
      Чаты появятся после раскрытия пары. До раскрытия собеседник неизвестен.
    </p>

    <template v-else>
      <div class="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Выбор собеседника">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.key"
          class="rounded-full border px-3 py-1 text-xs transition"
          :class="activeTab === tab.key ? 'border-transparent' : 'border-white/20 opacity-70'"
          :style="activeTab === tab.key ? { background: accent, color: '#0b1120' } : {}"
          @click="chooseTab(tab)"
        >
          {{ tab.label }}
        </button>
      </div>

      <label v-if="selectedContact" class="mt-2 block text-xs opacity-70">
        <span>Собеседник</span>
        <select
          v-model="selectedToId"
          class="mt-1 w-full rounded-xl border border-white/15 px-3 py-2 text-sm text-current outline-none"
          aria-label="Собеседник"
        >
          <option
            v-for="contact in tabs.find((tab) => tab.key === activeTab)?.contacts"
            :key="contact.id"
            :value="contact.id"
          >
            {{ contact.name }}
          </option>
        </select>
      </label>

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
          <div v-if="message.imageUrl" class="mt-2 grid gap-1 text-xs">
            <a
              :href="message.imageUrl"
              target="_blank"
              rel="noopener noreferrer"
              referrerpolicy="no-referrer"
              class="underline"
              :aria-label="`Открыть внешнюю ссылку: ${message.imageUrl}`"
            >
              Открыть изображение (внешняя ссылка)
            </a>
            <span class="opacity-60">Ссылка внешняя — картинка загружается только по вашему действию.</span>
          </div>
          <p class="mt-1 text-[10px] opacity-50">{{ message.mine ? 'Вы' : 'Собеседник' }}</p>
        </div>
      </div>

      <form class="mt-3 grid gap-2" @submit.prevent="send">
        <label class="grid gap-1 text-sm">
          <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Текст сообщения</span>
          <textarea
            v-model="body"
            rows="2"
            maxlength="1000"
            placeholder="Привет! Спасибо за подарок."
            aria-label="Текст сообщения"
            class="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
          ></textarea>
        </label>
        <label class="grid gap-1 text-sm">
          <span class="text-xs font-semibold uppercase tracking-widest opacity-60">
            Ссылка на изображение (необязательно)
          </span>
          <input
            v-model="imageUrl"
            type="url"
            maxlength="500"
            placeholder="https://example.com/gift.jpg"
            aria-label="Ссылка на изображение (необязательно)"
            class="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
          />
        </label>
        <p v-if="error" role="alert" class="text-xs text-rose-300">{{ error }}</p>
        <button
          type="submit"
          class="justify-self-end rounded-full px-4 py-2 text-xs font-bold transition hover:opacity-80 disabled:opacity-50"
          :style="{ background: accent, color: '#0b1120' }"
          :disabled="busy || !selectedToId || (!body.trim() && !imageUrl.trim())"
        >
          {{ busy ? 'Отправляем…' : 'Отправить' }}
        </button>
      </form>
    </template>
  </div>
</template>
