<script setup>
import { computed, ref } from 'vue'
import { domain } from '../config'
import { participants as seedParticipants, history as seedHistory } from '../data/demo'

defineProps({
  accent: String,
})

const emit = defineEmits(['back'])

const tabs = [
  { id: 'overview', label: 'Обзор' },
  { id: 'participants', label: 'Участники' },
  { id: 'draw', label: 'Жеребьёвка' },
  { id: 'history', label: 'История' },
]

const historyFilters = [
  { id: 'all', label: 'Все' },
  { id: 'join', label: 'Вход' },
  { id: 'settings', label: 'Настройки' },
  { id: 'draw', label: 'Жеребьёвка' },
  { id: 'gift', label: 'Подарки' },
]

const tab = ref('overview')
const people = ref(seedParticipants.map((person) => ({ ...person })))
const events = ref(seedHistory.map((event) => ({ ...event })))
const pairs = ref(
  Object.fromEntries(
    people.value.map((person, index) => [person.id, people.value[(index + 1) % people.value.length].id]),
  ),
)
const revealed = ref(false)
const saved = ref(true)
const historyFilter = ref('all')

const organizers = ['О', 'В', 'А']

const progress = computed(() => {
  const total = people.value.length
  const count = (key) => people.value.filter((person) => person[key]).length

  return [
    { label: 'Присоединились', value: total, total },
    { label: 'Заполнили карточку', value: count('filled'), total },
    { label: 'Узнали подопечного', value: count('knows'), total },
    { label: 'Отправили подарок', value: count('sent'), total },
    { label: 'Получили подарок', value: count('received'), total },
  ].map((item) => ({ ...item, percent: Math.round((item.value / item.total) * 100) }))
})

const filteredEvents = computed(() =>
  historyFilter.value === 'all'
    ? events.value
    : events.value.filter((event) => event.kind === historyFilter.value),
)

function nameOf(id) {
  return people.value.find((person) => person.id === id)?.name ?? '—'
}

function candidates(person) {
  return people.value.filter((item) => item.id !== person.id)
}

function statusOf(person) {
  if (person.received) return 'Подарок получен'
  if (person.sent) return 'Подарок отправлен'
  if (person.knows) return 'Ждёт подарок'
  if (person.filled) return 'Анкета заполнена'
  return 'Ожидает участия'
}

function shuffle() {
  const ids = people.value.map((person) => person.id)
  pairs.value = Object.fromEntries(ids.map((id, index) => [id, ids[(index + 1) % ids.length]]))
  revealed.value = false
  saved.value = false
}

function clearPairs() {
  pairs.value = {}
  revealed.value = false
  saved.value = false
}

function fillRemaining() {
  const ids = people.value.map((person) => person.id)
  const available = ids.filter((id) => !Object.values(pairs.value).includes(id))

  ids.filter((id) => !pairs.value[id]).forEach((id) => {
    if (!available.length) return
    const index = available.findIndex((candidate) => candidate !== id)
    const [recipient] = available.splice(index === -1 ? 0 : index, 1)
    pairs.value[id] = recipient
  })

  saved.value = false
}

function assign(id, value) {
  const recipient = Number(value)
  if (!recipient || recipient === id) return

  const current = pairs.value[id]
  const otherId = Object.keys(pairs.value).find(
    (key) => Number(key) !== id && pairs.value[key] === recipient,
  )

  if (otherId !== undefined && current) pairs.value[otherId] = current
  pairs.value[id] = recipient
  saved.value = false
}

