<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, ensureSession } from '../lib/api'
import { usePreferencesStore } from '../stores/preferences'
import QuestionnaireForm from '../components/QuestionnaireForm.vue'
import NotificationsPanel from '../components/NotificationsPanel.vue'
import ChatPanel from '../components/ChatPanel.vue'
import ThemeDecor from '../components/ThemeDecor.vue'

const route = useRoute()
const preferences = usePreferencesStore()

const invite = ref(null)
const email = ref('')
const wishlist = ref('')
const address = ref('')
const notes = ref('')
const preferred = ref('')
const pastIdentityToken = ref(localStorage.getItem('santa-past-identity-token') ?? '')
const questions = ref([])
const answers = ref([])
const myExchange = ref(null)
const recipientData = ref(null)
const chatContacts = ref([])
const revealed = ref(false)
const questionnaireBusy = ref(false)
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const cardError = ref('')
const questionnaireError = ref('')
const pastTokenError = ref('')

const game = computed(() => invite.value?.game ?? null)
const gameId = computed(() => game.value?.id ?? '')
const gameToken = computed(() => game.value?.token ?? myExchange.value?.game_token ?? '')
const recipientAnswers = computed(() => {
  const data = recipientData.value
  const rows = Array.isArray(data) ? data : data?.answers
  if (!Array.isArray(rows)) return []
  return rows.map((item) => ({
    question_id: item.question_id ?? item.questionId,
    value: item.value ?? '',
  }))
})
const recipientCard = computed(() => recipientData.value?.participant ?? recipientData.value?.card ?? null)

function applyInvite(response) {
  invite.value = response
  email.value = response.participant.email ?? ''
  wishlist.value = response.participant.wishlist ?? ''
  address.value = response.participant.address ?? ''
  notes.value = response.participant.notes ?? ''
  preferred.value = response.participant.preferred ?? ''
  preferences.setTheme(response.game.themeId ?? response.game.theme_id)
}

