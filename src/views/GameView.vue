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

async function load(id) {
  loading.value = true
  error.value = ''
  data.value = null
  invite.value = null
  notifications.value = []
  answers.value = []
  try {
    data.value = await api.games.get(id)
    preferences.setTheme(data.value.game.theme_id)
    invite.value = await api.games.invite(id)
    notifications.value = await api.games.notifications(id)
    answers.value = await api.games.answers(id)
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
      <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Игра · {{ route.params.token.slice(0, 8) }}</p>
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
            <span class="opacity-50">Общая ссылка: </span>{{ invite.commonUrl }}
          </button>
          <div v-for="person in invite.participants" :key="person.id" class="flex flex-wrap items-center gap-2">
            <span class="min-w-24 font-semibold">{{ person.name }}</span>
            <button
              type="button"
              class="min-w-0 flex-1 truncate rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-left transition hover:bg-white/10"
              @click="copyLink(person.url)"
            >
              {{ person.url }}
            </button>
            <span class="text-xs opacity-50">{{ person.filled ? 'подтвердил' : 'ожидаем' }}</span>
          </div>
          <p v-if="!invite.participants.length" class="opacity-50">Добавьте участников, чтобы получить персональные ссылки</p>
        </div>
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
                :answers="answers.filter((item) => item.participant_id === person.id).map(({ question_id, value }) => ({ question_id, value }))"
                :accent="preferences.theme.accent"
                :editable="false"
              />
            </div>
          </details>
          <p v-if="!data.participants.length" class="opacity-50">Добавьте участников, чтобы увидеть ответы</p>
        </div>
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
          <li v-for="item in data.exclusions" :key="`${item.from_id}-${item.to_id}`" class="flex items-center justify-between gap-3">
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
          <ol class="mt-3 grid gap-2 text-sm opacity-70">
            <li v-for="item in data.events" :key="item.id">{{ item.created_at }} · {{ item.text }}</li>
            <li v-if="!data.events.length" class="opacity-50">Событий пока нет</li>
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
    </div>
  </section>
</template>
