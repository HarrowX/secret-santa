<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ensureSession } from '../lib/api'
import { usePreferencesStore } from '../stores/preferences'
import ChatPanel from '../components/ChatPanel.vue'
import QuestionnaireForm from '../components/QuestionnaireForm.vue'

const router = useRouter()
const preferences = usePreferencesStore()
const games = ref([])
const exchanges = ref([])
const questionsByGame = ref({})
const recipientByGame = ref({})
const user = ref(null)
const email = ref('')
const password = ref('')
const error = ref('')
const authError = ref('')
const loading = ref(true)
const authBusy = ref(false)

function normalizeAnswers(data) {
  const rows = Array.isArray(data) ? data : data?.answers
  if (!Array.isArray(rows)) return []
  return rows.map((item) => ({
    question_id: item.question_id ?? item.questionId,
    value: item.value ?? '',
  }))
}

function recipientCard(exchange) {
  const data = recipientByGame.value[exchange.game_id]
  return data?.participant ?? data?.card ?? null
}

function recipientAnswers(exchange) {
  return normalizeAnswers(recipientByGame.value[exchange.game_id])
}

async function loadRecipientData() {
  const revealed = exchanges.value.filter((item) => item.revealed_at && item.invite_token)
  await Promise.all(
    revealed.map(async (exchange) => {
      try {
        const [questions, recipient] = await Promise.all([
          api.games.questions(exchange.game_id, exchange.invite_token, exchange.game_token),
          api.games.recipientAnswers(exchange.game_id, exchange.invite_token, exchange.game_token),
        ])
        questionsByGame.value[exchange.game_id] = questions
        recipientByGame.value[exchange.game_id] = recipient
      } catch {
        questionsByGame.value[exchange.game_id] = []
        recipientByGame.value[exchange.game_id] = null
      }
    }),
  )
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    await ensureSession()
    const session = await api.auth.session()
    user.value = session.user
    email.value = session.user?.email ?? email.value
    ;[games.value, exchanges.value] = await Promise.all([api.me.games(), api.me.exchanges()])
    questionsByGame.value = {}
    recipientByGame.value = {}
    await loadRecipientData()
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
}

async function register() {
  authBusy.value = true
  authError.value = ''
  try {
    await api.auth.register({ email: email.value, password: password.value })
    password.value = ''
    await load()
  } catch (requestError) {
    authError.value = requestError.message
  } finally {
    authBusy.value = false
  }
}

async function login() {
  authBusy.value = true
  authError.value = ''
  try {
    await api.auth.login({ email: email.value, password: password.value })
    password.value = ''
    await load()
  } catch (requestError) {
    authError.value = requestError.message
  } finally {
    authBusy.value = false
  }
}

async function logout() {
  await api.auth.logout()
  await load()
}

async function copyLink(value) {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    error.value = 'Не удалось скопировать ссылку'
  }
}

function roleLabel(role) {
  if (role === 'owner') return 'создатель'
  if (role === 'organizer') return 'организатор'
  return 'участник'
}

function chatContacts(exchange) {
  if (!exchange.revealed_at) return []
  const contacts = []
  if (exchange.receiver_id) {
    contacts.push({
      id: exchange.receiver_id,
      name: exchange.receiver_name ?? 'Получатель',
      direction: 'receiver',
    })
  }
  const santaId = exchange.sender_id ?? exchange.giver_id ?? exchange.from_id
  if (santaId) contacts.push({ id: santaId, name: 'Санта', direction: 'santa' })
  return contacts
}

load()
</script>

