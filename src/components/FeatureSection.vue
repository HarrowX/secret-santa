<script setup>
import { domain } from '../config'

defineProps({
  accent: String,
})

const emit = defineEmits(['open-demo'])

const features = [
  {
    title: 'Своё пространство',
    text: 'Персональный адрес игры и оформление, которое чувствуется как ваше.',
    hint: domain,
  },
  {
    title: 'Все темы оформления',
    text: 'Зима, Хэллоуин, Альпы, Египет, пиксели, сакура — выбирайте под настроение.',
    hint: 'Ночь и день',
  },
  {
    title: 'Анкета с характером',
    text: 'До 10 своих вопросов: текст, число, да/нет и выбор вариантов.',
    hint: 'Ответы видны Санте',
  },
  {
    title: 'Полный контроль пар',
    text: 'Смотрите пары до и после подтверждения, назначайте вручную и заполняйте оставшиеся.',
    hint: 'Изменения после сохранения',
  },
  {
    title: 'Команда организаторов',
    text: 'До трёх человек управляют одной игрой и спокойно передают её дальше.',
    hint: 'Общая подготовка',
  },
  {
    title: 'История и напоминания',
    text: 'Все события с фильтрами и массовые сообщения выбранным участникам.',
    hint: 'Ничего не упустить',
  },
]
</script>

<template>
  <section id="features" class="mx-auto max-w-6xl px-5 py-14">
    <div class="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <div class="grid gap-6 text-center sm:grid-cols-3">
        <div>
          <p class="text-3xl font-black" :style="{ color: accent }">2,4 млн+</p>
          <p class="mt-1 text-sm opacity-65">участников в 2025 году</p>
        </div>
        <div>
          <p class="text-3xl font-black" :style="{ color: accent }">230 тыс+</p>
          <p class="mt-1 text-sm opacity-65">созданных игр</p>
        </div>
        <div>
          <p class="text-3xl font-black" :style="{ color: accent }">Каждый 3-й</p>
          <p class="mt-1 text-sm opacity-65">организатор вернулся снова</p>
        </div>
      </div>
      <p class="mt-4 text-center text-xs opacity-50">Цифры с сайта-источника приведены для демонстрации стиля.</p>
    </div>

    <div class="mt-14 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Возможности</p>
        <h2 class="mt-2 text-3xl font-bold tracking-tight">Больше контроля — больше волшебства</h2>
      </div>
      <button type="button" class="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-inherit transition hover:bg-white/10" @click="emit('open-demo')">
        Открыть демо
      </button>
    </div>

    <div class="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <article v-for="feature in features" :key="feature.title" class="group rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur transition hover:border-white/30 hover:bg-white/10">
        <span class="inline-block rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider" :style="{ color: accent }">
          {{ feature.hint }}
        </span>
        <h3 class="mt-4 text-lg font-bold">{{ feature.title }}</h3>
        <p class="mt-2 text-sm leading-relaxed opacity-70">{{ feature.text }}</p>
      </article>
    </div>
  </section>
</template>
