<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../lib/api'
import { domain } from '../config'
import { themes } from '../data/themes'
import { presets } from '../content/presets'
import { usePreferencesStore } from '../stores/preferences'
import ParticipantCard from '../components/ParticipantCard.vue'
import QuestionnaireForm from '../components/QuestionnaireForm.vue'
import NotificationsPanel from '../components/NotificationsPanel.vue'

const route = useRoute()
const router = useRouter()
const preferences = usePreferencesStore()
const data = ref(null)
const invite = ref(null)
const answers = ref([])
const organizers = ref([])
const reminders = ref([])
const pastGames = ref([])
const pastGameId = ref('')
const reminderBody = ref('')
const reminderRecipients = ref([])
const giftParticipant = ref('')
const historyKind = ref('all')
const historyParticipant = ref('')
const historyPeriod = ref('all')
const lastOrganizerInvite = ref('')
const error = ref('')
const errors = ref({})
const loading = ref(true)
const busy = ref(false)
const newParticipant = ref('')
const bulkNames = ref('')
const settings = ref({
  title: '',
  rules: '',
  budget: '',
  exchangeDate: '',
  format: '',
  themeId: 'winter',
})
const tenantSlug = ref('')
const tenantUrl = ref('')
const pendingParticipants = computed(() => {
  if (!data.value) return []
  const paired = new Set((data.value.pairs ?? []).flatMap((pair) => [pair.from_id, pair.to_id]))
  return data.value.participants.filter((person) => !paired.has(person.id))
})
const exclusionFrom = ref('')
const exclusionTo = ref('')
const manualFrom = ref('')
const manualTo = ref('')
const questionTitle = ref('')
const questionHint = ref('')
const questionType = ref('text')
const questionRequired = ref(false)
const questionCount = computed(() => data.value?.questions?.length ?? 0)
const gameToken = computed(() => String(route.params.token ?? ''))
const gameLabel = computed(() => (gameToken.value ? gameToken.value.slice(0, 8) : '—'))
const selfName = ref('')
const selfInviteToken = ref('')
const selfJoinError = ref('')
const filteredEvents = computed(() => {
  const events = data.value?.events ?? []
  return events.filter((item) => {
    if (historyKind.value !== 'all' && item.kind !== historyKind.value) return false
    if (historyParticipant.value) {
      const name = participantName(Number(historyParticipant.value))
      if (!item.text.includes(name)) return false
    }
    if (historyPeriod.value !== 'all') {
      const days = Number(historyPeriod.value)
      const created = new Date(String(item.created_at).replace(' ', 'T'))
      if (Date.now() - created.getTime() > days * 24 * 60 * 60 * 1000) return false
    }
    return true
  })
})

function syncSettings(game) {
  settings.value = {
    title: game.title ?? '',
    rules: game.rules ?? '',
    budget: game.budget ?? '',
    exchangeDate: game.exchange_date ?? '',
    format: game.format ?? '',
    themeId: game.theme_id ?? 'winter',
  }
}

