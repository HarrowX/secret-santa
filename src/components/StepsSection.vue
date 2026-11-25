<script setup>
defineProps({
  accent: String,
})

const steps = [
  {
    title: 'Создайте игру',
    text: 'Придумайте название, бюджет и правила. Настройте анкету и выберите оформление под настроение компании.',
    icon: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3z',
  },
  {
    title: 'Проведите жеребьёвку',
    text: 'Пригласите участников по ссылке, задайте исключения и распределите пары. Каждый узнает своего подопечного.',
    icon: 'M4 7h4l8 10h4M16 4l4 3-4 3M4 17h4l3-3M14 10l3-3h3',
  },
  {
    title: 'Следите за игрой',
    text: 'Видите прогресс, помогайте участникам, отправляйте напоминания и проверяйте историю событий.',
    icon: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7C9 7 7 6 7 4s2-2 3-1 2 4 2 4zM12 7c3 0 5-1 5-3s-2-2-3-1-2 4-2 4z',
  },
]
</script>

<template>
  <section class="mx-auto max-w-6xl px-5 py-14">
    <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Как это работает</p>
    <h2 class="mt-2 text-3xl font-bold tracking-tight">От идеи до подарка — три шага</h2>

    <div class="mt-8 grid gap-4 md:grid-cols-3">
      <article v-for="(step, index) in steps" :key="step.title" class="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <div class="flex items-center justify-between">
          <span class="grid h-11 w-11 place-items-center rounded-2xl bg-white/10" :style="{ color: accent }">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path :d="step.icon" />
            </svg>
          </span>
          <span class="text-4xl font-black opacity-15">0{{ index + 1 }}</span>
        </div>
        <h3 class="mt-5 text-xl font-bold">{{ step.title }}</h3>
        <p class="mt-2 text-sm leading-relaxed opacity-70">{{ step.text }}</p>
      </article>
    </div>
  </section>
</template>