function save() {
  saved.value = true
  events.value.unshift({ text: 'Вы сохранили распределение пар', time: 'только что', kind: 'settings' })
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 py-10">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <button type="button" class="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-inherit opacity-75 transition hover:opacity-100" @click="emit('back')">
        ← На главную
      </button>
      <span class="rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs uppercase tracking-widest opacity-70">демо-данные</span>
    </div>

    <div class="mt-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Кабинет организатора</p>
        <h1 class="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Новогодняя вечеринка</h1>
        <p class="mt-2 text-sm opacity-60">{{ domain }} · до 1 500 ₽ · обмен 25 декабря</p>
      </div>
      <button
        type="button"
        class="rounded-full px-6 py-3 font-semibold text-slate-950 shadow-xl transition hover:brightness-110 disabled:cursor-default disabled:opacity-40"
        :style="{ background: accent }"
        :disabled="saved"
        @click="save"
      >
        {{ saved ? 'Изменения сохранены' : 'Сохранить изменения' }}
      </button>
    </div>

    <div class="mt-8 flex gap-1 overflow-x-auto border-b border-white/10">
      <button
        v-for="item in tabs"
        :key="item.id"
        type="button"
        class="whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition"
        :class="tab === item.id ? '' : 'border-transparent opacity-55 hover:opacity-90'"
        :style="tab === item.id ? { borderColor: accent, color: accent } : {}"
        :aria-current="tab === item.id ? 'page' : undefined"
        @click="tab = item.id"
      >
        {{ item.label }}
      </button>
    </div>

    <div class="mt-6">
      <div v-if="tab === 'overview'" class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <article v-for="item in progress" :key="item.label" class="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <p class="text-xs opacity-60">{{ item.label }}</p>
            <p class="mt-2 text-2xl font-black">
              {{ item.value }}<span class="text-sm font-medium opacity-50">/{{ item.total }}</span>
            </p>
            <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div class="h-full rounded-full" :style="{ width: `${item.percent}%`, background: accent }"></div>
            </div>
            <p class="mt-2 text-xs opacity-50">{{ item.percent }}%</p>
          </article>
        </div>

        <div class="grid gap-4 lg:grid-cols-[1.4fr_.6fr]">
          <div class="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-bold">Организаторы</h3>
              <span class="text-xs opacity-55">до 3 человек</span>
            </div>
            <div class="mt-5 flex flex-wrap items-center gap-3">
              <span
                v-for="(letter, index) in organizers"
                :key="index"
                class="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-sm font-bold"
                :style="index === 0 ? { color: accent } : {}"
              >
                {{ letter }}
              </span>
              <button type="button" class="grid h-11 w-11 place-items-center rounded-full border border-dashed border-white/30 text-xl opacity-60 transition hover:opacity-100" aria-label="Добавить организатора">
                +
              </button>
              <span class="ml-2 text-sm opacity-60">Добавить помощника</span>
            </div>
          </div>

          <div class="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h3 class="text-lg font-bold">Пространство игры</h3>
            <p class="mt-3 text-sm opacity-65">Ваш адрес</p>
            <p class="mt-1 font-semibold" :style="{ color: accent }">{{ domain }}</p>
            <p class="mt-4 text-sm opacity-65">Анкета</p>
            <p class="mt-1 font-semibold">10 вопросов · 4 типа ответов</p>
          </div>
        </div>
      </div>

      <div v-else-if="tab === 'participants'" class="overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-left text-sm">
            <thead class="border-b border-white/10 text-xs uppercase tracking-wider opacity-60">
              <tr>
                <th class="px-5 py-4">Участник</th>
                <th class="px-5 py-4">Анкета</th>
                <th class="px-5 py-4">Подопечный</th>
                <th class="px-5 py-4">Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="person in people" :key="person.id" class="border-b border-white/5 last:border-0">
                <td class="px-5 py-3 font-semibold">{{ person.name }}</td>
                <td class="px-5 py-3 opacity-70">{{ person.filled ? 'Заполнена' : 'Пустая' }}</td>
                <td class="px-5 py-3 font-medium" :style="revealed && pairs[person.id] ? { color: accent } : {}">
                  {{ revealed && pairs[person.id] ? nameOf(pairs[person.id]) : 'Скрыто' }}
                </td>
                <td class="px-5 py-3">
                  <span class="rounded-full border border-white/15 px-3 py-1 text-xs opacity-80">{{ statusOf(person) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="tab === 'draw'" class="grid gap-4 lg:grid-cols-[.75fr_1.25fr]">
        <div class="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h3 class="text-lg font-bold">Управление парами</h3>
          <p class="mt-2 text-sm leading-relaxed opacity-65">Ручные назначения сохраняются. Уведомления уходят только после сохранения.</p>
          <div class="mt-5 grid gap-2">
            <button type="button" class="rounded-xl border border-white/15 px-4 py-3 text-left text-sm font-semibold transition hover:bg-white/10" @click="shuffle">Перемешать заново</button>
            <button type="button" class="rounded-xl border border-white/15 px-4 py-3 text-left text-sm font-semibold transition hover:bg-white/10" @click="clearPairs">Очистить пары</button>
            <button type="button" class="rounded-xl border border-white/15 px-4 py-3 text-left text-sm font-semibold transition hover:bg-white/10" @click="fillRemaining">Заполнить оставшиеся</button>
            <button type="button" class="rounded-xl border border-white/15 px-4 py-3 text-left text-sm font-semibold transition hover:bg-white/10" :aria-pressed="revealed" @click="revealed = !revealed">
              {{ revealed ? 'Скрыть пары' : 'Показать пары' }}
            </button>
          </div>
          <p v-if="!revealed" class="mt-4 text-xs opacity-50">Покажите пары, чтобы назначать получателей вручную.</p>
          <p v-else class="mt-4 text-xs opacity-50">При выборе занятого получателя пары меняются местами.</p>
        </div>

        <div class="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div class="flex items-center justify-between gap-4">
            <h3 class="text-lg font-bold">Распределение</h3>
            <span class="text-xs opacity-60" :style="{ color: accent }">{{ Object.keys(pairs).length }} из {{ people.length }}</span>
          </div>
          <div class="mt-4 grid gap-2 sm:grid-cols-2">
            <div v-for="person in people" :key="person.id" class="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/15 px-4 py-3 text-sm">
              <span class="font-semibold">{{ person.name }}</span>
              <span class="ml-auto opacity-40">→</span>
              <span v-if="!revealed" class="font-semibold" :style="pairs[person.id] ? { color: accent } : {}">
                {{ pairs[person.id] ? '••••' : '—' }}
              </span>
              <select
                v-else
                class="max-w-[120px] rounded-lg border border-white/15 bg-slate-950/40 px-2 py-1 font-semibold text-inherit"
                :value="pairs[person.id] ?? ''"
                :aria-label="`Получатель для ${person.name}`"
                @change="assign(person.id, $event.target.value)"
              >
                <option value="" disabled>Не назначено</option>
                <option v-for="candidate in candidates(person)" :key="candidate.id" :value="candidate.id">
                  {{ candidate.name }}
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 class="text-lg font-bold">История игры</h3>
            <p class="mt-1 text-sm opacity-60">Все события с датой и временем</p>
          </div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="filter in historyFilters"
              :key="filter.id"
              type="button"
              class="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold transition"
              :class="historyFilter === filter.id ? 'bg-white/10' : 'opacity-60 hover:opacity-100'"
              :style="historyFilter === filter.id ? { borderColor: accent, color: accent } : {}"
              :aria-pressed="historyFilter === filter.id"
              @click="historyFilter = filter.id"
            >
              {{ filter.label }}
            </button>
          </div>
        </div>
        <div class="mt-4 divide-y divide-white/10">
          <div v-for="(event, index) in filteredEvents" :key="index" class="flex items-start gap-4 py-4">
            <span class="mt-2 h-2 w-2 shrink-0 rounded-full" :style="{ background: accent }"></span>
            <div>
              <p class="font-medium">{{ event.text }}</p>
              <p class="mt-1 text-xs opacity-50">{{ event.time }}</p>
            </div>
          </div>
          <p v-if="!filteredEvents.length" class="py-6 text-center text-sm opacity-50">Событий в этой категории пока нет.</p>
        </div>
      </div>
    </div>
  </div>
</template>