async function load(id) {
  loading.value = true
  error.value = ''
  errors.value = {}
  data.value = null
  if (!id || id === 'undefined') {
    error.value = 'Игра не найдена'
    loading.value = false
    return
  }
  invite.value = null
  answers.value = []
  organizers.value = []
  reminders.value = []
  pastGames.value = []
  tenantUrl.value = ''
  selfName.value = ''
  selfJoinError.value = ''
  selfInviteToken.value = localStorage.getItem(inviteStorageKey(id)) ?? ''
  try {
    data.value = await api.games.get(id, String(id))
    preferences.setTheme(data.value.game.theme_id)
    syncSettings(data.value.game)
    if (!data.value.canManage) return
    invite.value = await api.games.invite(id)
    answers.value = await api.games.answers(id)
    organizers.value = await api.games.organizers(id)
    reminders.value = await api.games.reminders(id)
    try {
      pastGames.value = await api.me.pastGames()
    } catch {
      pastGames.value = []
    }
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
}

watch(() => route.params.token, load, { immediate: true })

function participantName(id) {
  return data.value?.participants.find((person) => person.id === id)?.name ?? 'Участник'
}

const questionTypeLabels = {
  text: 'Текст',
  number: 'Число',
  boolean: 'Да/Нет',
  single: 'Один выбор',
  multi: 'Несколько',
}

function questionTypeLabel(type) {
  return questionTypeLabels[type] ?? type ?? 'Текст'
}

function inviteStorageKey(id) {
  return `santa-invite:${String(id)}`
}

function openMyCard() {
  router.push(`/join/${selfInviteToken.value}`)
}

async function selfJoin() {
  const name = selfName.value.trim()
  if (!name) return
  busy.value = true
  selfJoinError.value = ''
  try {
    const joined = await api.games.join(route.params.token, { name })
    localStorage.setItem(inviteStorageKey(route.params.token), joined.inviteToken)
    selfInviteToken.value = joined.inviteToken
    router.push(`/join/${joined.inviteToken}`)
  } catch (requestError) {
    selfJoinError.value = requestError.message
  } finally {
    busy.value = false
  }
}

function receiverFor(id) {
  const pair = data.value?.pairs.find((item) => item.from_id === id)
  return pair ? participantName(pair.to_id) : ''
}

async function runAction(key, action) {
  busy.value = true
  errors.value = { ...errors.value, [key]: '' }
  try {
    await action()
    await load(route.params.token)
  } catch (requestError) {
    errors.value = { ...errors.value, [key]: requestError.message }
  } finally {
    busy.value = false
  }
}

function setError(key, message) {
  errors.value = { ...errors.value, [key]: message }
}

function addParticipant() {
  const name = newParticipant.value.trim()
  if (!name) return
  newParticipant.value = ''
  return runAction('participant', () => api.games.addParticipant(route.params.token, { name }))
}

function addParticipants() {
  const names = bulkNames.value.trim()
  if (!names) return
  bulkNames.value = ''
  return runAction('bulk', () => api.games.addParticipants(route.params.token, { names }))
}

function updateParticipant(participantId, body) {
  return runAction('participant-card', () => api.games.updateParticipant(route.params.token, participantId, body))
}

function removeParticipant(participant) {
  if (!window.confirm(`Удалить ${participant.name} и перестроить пары?`)) return
  return runAction('participant-card', () => api.games.removeParticipant(route.params.token, participant.id))
}

function inviteOrganizer() {
  return runAction('organizer', async () => {
    const link = await api.games.inviteOrganizer(route.params.token)
    lastOrganizerInvite.value = link.url
    try {
      await navigator.clipboard.writeText(link.url)
    } catch {
      setError('organizer', 'Ссылка скопировать не удалось — скопируйте её вручную')
    }
    return link
  })
}

function canRemoveOrganizer(organizer) {
  if (busy.value || organizers.value.length <= 1) return false
  return organizer.role !== 'owner' || Boolean(organizer.user_id)
}

function removeOrganizer(organizer) {
  const text = organizer.invited_token ? 'Отменить приглашение организатора?' : 'Удалить организатора?'
  if (!window.confirm(text)) return
  return runAction('organizer', () => api.games.removeOrganizer(route.params.token, organizer.id))
}

async function copyLink(value, key = 'copy') {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    setError(key, 'Не удалось скопировать ссылку')
  }
}

function addQuestion() {
  const title = questionTitle.value.trim()
  if (!title || questionCount.value >= 10) return
  const body = {
    title,
    hint: questionHint.value.trim(),
    type: questionType.value,
    required: questionRequired.value,
    position: questionCount.value,
  }
  questionTitle.value = ''
  questionHint.value = ''
  questionType.value = 'text'
  questionRequired.value = false
  return runAction('question', () => api.games.addQuestion(route.params.token, body))
}

function deleteQuestion(questionId) {
  return runAction('question', () => api.games.deleteQuestion(route.params.token, questionId))
}

function addExclusion() {
  const fromId = Number(exclusionFrom.value)
  const toId = Number(exclusionTo.value)
  if (!fromId || !toId || fromId === toId) {
    setError('exclusion', 'Выберите двух разных участников')
    return
  }
  exclusionFrom.value = ''
  exclusionTo.value = ''
  return runAction('exclusion', () => api.games.addExclusion(route.params.token, { fromId, toId }))
}

function removeExclusion(fromId, toId) {
  return runAction('exclusion', () => api.games.removeExclusion(route.params.token, fromId, toId))
}

function setPair() {
  const fromId = Number(manualFrom.value)
  const toId = Number(manualTo.value)
  if (!fromId || !toId || fromId === toId) {
    setError('pair', 'Выберите двух разных участников')
    return
  }
  manualFrom.value = ''
  manualTo.value = ''
  return runAction('pair', () => api.games.setPair(route.params.token, { fromId, toId }))
}