function uniqueContacts(contacts) {
  const seen = new Set()
  return contacts.filter((contact) => {
    const key = `${contact.direction}:${contact.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function loadParticipantData(response, token) {
  const selfId = response.participant.id
  const id = response.game.id

  try {
    const exchanges = await api.me.exchanges()
    myExchange.value =
      exchanges.find(
        (item) =>
          String(item.game_id) === String(id) || (response.game.token && item.game_token === response.game.token),
      ) ?? null
  } catch {
    myExchange.value = null
  }

  let myPair = null
  try {
    myPair = await api.games.myPair(id, token, gameToken.value)
  } catch {
    myPair = null
  }
  const revealedPair = myPair?.revealed_at ? myPair : null

  const contacts = []
  if (revealedPair) {
    if (String(revealedPair.from_id) === String(selfId) && revealedPair.to_id) {
      contacts.push({
        id: revealedPair.to_id,
        name: revealedPair.to_name ?? myExchange.value?.receiver_name ?? 'Получатель',
        direction: 'receiver',
      })
    }
    if (String(revealedPair.to_id) === String(selfId) && revealedPair.from_id) {
      contacts.push({ id: revealedPair.from_id, name: revealedPair.from_name ?? 'Санта', direction: 'santa' })
    }
  }
  if (myExchange.value?.revealed_at) {
    if (myExchange.value.receiver_id) {
      contacts.push({
        id: myExchange.value.receiver_id,
        name: myExchange.value.receiver_name ?? 'Получатель',
        direction: 'receiver',
      })
    }
    const santaId = myExchange.value.sender_id ?? myExchange.value.giver_id ?? myExchange.value.from_id
    if (santaId) contacts.push({ id: santaId, name: 'Санта', direction: 'santa' })
  }
  chatContacts.value = uniqueContacts(contacts)

  let revealedByNotification = false
  try {
    const notifications = await api.games.notifications(id, token, gameToken.value)
    revealedByNotification = notifications.some((item) => item.kind === 'pair_revealed')
  } catch {
    revealedByNotification = false
  }
  revealed.value = Boolean(myExchange.value?.revealed_at || revealedPair || revealedByNotification)

  recipientData.value = null
  if (revealed.value) {
    try {
      recipientData.value = await api.games.recipientAnswers(id, token, gameToken.value)
    } catch {
      recipientData.value = null
    }
  }
}

watch(
  () => route.params.token,
  async (token) => {
    loading.value = true
    error.value = ''
    cardError.value = ''
    questionnaireError.value = ''
    invite.value = null
    myExchange.value = null
    recipientData.value = null
    chatContacts.value = []
    revealed.value = false
    try {
      await ensureSession()
      const response = await api.invites.get(token)
      applyInvite(response)
      questions.value = await api.games.questions(response.game.id, token, response.game.token)
      answers.value = await api.games.participantAnswers(
        response.game.id,
        response.participant.id,
        token,
        response.game.token,
      )
      if (response.participant.filled) await loadParticipantData(response, token)
    } catch (requestError) {
      error.value = requestError.message
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

async function accept() {
  if (!invite.value) return
  cardError.value = ''
  submitting.value = true
  try {
    await ensureSession()
    const payload = {
      email: email.value || null,
      wishlist: wishlist.value || null,
      address: address.value || null,
      notes: notes.value || null,
      preferred: preferred.value || null,
    }
    if (pastIdentityToken.value.trim()) payload.pastIdentityToken = pastIdentityToken.value.trim()
    const response = await api.invites.accept(route.params.token, payload)
    localStorage.setItem('santa-past-identity-token', pastIdentityToken.value.trim())
    invite.value.participant = {
      ...invite.value.participant,
      ...(response?.participant ?? {}),
      filled: true,
    }
    await loadParticipantData(invite.value, route.params.token)
    await nextTick()
    document.getElementById('questionnaire')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (requestError) {
    cardError.value = requestError.message
  } finally {
    submitting.value = false
  }
}

async function fillPastIdentity() {
  pastTokenError.value = ''
  try {
    const past = await api.me.pastGames()
    const found = past.find((item) => item.identity_token)
    if (found) {
      pastIdentityToken.value = found.identity_token
      return
    }
    pastTokenError.value = 'В прошлых играх не найден код участия — возьмите его из персональной ссылки'
  } catch (requestError) {
    pastTokenError.value = requestError.message
  }
}

async function saveAnswers(payload) {
  if (!invite.value) return
  questionnaireBusy.value = true
  questionnaireError.value = ''
  try {
    await api.games.saveAnswers(
      invite.value.game.id,
      invite.value.participant.id,
      { answers: payload },
      route.params.token,
      gameToken.value,
    )
    answers.value = await api.games.participantAnswers(
      invite.value.game.id,
      invite.value.participant.id,
      route.params.token,
      gameToken.value,
    )
  } catch (requestError) {
    questionnaireError.value = requestError.message
  } finally {
    questionnaireBusy.value = false
  }
}
</script>

<template>
  <section class="relative isolate mx-auto max-w-3xl overflow-hidden px-5 py-16">
    <ThemeDecor :theme-id="invite?.game.theme_id ?? preferences.themeId" :accent="preferences.theme.accent" />
    <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Приглашение</p>

    <p v-if="loading" class="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm opacity-70">
      Открываем приглашение…
    </p>
    <p
      v-else-if="error"
      role="alert"
      class="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm text-rose-200"
    >
      {{ error }}
    </p>

    <div v-else-if="invite" class="mt-6 grid gap-4">
      <div class="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <h1 class="text-2xl font-bold">{{ invite.game.title }}</h1>
        <p class="mt-2 opacity-70">
          {{ invite.participant.name }}, ваше участие
          {{ invite.participant.filled ? 'подтверждено' : 'ждёт подтверждения' }}.
        </p>

        <form class="mt-6 grid gap-3" @submit.prevent="accept">
          <label class="grid gap-1 text-sm">
            <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Email по желанию</span>
            <input
              v-model="email"
              type="email"
              maxlength="160"
              placeholder="name@example.com"
              class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
            />
          </label>
          <label class="grid gap-1 text-sm">
            <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Желания</span>
            <textarea
              v-model="wishlist"
              rows="2"
              maxlength="2000"
              :placeholder="'Книга &quot;Мастер и Маргарита&quot;'"
              class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
            ></textarea>
          </label>
          <label class="grid gap-1 text-sm">
            <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Адрес доставки</span>
            <input
              v-model="address"
              type="text"
              maxlength="2000"
              placeholder="Москва, ул. Лесная, 5"
              class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
            />
          </label>
          <label class="grid gap-1 text-sm">
            <span class="text-xs font-semibold uppercase tracking-widest opacity-60">С кем хотите играть</span>
            <input
              v-model="preferred"
              type="text"
              maxlength="2000"
              placeholder="Аня, Борис, Вика"
              class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
            />
          </label>
          <label class="grid gap-1 text-sm">
            <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Заметки организатору</span>
            <textarea
              v-model="notes"
              rows="2"
              maxlength="2000"
              placeholder="Не звонить после 21:00"
              class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
            ></textarea>
          </label>
          <div class="grid gap-2">
            <label class="grid gap-1 text-sm">
              <span class="text-xs font-semibold uppercase tracking-widest opacity-60">
                Код участия из прошлой игры (необязательно)
              </span>
              <input
                v-model="pastIdentityToken"
                type="text"
                maxlength="120"
                placeholder="Например, A1B2-C3D4"
                class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
              />
            </label>
            <button
              type="button"
              class="justify-self-start text-xs underline opacity-70 transition hover:opacity-100"
              @click="fillPastIdentity"
            >
              Подставить из прошлой игры
            </button>
            <p v-if="pastTokenError" role="alert" class="text-xs text-amber-300">{{ pastTokenError }}</p>
          </div>
          <p v-if="cardError" role="alert" class="text-sm text-rose-300">{{ cardError }}</p>
          <button
            type="submit"
            class="rounded-full px-5 py-2.5 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
            :style="{ background: preferences.theme.accent, color: '#0b1120' }"
            :disabled="submitting"
          >
            {{ submitting ? 'Сохраняем…' : invite.participant.filled ? 'Обновить карточку' : 'Подтвердить участие' }}
          </button>
        </form>

        <p
          v-if="invite.participant.filled"
          class="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm opacity-70"
        >
          Вы в игре. Карточка доступна вам и Санте после раскрытия пары.
        </p>
      </div>

      <div id="questionnaire" class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="font-bold">Анкета</h2>
        <p class="mt-1 text-sm opacity-60">
          Отвечайте на вопросы сразу после присоединения; вернуться к ним можно в любой момент. Ответы видны Санте после
          раскрытия пары.
        </p>
        <p v-if="questionnaireError" role="alert" class="mt-2 text-sm text-rose-300">{{ questionnaireError }}</p>
        <div class="mt-3">
          <QuestionnaireForm
            :questions="questions"
            :answers="answers"
            :busy="questionnaireBusy"
            :accent="preferences.theme.accent"
            :editable="true"
            @save="saveAnswers"
          />
        </div>
      </div>

      <template v-if="invite.participant.filled">
        <NotificationsPanel
          :game-id="gameId"
          :invite-token="String(route.params.token)"
          :game-token="gameToken"
          title="Уведомления по вашей карточке и паре"
        />

        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 class="font-bold">Мой обмен</h2>
          <p v-if="!revealed" class="mt-2 text-sm opacity-60">
            Пара ещё не раскрыта. Как только организатор её откроет, здесь появятся анкета получателя и чат.
          </p>
          <template v-else>
            <p v-if="myExchange?.receiver_name" class="mt-2 font-semibold">Вы дарите: {{ myExchange.receiver_name }}</p>
            <div v-if="recipientCard" class="mt-3 grid gap-1 text-sm opacity-75">
              <p v-if="recipientCard.wishlist">Желания: {{ recipientCard.wishlist }}</p>
              <p v-if="recipientCard.address">Адрес: {{ recipientCard.address }}</p>
              <p v-if="recipientCard.notes">Заметки: {{ recipientCard.notes }}</p>
            </div>
            <div v-if="recipientAnswers.length" class="mt-4">
              <p class="text-xs font-semibold uppercase tracking-widest opacity-60">Анкета получателя</p>
              <div class="mt-2">
                <QuestionnaireForm
                  :questions="questions"
                  :answers="recipientAnswers"
                  :accent="preferences.theme.accent"
                  :editable="false"
                />
              </div>
            </div>
          </template>
        </div>

        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 class="font-bold">Сообщения</h2>
          <ChatPanel
            :game-token="gameToken || String(route.params.token)"
            :invite-token="String(route.params.token)"
            :contacts="chatContacts"
            :accent="preferences.theme.accent"
          />
        </div>
      </template>
    </div>
  </section>
</template>
