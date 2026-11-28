<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../lib/api'
import { MAX_ORGANIZERS_WORD_AFTER_DO, MAX_QUESTIONS } from '../../limits.js'

const props = defineProps({
  themes: Array,
  themesMessage: String,
  themesError: String,
  accent: String,
})

const emit = defineEmits(['open-create'])

const stages = ref([])
const metricsError = ref('')
const loaded = ref(false)

const stageCopy = {
  game_created: 'Игра создана',
  participant_invited: 'Участники добавлены',
  draw_completed: 'Пары распределены',
  gift_sent: 'Подарки отправлены',
  organizer_return: 'Организатор создал ещё одну игру',
}

function stageTitle(stage) {
  return stageCopy[stage.key] ?? 'Ещё один шаг'
}

function numberText(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value) || 0)
}

function stageCaption(stage) {
  return `${numberText(stage.conversion)} из 100 игр доходят до этого шага`
}

onMounted(async () => {
  try {
    const summary = await api.metrics()
    stages.value = Array.isArray(summary?.stages) ? summary.stages : []
  } catch {
    metricsError.value = 'Метрики пока недоступны'
  } finally {
    loaded.value = true
  }
})

const features = computed(() => [
  {
    title: 'Своё пространство',
    text: 'Ссылка на игру и выбор оформления.',
    hint: 'Личная ссылка',
  },
  {
    title: 'Все темы оформления',
    text: (props.themes ?? []).length
      ? `${props.themes.map((item) => item.name).join(', ')} — выбирайте под настроение.`
      : props.themesError || props.themesMessage,
    hint: 'Ночь и день',
  },
  {
    title: 'Свои вопросы в анкете',
    text: `До ${MAX_QUESTIONS} своих вопросов: текст, число, да/нет и выбор вариантов.`,
    hint: 'Ответы видны Санте',
  },
  {
    title: 'Полный контроль пар',
    text: 'Смотрите пары до и после подтверждения, назначайте вручную и заполняйте оставшиеся.',
    hint: 'Изменения после сохранения',
  },
  {
    title: 'Команда организаторов',
    text: `До ${MAX_ORGANIZERS_WORD_AFTER_DO} человек управляют одной игрой и спокойно передают её дальше.`,
    hint: 'Общая подготовка',
  },
  {
    title: 'История и напоминания',
    text: 'Все события с фильтрами и массовые сообщения выбранным участникам.',
    hint: 'Фильтры и массовые напоминания',
  },
])
</script>

<template>
  <section id="features" class="mx-auto max-w-6xl px-5 py-14">
    <div class="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Как проходит игра</p>
      <div v-if="stages.length" class="mt-4 grid gap-6 text-center sm:grid-cols-3 lg:grid-cols-5">
        <div v-for="stage in stages" :key="stage.key">
          <p class="text-3xl font-black" :style="{ color: accent }">{{ numberText(stage.count) }}</p>
          <p class="mt-1 text-sm opacity-65">{{ stageTitle(stage) }}</p>
          <p class="mt-1 text-xs opacity-50">{{ stageCaption(stage) }}</p>
        </div>
      </div>
      <p v-else-if="loaded" class="mt-4 text-center text-sm opacity-60">
        {{ metricsError || 'Пока нет данных об играх' }}
      </p>
      <p v-else class="mt-4 text-center text-sm opacity-60">Загружаем метрики…</p>
    </div>

    <div class="mt-14 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Управление игрой</p>
        <h2 class="mt-2 text-3xl font-bold tracking-tight">
          Настраивайте анкету, управляйте парами, работайте в команде и храните историю
        </h2>
      </div>
      <button
        type="button"
        class="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-inherit transition hover:bg-white/10"
        @click="emit('open-create')"
      >
        Создать игру
      </button>
    </div>

    <div class="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="feature in features"
        :key="feature.title"
        class="group rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur transition hover:border-white/30 hover:bg-white/10"
      >
        <span
          class="inline-block rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
          :style="{ color: accent }"
        >
          {{ feature.hint }}
        </span>
        <h3 class="mt-4 text-lg font-bold">{{ feature.title }}</h3>
        <p class="mt-2 text-sm leading-relaxed opacity-70">{{ feature.text }}</p>
      </article>
    </div>
  </section>
</template>