function resetPairs() {
  return runAction('pairs', () => api.games.resetPairs(route.params.token))
}

function draw() {
  return runAction('pairs', () => api.games.draw(route.params.token))
}

function drawNew() {
  return runAction('pairs', () => api.games.drawNew(route.params.token))
}

function reveal(pair) {
  if (!window.confirm('Да, раскрыть эту пару?')) return
  return runAction('pairs', () => api.games.reveal(route.params.token, pair.from_id))
}

function importPastPairs() {
  if (!pastGameId.value) return
  return runAction('past', async () => {
    await api.games.importPastPairs(route.params.token, Number(pastGameId.value))
    pastGameId.value = ''
  })
}

function markGift(kind) {
  const participantId = Number(giftParticipant.value)
  if (!participantId) return
  giftParticipant.value = ''
  return runAction('gift', () => api.games.markGift(route.params.token, participantId, kind))
}

function sendReminder() {
  const body = reminderBody.value.trim()
  const recipientIds = reminderRecipients.value.map(Number)
  if (!body || !recipientIds.length) return
  return runAction('reminder', async () => {
    await api.games.addReminder(route.params.token, { body, recipientIds })
    reminderBody.value = ''
    reminderRecipients.value = []
  })
}

function saveSettings() {
  const title = settings.value.title.trim()
  if (!title) {
    setError('settings', 'Укажите название игры')
    return
  }
  return runAction('settings', () =>
    api.games.update(
      route.params.token,
      {
        title,
        rules: settings.value.rules,
        budget: settings.value.budget,
        exchangeDate: settings.value.exchangeDate,
        format: settings.value.format,
        themeId: settings.value.themeId,
      },
      String(route.params.token),
    ),
  )
}

function saveTenant() {
  const slug = tenantSlug.value.trim()
  if (!slug) {
    setError('tenant', 'Укажите адрес игры')
    return
  }
  return runAction('tenant', async () => {
    const tenant = await api.tenants.create({ slug, gameId: data.value.game.id }, String(route.params.token))
    tenantUrl.value = tenant.url ?? `${window.location.protocol}//${slug}.${domain}`
  })
}
</script>