<template>
  <section class="mx-auto max-w-5xl px-5 py-12">
    <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Личный кабинет</p>
    <h1 class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Мои игры и обмены</h1>

    <div class="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-bold">Профиль</h2>
          <p class="mt-1 text-sm opacity-60">
            {{ user?.email ? `Вы вошли как ${user.email}` : 'Анонимный доступ: игры привязаны к этому браузеру' }}
          </p>
        </div>
        <button
          v-if="user?.email"
          type="button"
          class="rounded-full border border-white/20 px-4 py-2 text-sm transition hover:bg-white/10"
          @click="logout"
        >
          Выйти
        </button>
      </div>
      <form v-if="!user?.email" class="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr_auto_auto]" @submit.prevent="register">
        <input
          v-model="email"
          type="email"
          required
          maxlength="160"
          placeholder="Email"
          aria-label="Email"
          class="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm outline-none focus:border-white/40"
        />
        <input
          v-model="password"
          type="password"
          required
          minlength="6"
          maxlength="200"
          placeholder="Пароль от 6 символов"
          aria-label="Пароль"
          class="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm outline-none focus:border-white/40"
        />
        <button
          type="submit"
          class="rounded-xl px-4 py-2 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
          :style="{ background: preferences.theme.accent, color: '#0b1120' }"
          :disabled="authBusy"
        >
          Зарегистрироваться
        </button>
        <button
          type="button"
          class="rounded-xl border border-white/20 px-4 py-2 text-sm transition hover:bg-white/10 disabled:opacity-50"
          :disabled="authBusy || !email || !password"
          @click="login"
        >
          Войти
        </button>
      </form>
      <p v-if="authError" role="alert" class="mt-2 text-sm text-rose-300">{{ authError }}</p>
    </div>

    <p v-if="loading" class="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm opacity-70">
      Загружаем кабинет…
    </p>
    <p
      v-else-if="error"
      role="alert"
      class="mt-8 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm text-rose-200"
    >
      {{ error }}
    </p>

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
            <span class="flex items-center justify-between gap-2">
              <span class="font-semibold">{{ game.title }}</span>
              <span class="text-xs opacity-60">{{ roleLabel(game.role) }}</span>
            </span>
            <span class="mt-1 block text-xs opacity-60"
              >{{ game.budget || 'без бюджета' }} · {{ game.exchange_date || 'дата не задана' }}</span
            >
            <span
              v-if="game.token"
              role="button"
              tabindex="0"
              class="mt-2 block truncate text-xs opacity-50 underline"
              :aria-label="`Скопировать ссылку на игру ${game.title}`"
              @click.stop="copyLink(`/game/${game.token}`)"
              @keydown.enter.stop="copyLink(`/game/${game.token}`)"
            >
              /game/{{ game.token }}
            </span>
          </button>
          <p v-if="!games.length" class="text-sm opacity-50">Пока нет игр. Создайте первую на демо-странице.</p>
        </div>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">Мой обмен</h2>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div
            v-for="exchange in exchanges"
            :key="exchange.game_id"
            class="rounded-xl border border-white/10 bg-white/5 p-4 text-sm"
          >
            <p class="text-xs uppercase tracking-widest opacity-50">{{ exchange.title }}</p>
            <p v-if="!exchange.revealed_at" class="mt-2 font-bold" :style="{ color: preferences.theme.accent }">
              Получатель станет известен после раскрытия пары
            </p>
            <template v-else>
              <p class="mt-2 font-bold" :style="{ color: preferences.theme.accent }">
                Вы дарите: {{ exchange.receiver_name ?? 'Получатель' }}
              </p>
              <p v-if="exchange.wishlist" class="mt-2 opacity-80">Желания: {{ exchange.wishlist }}</p>
              <p v-if="exchange.address" class="mt-1 opacity-80">Адрес: {{ exchange.address }}</p>
              <p v-if="exchange.notes" class="mt-1 opacity-80">Заметки: {{ exchange.notes }}</p>
              <div v-if="recipientCard(exchange)" class="mt-3 grid gap-1 opacity-75">
                <p v-if="recipientCard(exchange).wishlist">Желания в анкете: {{ recipientCard(exchange).wishlist }}</p>
                <p v-if="recipientCard(exchange).address">Адрес в анкете: {{ recipientCard(exchange).address }}</p>
              </div>
              <div v-if="recipientAnswers(exchange).length" class="mt-3">
                <p class="text-xs font-semibold uppercase tracking-widest opacity-60">Анкета получателя</p>
                <div class="mt-2">
                  <QuestionnaireForm
                    :questions="questionsByGame[exchange.game_id] ?? []"
                    :answers="recipientAnswers(exchange)"
                    :accent="preferences.theme.accent"
                    :editable="false"
                  />
                </div>
              </div>
              <ChatPanel
                v-if="exchange.invite_token"
                :game-token="exchange.game_token"
                :invite-token="exchange.invite_token"
                :contacts="chatContacts(exchange)"
                :initial-to-id="exchange.receiver_id"
                :accent="preferences.theme.accent"
              />
            </template>
          </div>
          <p v-if="!exchanges.length" class="text-sm opacity-50">Пары появятся после жеребьёвки.</p>
        </div>
      </div>
    </div>
  </section>
</template>
