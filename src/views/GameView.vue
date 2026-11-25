<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../lib/api'
import { usePreferencesStore } from '../stores/preferences'
import ParticipantCard from '../components/ParticipantCard.vue'
import QuestionnaireForm from '../components/QuestionnaireForm.vue'

const route = useRoute()
const router = useRouter()
const preferences = usePreferencesStore()
const data = ref(null)
const invite = ref(null)
const notifications = ref([])
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
const actionError = ref('')
const loading = ref(true)
const busy = ref(false)
const newParticipant = ref('')
const bulkNames = ref('')
const pendingParticipants = computed(() => {
  if (!data.value) return []
  const paired = new Set(data.value.pairs.flatMap((pair) => [pair.from_id, pair.to_id]))
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
const questionCount = computed(() => data.value?.questions.length ?? 0)
const gameToken = computed(() => String(route.params.token ?? ''))
const gameLabel = computed(() =>
  gameToken.value && gameToken.value !== 'undefined' ? gameToken.value.slice(0, 8) : 'демо',
)
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

async function load(id) {
  loading.value = true
  error.value = ''
  data.value = null
  if (!id || id === 'undefined') {
    error.value = 'Игра не найдена'
    loading.value = false
    return
  }
  invite.value = null
  notifications.value = []
  answers.value = []
  organizers.value = []
  reminders.value = []
  pastGames.value = []
  try {
    data.value = await api.games.get(id)
    preferences.setTheme(data.value.game.theme_id)
    if (!data.value.canManage) {
      error.value = 'Управление игрой доступно только организатору'
      return
    }
    invite.value = await api.games.invite(id)
    notifications.value = await api.games.notifications(id)
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

function receiverFor(id) {
  const pair = data.value?.pairs.find((item) => item.from_id === id)
  return pair ? participantName(pair.to_id) : ''
}

function notificationText(item) {
  try {
    const payload = JSON.parse(item.payload)
    const detail = payload.wishlist || payload.address || payload.notes || 'карточка обновлена'
    return `${item.participant_name ?? 'Участник'}: ${detail}`
  } catch {
    return `${item.participant_name ?? 'Участник'}: карточка обновлена`
  }
}

async function runAction(action) {
  busy.value = true
  actionError.value = ''
  try {
    await action()
    await load(route.params.token)
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
  return runAction(() => api.games.addParticipant(route.params.token, { name }))
}

function addParticipants() {
  const names = bulkNames.value.trim()
  if (!names) return
  bulkNames.value = ''
  return runAction(() => api.games.addParticipants(route.params.token, { names }))
}

function updateParticipant(participantId, body) {
  return runAction(() => api.games.updateParticipant(route.params.token, participantId, body))
}

function removeParticipant(participant) {
  if (!window.confirm(`Удалить ${participant.name} и перестроить пары?`)) return
  return runAction(() => api.games.removeParticipant(route.params.token, participant.id))
}

function inviteOrganizer() {
  return runAction(async () => {
    const invite = await api.games.inviteOrganizer(route.params.token)
    lastOrganizerInvite.value = invite.url
    try {
      await navigator.clipboard.writeText(invite.url)
    } catch {
      actionError.value = 'Ссылка скопировать не удалось — скопируйте её вручную'
    }
    return invite
  })
}

function canRemoveOrganizer(organizer) {
  if (busy.value || organizers.value.length <= 1) return false
  return organizer.role !== 'owner' || Boolean(organizer.user_id)
}

function removeOrganizer(organizer) {
  const text = organizer.invited_token ? 'Отменить приглашение организатора?' : 'Удалить организатора?'
  if (!window.confirm(text)) return
  return runAction(() => api.games.removeOrganizer(route.params.token, organizer.id))
}

async function copyLink(value) {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    actionError.value = 'Не удалось скопировать ссылку'
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
  return runAction(() => api.games.addQuestion(route.params.token, body))
}

function deleteQuestion(questionId) {
  return runAction(() => api.games.deleteQuestion(route.params.token, questionId))
}

function addExclusion() {
  const fromId = Number(exclusionFrom.value)
  const toId = Number(exclusionTo.value)
  if (!fromId || !toId || fromId === toId) {
    actionError.value = 'Выберите двух разных участников'
    return
  }
  exclusionFrom.value = ''
  exclusionTo.value = ''
  return runAction(() => api.games.addExclusion(route.params.token, { fromId, toId }))
}

function removeExclusion(fromId, toId) {
  return runAction(() => api.games.removeExclusion(route.params.token, fromId, toId))
}

function setPair() {
  const fromId = Number(manualFrom.value)
  const toId = Number(manualTo.value)
  if (!fromId || !toId || fromId === toId) {
    actionError.value = 'Выберите двух разных участников'
    return
  }
  manualFrom.value = ''
  manualTo.value = ''
  return runAction(() => api.games.setPair(route.params.token, { fromId, toId }))
}

function resetPairs() {
  return runAction(() => api.games.resetPairs(route.params.token))
}

function draw() {
  return runAction(() => api.games.draw(route.params.token))
}

function drawNew() {
  return runAction(() => api.games.drawNew(route.params.token))
}

function reveal(pair) {
  if (!window.confirm('Да, раскрыть эту пару?')) return
  return runAction(() => api.games.reveal(route.params.token, pair.from_id))
}

function importPastPairs() {
  if (!pastGameId.value) return
  return runAction(async () => {
    await api.games.importPastPairs(route.params.token, Number(pastGameId.value))
    pastGameId.value = ''
  })
}

function markGift(kind) {
  const participantId = Number(giftParticipant.value)
  if (!participantId) return
  giftParticipant.value = ''
  return runAction(() => api.games.markGift(route.params.token, participantId, kind))
}

function sendReminder() {
  const body = reminderBody.value.trim()
  const recipientIds = reminderRecipients.value.map(Number)
  if (!body || !recipientIds.length) return
  return runAction(async () => {
    await api.games.addReminder(route.params.token, { body, recipientIds })
    reminderBody.value = ''
    reminderRecipients.value = []
  })
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
      <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">
        Игра · {{ gameLabel }}<span v-if="data?.game.format"> · {{ data.game.format }}</span>
      </p>
      <h1 class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{{ data?.game.title ?? 'Загрузка игры' }}</h1>
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

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
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
        <p v-if="actionError" role="alert" class="mt-3 text-sm text-rose-300">{{ actionError }}</p>
      </div>

      <div v-if="invite" class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">Приглашения</h2>
        <div class="mt-3 grid gap-3 text-sm">
          <button
            type="button"
            class="truncate rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-left transition hover:bg-white/10"
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
          <p v-if="!invite.participants.length" class="opacity-50">
            Общая ссылка не является персональным приглашением. Добавьте участников, чтобы получить ссылки-приглашения
          </p>
        </div>
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
        <form class="mt-4 flex flex-wrap gap-2" @submit.prevent="markGift('sent')">
          <select
            v-model="giftParticipant"
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
        </form>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
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
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">Анкета организатора</h2>
        <p class="mt-1 text-sm opacity-60">До 10 вопросов; ответы видны Санте и организатору</p>
        <form class="mt-4 grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto_auto]" @submit.prevent="addQuestion">
          <input
            v-model="questionTitle"
            type="text"
            maxlength="120"
            placeholder="Название вопроса"
            class="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
          />
          <input
            v-model="questionHint"
            type="text"
            maxlength="200"
            placeholder="Подсказка или варианты через запятую"
            class="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
          />
          <select
            v-model="questionType"
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
        </form>
        <ul class="mt-3 grid gap-1 text-sm opacity-70">
          <li v-for="question in data.questions" :key="question.id" class="flex items-center justify-between gap-3">
            <span>{{ question.title }} · {{ question.type }}</span>
            <button
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
        <div class="mt-4 grid gap-2 text-sm">
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

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">Прошлые игры</h2>
        <p class="mt-1 text-sm opacity-60">
          Импортированные пары исключаются автоматически; имена прошлых получателей не раскрываются
        </p>
        <p class="mt-2 text-sm">Импортировано пар: {{ data.pastPairsCount }}</p>
        <form class="mt-3 flex flex-wrap gap-2" @submit.prevent="importPastPairs">
          <select
            v-model="pastGameId"
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
        <p v-if="!pastGames.length" class="mt-2 text-sm opacity-50">
          Войдите и поучаствуйте в игре, чтобы увидеть здесь прошлые игры
        </p>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
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
            class="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-white/40"
          >
            <option value="" disabled>Кто не дарит</option>
            <option v-for="person in data.participants" :key="person.id" :value="person.id">{{ person.name }}</option>
          </select>
          <select
            v-model="exclusionTo"
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
            class="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-white/40"
          >
            <option value="" disabled>Кто дарит</option>
            <option v-for="person in data.participants" :key="person.id" :value="person.id">{{ person.name }}</option>
          </select>
          <select
            v-model="manualTo"
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
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 class="font-bold">Участники</h2>
          <div class="mt-3 grid gap-2">
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
            <p v-if="!data.participants.length" class="text-sm opacity-50">Пока никто не присоединился</p>
          </div>
        </div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
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
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
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
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 class="font-bold">Уведомления об изменениях карточек</h2>
          <ol class="mt-3 grid gap-2 text-sm opacity-70">
            <li v-for="item in notifications" :key="item.id">{{ item.created_at }} · {{ notificationText(item) }}</li>
            <li v-if="!notifications.length" class="opacity-50">Карточки ещё не менялись</li>
          </ol>
        </div>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">Массовые напоминания</h2>
        <p class="mt-1 text-sm opacity-60">До 1000 символов, статусы доставки и защита от повторов</p>
        <form class="mt-4 grid gap-2" @submit.prevent="sendReminder">
          <textarea
            v-model="reminderBody"
            maxlength="1000"
            rows="3"
            placeholder="Текст напоминания"
            class="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
          ></textarea>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <select
              v-model="reminderRecipients"
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
      </div>
    </div>
  </section>
</template>