<template>
  <section class="mx-auto max-w-5xl px-5 py-12">
    <button
      type="button"
      class="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10"
      @click="router.push('/my')"
    >
      ← К моим играм
    </button>

    <div class="mt-8">
      <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">
        Игра · {{ gameLabel }}<span v-if="data?.game.format"> · {{ data.game.format }}</span>
      </p>
      <h1 class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{{ data?.game.title ?? 'Загрузка игры' }}</h1>
    </div>

    <div v-if="data?.game.rules" class="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 class="font-bold">Правила игры</h2>
      <p class="mt-2 whitespace-pre-wrap text-sm opacity-75">{{ data.game.rules }}</p>
    </div>

    <div v-if="data && !data.canManage" class="mt-4 rounded-2xl border border-white/15 bg-white/5 p-5 text-sm">
      <p class="font-semibold">{{ selfInviteToken ? 'Вы уже в игре' : 'Присоединиться к игре' }}</p>
      <p v-if="selfInviteToken" class="mt-1 opacity-60">
        Откройте карточку, чтобы подтвердить участие и ответить на вопросы анкеты. Организатор сможет удалить участника
        с неверным или обидным именем.
      </p>
      <p v-else class="mt-1 opacity-60">
        Укажите имя, под которым вас увидят участники, затем подтвердите участие и ответьте на вопросы анкеты.
        Организатор сможет удалить участника с неверным или обидным именем.
      </p>
      <div v-if="selfInviteToken" class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-xl px-4 py-2 text-sm font-bold"
          :style="{ background: preferences.theme.accent, color: '#0b1120' }"
          @click="openMyCard"
        >
          Открыть мою карточку
        </button>
      </div>
      <form v-else class="mt-4 flex flex-wrap gap-2" @submit.prevent="selfJoin">
        <input
          v-model="selfName"
          type="text"
          maxlength="80"
          required
          placeholder="Как вас зовут"
          aria-label="Ваше имя"
          class="min-w-48 flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
        />
        <button
          type="submit"
          class="rounded-xl px-4 py-2 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
          :style="{ background: preferences.theme.accent, color: '#0b1120' }"
          :disabled="busy || !selfName.trim()"
        >
          Присоединиться
        </button>
      </form>
      <p v-if="selfJoinError" role="alert" class="mt-2 text-rose-300">{{ selfJoinError }}</p>
    </div>

    <p v-if="loading" class="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm opacity-70">
      Загружаем данные игры…
    </p>
    <p
      v-else-if="error"
      role="alert"
      class="mt-8 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm text-rose-200"
    >
      {{ error }}
    </p>

    <div v-else-if="data" class="mt-8 grid gap-4">
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p class="text-xs uppercase tracking-widest opacity-50">Участников</p>
          <p class="mt-1 text-2xl font-black" :style="{ color: preferences.theme.accent }">
            {{ data.participants.length }}
          </p>
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

      <div v-if="data.canManage" class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="font-bold">Организатор</h2>
            <p class="mt-1 text-sm opacity-60">Добавьте участников и распределите пары</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-if="pendingParticipants.length > 1"
              type="button"
              class="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
              :disabled="busy"
              @click="drawNew"
            >
              Доп. жеребьёвка: {{ pendingParticipants.length }}
            </button>
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
        </div>
        <form class="mt-4 flex flex-wrap gap-2" @submit.prevent="addParticipant">
          <input
            v-model="newParticipant"
            type="text"
            maxlength="80"
            placeholder="Имя участника"
            aria-label="Имя участника"
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
        <form class="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]" @submit.prevent="addParticipants">
          <input
            v-model="bulkNames"
            type="text"
            maxlength="1000"
            placeholder="Аня, Борис, Вика — через запятую"
            aria-label="Список имён через запятую"
            class="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
          />
          <button
            type="submit"
            class="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
            :disabled="busy || !bulkNames.trim()"
          >
            Добавить список
          </button>
        </form>
        <p v-if="errors.pairs" role="alert" class="mt-3 text-sm text-rose-300">{{ errors.pairs }}</p>
        <p v-if="errors.participant" role="alert" class="mt-2 text-sm text-rose-300">{{ errors.participant }}</p>
        <p v-if="errors.bulk" role="alert" class="mt-2 text-sm text-rose-300">{{ errors.bulk }}</p>
      </div>

      <div v-if="invite" class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">Приглашения</h2>
        <div class="mt-3 grid gap-3 text-sm">
          <button
            type="button"
            class="truncate rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-left transition hover:bg-white/10"
            :aria-label="`Общая ссылка на игру: ${invite.commonUrl}`"
            @click="copyLink(invite.commonUrl)"
          >
            <span class="opacity-50">Общая ссылка на игру: </span>{{ invite.commonUrl }}
          </button>
          <p v-if="invite.participants.length" class="opacity-50">Персональные ссылки-приглашения:</p>
          <div v-for="person in invite.participants" :key="person.id" class="flex flex-wrap items-center gap-2">
            <span class="min-w-24 font-semibold">{{ person.name }}</span>
            <button
              type="button"
              class="min-w-0 flex-1 truncate rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-left transition hover:bg-white/10"
              :aria-label="`Ссылка-приглашение для ${person.name}`"
              @click="copyLink(person.url)"
            >
              {{ person.url }}
            </button>
            <span class="text-xs opacity-50">{{ person.filled ? 'подтвердил' : 'ожидаем' }}</span>
          </div>
          <p class="opacity-50">Общую ссылку можно отправить всем: каждый участник сам укажет имя и заполнит анкету.</p>
        </div>
      </div>

      <div v-if="data.canManage" class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">Настройки игры</h2>
        <p class="mt-1 text-sm opacity-60">Изменения сохраняются сразу и видны участникам</p>
        <form class="mt-4 grid gap-3 sm:grid-cols-2" @submit.prevent="saveSettings">
          <label class="grid gap-1 text-sm">
            <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Название</span>
            <input
              v-model="settings.title"
              type="text"
              required
              maxlength="120"
              aria-label="Название игры"
              class="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
            />
          </label>
          <label class="grid gap-1 text-sm">
            <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Бюджет</span>
            <input
              v-model="settings.budget"
              type="text"
              maxlength="80"
              aria-label="Бюджет подарка"
              class="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
            />
          </label>
          <label class="grid gap-1 text-sm">
            <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Дата обмена</span>
            <input
              v-model="settings.exchangeDate"
              type="date"
              aria-label="Дата обмена"
              class="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
            />
          </label>
          <label class="grid gap-1 text-sm">
            <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Формат</span>
            <select
              v-model="settings.format"
              aria-label="Формат игры"
              class="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-white/40"
            >
              <option value="">Без формата</option>
              <option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.label }}</option>
            </select>
          </label>
          <label class="grid gap-1 text-sm">
            <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Тема</span>
            <select
              v-model="settings.themeId"
              aria-label="Тема оформления"
              class="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-white/40"
            >
              <option v-for="theme in themes" :key="theme.id" :value="theme.id">{{ theme.name }}</option>
            </select>
          </label>
          <label class="grid gap-1 text-sm sm:col-span-2">
            <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Правила</span>
            <textarea
              v-model="settings.rules"
              rows="3"
              maxlength="2000"
              aria-label="Правила игры"
              class="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
            ></textarea>
          </label>
          <p v-if="errors.settings" role="alert" class="text-sm text-rose-300 sm:col-span-2">{{ errors.settings }}</p>
          <button
            type="submit"
            class="justify-self-start rounded-full px-5 py-2 text-sm font-bold transition hover:opacity-80 disabled:opacity-50 sm:col-span-2"
            :style="{ background: preferences.theme.accent, color: '#0b1120' }"
            :disabled="busy"
          >
            Сохранить настройки
          </button>
        </form>

        <form class="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]" @submit.prevent="saveTenant">
          <label class="grid gap-1 text-sm">
            <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Адрес игры на поддомене</span>
            <input
              v-model="tenantSlug"
              type="text"
              minlength="3"
              maxlength="32"
              pattern="[a-z0-9-]+"
              placeholder="moia-igra"
              aria-label="Адрес игры на поддомене"
              class="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
            />
          </label>
          <button
            type="submit"
            class="self-end rounded-full border border-white/20 px-5 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
            :disabled="busy || !tenantSlug.trim()"
          >
            Сохранить адрес
          </button>
          <p v-if="errors.tenant" role="alert" class="text-sm text-rose-300">{{ errors.tenant }}</p>
        </form>
        <a
          v-if="tenantUrl"
          :href="tenantUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-2 block truncate text-sm underline"
        >
          {{ tenantUrl }}
        </a>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">Прогресс игры</h2>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div
            v-for="item in [
              { label: 'Присоединились', value: data.progress.joined },
              { label: 'Заполнили карточку', value: data.progress.filled },
              { label: 'Узнали подопечного', value: data.progress.learned },
              { label: 'Отправили подарок', value: data.progress.sent },
              { label: 'Получили подарок', value: data.progress.received },
            ]"
            :key="item.label"
            class="rounded-xl border border-white/10 bg-white/5 p-3"
          >
            <div class="flex items-center justify-between gap-2 text-xs opacity-70">
              <span>{{ item.label }}</span>
              <span class="font-bold">{{ item.value }}%</span>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                class="h-full rounded-full"
                :style="{ width: `${item.value}%`, background: preferences.theme.accent }"
              ></div>
            </div>
          </div>
        </div>
        <form v-if="data.canManage" class="mt-4 flex flex-wrap gap-2" @submit.prevent="markGift('sent')">
          <select
            v-model="giftParticipant"
            aria-label="Участник, отметки о подарке"
            class="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none"
          >
            <option value="" disabled>Выберите участника</option>
            <option v-for="person in data.participants" :key="person.id" :value="person.id">{{ person.name }}</option>
          </select>
          <button
            type="submit"
            class="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
            :disabled="busy || !giftParticipant"
          >
            Подарок отправлен
          </button>
          <button
            type="button"
            class="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
            :disabled="busy || !giftParticipant"
            @click="markGift('received')"
          >
            Подарок получен
          </button>
          <p v-if="errors.gift" role="alert" class="text-sm text-rose-300">{{ errors.gift }}</p>
        </form>
      </div>

      <div v-if="data.canManage" class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-bold">Команда организаторов</h2>
            <p class="mt-1 text-sm opacity-60">Максимум три организатора, включая создателя</p>
          </div>
          <button
            type="button"
            class="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
            :disabled="busy || organizers.length >= 3"
            @click="inviteOrganizer"
          >
            Пригласить помощника
          </button>
        </div>
        <button
          v-if="lastOrganizerInvite"
          type="button"
          class="mt-3 w-full truncate rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-left text-sm transition hover:bg-white/10"
          @click="copyLink(lastOrganizerInvite)"
        >
          {{ lastOrganizerInvite }}
        </button>
        <ul class="mt-3 grid gap-2 text-sm">
          <li
            v-for="organizer in organizers"
            :key="organizer.id"
            class="grid gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span>
                {{
                  organizer.user_email ??
                  (organizer.role === 'owner' ? 'Создатель (вход не выполнен)' : 'Приглашение ещё не принято')
                }}
              </span>
              <span class="flex items-center gap-3 text-xs opacity-60">
                <span>{{
                  organizer.invited_token ? 'приглашён' : organizer.role === 'owner' ? 'создатель' : 'организатор'
                }}</span>
                <button
                  type="button"
                  class="underline transition hover:opacity-100 disabled:opacity-50"
                  :disabled="!canRemoveOrganizer(organizer)"
                  @click="removeOrganizer(organizer)"
                >
                  {{ organizer.invited_token ? 'Отменить' : 'Удалить' }}
                </button>
              </span>
            </div>
            <button
              v-if="organizer.url"
              type="button"
              class="truncate text-left text-xs opacity-60 underline transition hover:opacity-100"
              @click="copyLink(organizer.url)"
            >
              {{ organizer.url }}
            </button>
          </li>
          <li v-if="!organizers.length" class="opacity-50">Организаторов пока нет</li>
        </ul>
        <p v-if="errors.organizer" role="alert" class="mt-2 text-sm text-rose-300">{{ errors.organizer }}</p>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">Вопросы анкеты</h2>
        <p class="mt-1 text-sm opacity-60">Ответы видны Санте после раскрытия пары</p>
        <form
          v-if="data.canManage"
          class="mt-4 grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto_auto]"
          @submit.prevent="addQuestion"
        >
          <input
            v-model="questionTitle"
            type="text"
            maxlength="120"
            placeholder="Название вопроса"
            aria-label="Название вопроса"
            class="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
          />
          <input
            v-model="questionHint"
            type="text"
            maxlength="200"
            placeholder="Подсказка или варианты через запятую"
            aria-label="Подсказка или варианты через запятую"
            class="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
          />
          <select
            v-model="questionType"
            aria-label="Тип вопроса"
            class="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-white/40"
          >
            <option value="text">Текст</option>
            <option value="number">Число</option>
            <option value="boolean">Да/Нет</option>
            <option value="single">Один выбор</option>
            <option value="multi">Несколько</option>
          </select>
          <label class="flex items-center gap-2 text-xs opacity-70">
            <input v-model="questionRequired" type="checkbox" class="h-4 w-4" />
            Обязательно
          </label>
          <button
            type="submit"
            class="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
            :disabled="busy || !questionTitle.trim() || questionCount >= 10"
          >
            Добавить вопрос
          </button>
          <p v-if="errors.question" role="alert" class="text-sm text-rose-300 sm:col-span-5">{{ errors.question }}</p>
        </form>
        <ul class="mt-3 grid gap-1 text-sm opacity-70">
          <li v-for="question in data.questions" :key="question.id" class="flex items-center justify-between gap-3">
            <span>{{ question.title }} · {{ questionTypeLabel(question.type) }}</span>
            <button
              v-if="data.canManage"
              type="button"
              class="text-xs underline opacity-70 transition hover:opacity-100 disabled:opacity-50"
              :disabled="busy"
              @click="deleteQuestion(question.id)"
            >
              Удалить
            </button>
          </li>
          <li v-if="!data.questions.length" class="opacity-50">Вопросов пока нет</li>
        </ul>
        <div v-if="data.canManage" class="mt-4 grid gap-2 text-sm">
          <p class="font-semibold">Ответы</p>
          <details
            v-for="person in data.participants"
            :key="person.id"
            class="rounded-xl border border-white/10 bg-white/5 p-3"
          >
            <summary class="cursor-pointer font-semibold">
              {{ person.name }} — {{ answers.filter((item) => item.participant_id === person.id).length }} ответов
            </summary>
            <div class="mt-3">
              <QuestionnaireForm
                :questions="data.questions"
                :answers="
                  answers
                    .filter((item) => item.participant_id === person.id)
                    .map(({ question_id, value }) => ({ question_id, value }))
                "
                :accent="preferences.theme.accent"
                :editable="false"
              />
            </div>
          </details>
          <p v-if="!data.participants.length" class="opacity-50">Добавьте участников, чтобы увидеть ответы</p>
        </div>
      </div>

      <div v-if="data.canManage" class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">Прошлые игры</h2>
        <p class="mt-1 text-sm opacity-60">
          Импортированные пары исключаются автоматически; имена прошлых получателей не раскрываются
        </p>
        <p class="mt-2 text-sm">Импортировано пар: {{ data.pastPairsCount }}</p>
        <form class="mt-3 flex flex-wrap gap-2" @submit.prevent="importPastPairs">
          <select
            v-model="pastGameId"
            aria-label="Прошлая игра для импорта пар"
            class="min-w-48 flex-1 rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none"
          >
            <option value="" disabled>Выберите прошлую игру</option>
            <option v-for="game in pastGames" :key="game.id" :value="game.id">
              {{ game.title }} · {{ game.exchange_date || 'без даты' }}
            </option>
          </select>
          <button
            type="submit"
            class="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
            :disabled="busy || !pastGameId"
          >
            Импортировать пары
          </button>
        </form>
        <p v-if="errors.past" role="alert" class="mt-2 text-sm text-rose-300">{{ errors.past }}</p>
        <p v-if="!pastGames.length" class="mt-2 text-sm opacity-50">
          Войдите и поучаствуйте в игре, чтобы увидеть здесь прошлые игры
        </p>
      </div>

      <div v-if="data.canManage" class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-bold">Исключения и ручные пары</h2>
            <p class="mt-1 text-sm opacity-60">Ограничения сохраняются при повторной жеребьёвке</p>
          </div>
          <button
            type="button"
            class="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
            :disabled="busy || !data.pairs.length"
            @click="resetPairs"
          >
            Сбросить пары
          </button>
        </div>

        <form class="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" @submit.prevent="addExclusion">
          <select
            v-model="exclusionFrom"
            aria-label="Кто не дарит"
            class="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-white/40"
          >
            <option value="" disabled>Кто не дарит</option>
            <option v-for="person in data.participants" :key="person.id" :value="person.id">{{ person.name }}</option>
          </select>
          <select
            v-model="exclusionTo"
            aria-label="Кому не дарит"
            class="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-white/40"
          >
            <option value="" disabled>Кому не дарит</option>
            <option v-for="person in data.participants" :key="person.id" :value="person.id">{{ person.name }}</option>
          </select>
          <button
            type="submit"
            class="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
            :disabled="busy || !exclusionFrom || !exclusionTo"
          >
            Исключить
          </button>
        </form>
        <ul class="mt-3 grid gap-1 text-sm opacity-70">
          <li
            v-for="item in data.exclusions"
            :key="`${item.from_id}-${item.to_id}`"
            class="flex items-center justify-between gap-3"
          >
            <span>{{ participantName(item.from_id) }} не дарит {{ participantName(item.to_id) }}</span>
            <button
              type="button"
              class="text-xs underline opacity-70 transition hover:opacity-100 disabled:opacity-50"
              :disabled="busy"
              @click="removeExclusion(item.from_id, item.to_id)"
            >
              Убрать
            </button>
          </li>
          <li v-if="!data.exclusions.length" class="opacity-50">Исключений пока нет</li>
        </ul>

        <form class="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" @submit.prevent="setPair">
          <select
            v-model="manualFrom"
            aria-label="Кто дарит в ручной паре"
            class="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-white/40"
          >
            <option value="" disabled>Кто дарит</option>
            <option v-for="person in data.participants" :key="person.id" :value="person.id">{{ person.name }}</option>
          </select>
          <select
            v-model="manualTo"
            aria-label="Кому дарит в ручной паре"
            class="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-white/40"
          >
            <option value="" disabled>Кому дарит</option>
            <option v-for="person in data.participants" :key="person.id" :value="person.id">{{ person.name }}</option>
          </select>
          <button
            type="submit"
            class="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
            :disabled="busy || !manualFrom || !manualTo"
          >
            Зафиксировать
          </button>
        </form>
        <p v-if="errors.exclusion" role="alert" class="mt-2 text-sm text-rose-300">{{ errors.exclusion }}</p>
        <p v-if="errors.pair" role="alert" class="mt-2 text-sm text-rose-300">{{ errors.pair }}</p>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 class="font-bold">Участники</h2>
          <div class="mt-3 grid gap-2">
            <template v-if="data.canManage">
              <ParticipantCard
                v-for="person in data.participants"
                :key="person.id"
                :person="person"
                :accent="preferences.theme.accent"
                :busy="busy"
                :receiver-name="receiverFor(person.id)"
                @save="updateParticipant(person.id, $event)"
                @remove="removeParticipant(person)"
              />
            </template>
            <ul v-else class="grid gap-1 text-sm">
              <li v-for="person in data.participants" :key="person.id">{{ person.name }}</li>
            </ul>
            <p v-if="!data.participants.length" class="text-sm opacity-50">Пока никто не присоединился</p>
            <p v-if="errors['participant-card']" role="alert" class="text-sm text-rose-300">
              {{ errors['participant-card'] }}
            </p>
          </div>
        </div>
        <div v-if="data.canManage" class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-bold">Пары</h2>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-full border border-white/20 px-3 py-1 text-xs transition hover:bg-white/10 disabled:opacity-50"
                :disabled="busy || data.participants.length < 2"
                @click="draw"
              >
                Перемешать заново
              </button>
              <button
                type="button"
                class="rounded-full border border-white/20 px-3 py-1 text-xs transition hover:bg-white/10 disabled:opacity-50"
                :disabled="busy || !data.pairs.length"
                @click="resetPairs"
              >
                Очистить пары
              </button>
            </div>
          </div>
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
          <p v-if="errors.pairs" role="alert" class="mt-2 text-sm text-rose-300">{{ errors.pairs }}</p>
        </div>
        <div v-else class="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm opacity-70">
          <h2 class="font-bold">Пары</h2>
          <p class="mt-2">Пары станут известны в персональной ссылке-приглашении после раскрытия.</p>
        </div>
      </div>

      <div v-if="data.canManage" class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 class="font-bold">История</h2>
          <div class="mt-3 grid gap-2 sm:grid-cols-3">
            <select
              v-model="historyKind"
              class="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none"
            >
              <option value="all">Все события</option>
              <option value="join">Участники</option>
              <option value="settings">Настройки</option>
              <option value="draw">Жеребьёвка</option>
              <option value="message">Сообщения</option>
            </select>
            <select
              v-model="historyParticipant"
              class="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none"
            >
              <option value="">Все участники</option>
              <option v-for="person in data.participants" :key="person.id" :value="person.id">{{ person.name }}</option>
            </select>
            <select
              v-model="historyPeriod"
              class="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none"
            >
              <option value="all">Всё время</option>
              <option value="1">За сутки</option>
              <option value="7">За 7 дней</option>
            </select>
          </div>
          <ol class="mt-3 grid gap-2 text-sm opacity-70">
            <li v-for="item in filteredEvents" :key="item.id">
              {{ item.created_at }} · {{ item.text }}
              <span v-if="item.actor" class="opacity-60">— {{ item.actor }}</span>
            </li>
            <li v-if="!filteredEvents.length" class="opacity-50">Событий по фильтру нет</li>
          </ol>
        </div>
        <NotificationsPanel
          :game-id="gameToken"
          :game-token="gameToken"
          title="Уведомления об изменениях"
          :show-names="true"
        />
      </div>

      <div v-if="data.canManage" class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">Массовые напоминания</h2>
        <p class="mt-1 text-sm opacity-60">До 1000 символов, статусы доставки и защита от повторов</p>
        <form class="mt-4 grid gap-2" @submit.prevent="sendReminder">
          <textarea
            v-model="reminderBody"
            maxlength="1000"
            rows="3"
            placeholder="Текст напоминания"
            aria-label="Текст напоминания"
            class="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
          ></textarea>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <select
              v-model="reminderRecipients"
              aria-label="Получатели напоминания"
              multiple
              class="min-w-48 flex-1 rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none"
            >
              <option v-for="person in data.participants" :key="person.id" :value="person.id">{{ person.name }}</option>
            </select>
            <span class="text-xs opacity-60">{{ reminderBody.length }}/1000</span>
            <button
              type="submit"
              class="rounded-full px-5 py-2 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
              :style="{ background: preferences.theme.accent, color: '#0b1120' }"
              :disabled="busy || !reminderBody.trim() || !reminderRecipients.length"
            >
              Отправить
            </button>
          </div>
        </form>
        <ul class="mt-3 grid gap-1 text-sm opacity-70">
          <li v-for="item in reminders" :key="item.id">
            {{ item.created_at }} · {{ item.participant_name }} · {{ item.status }}
            <span v-if="item.error" class="text-amber-300">— {{ item.error }}</span>
          </li>
          <li v-if="!reminders.length" class="opacity-50">Напоминаний пока нет</li>
        </ul>
        <p v-if="errors.reminder" role="alert" class="mt-2 text-sm text-rose-300">{{ errors.reminder }}</p>
      </div>
    </div>
  </section>
</template>
