<script setup>
defineProps({
  theme: Object,
  accent: String,
})

const emit = defineEmits(['open-demo'])
</script>

<template>
  <section
    class="relative mx-auto grid max-w-6xl gap-12 px-5 py-14 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-20"
  >
    <div
      class="pointer-events-none absolute inset-0 opacity-[0.12]"
      style="background-image: radial-gradient(currentColor 1px, transparent 1px); background-size: 28px 28px"
    ></div>
    <div>
      <span
        class="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-medium backdrop-blur"
      >
        <span class="h-2 w-2 rounded-full" :style="{ background: accent }"></span>
        Бесплатно · без регистрации и email
      </span>

      <h1 class="mt-6 text-5xl font-black leading-[1.04] tracking-tight sm:text-6xl">
        Тайный Санта <span :style="{ color: accent }">онлайн</span>
      </h1>

      <p class="mt-5 max-w-xl text-lg leading-relaxed opacity-75">
        Создайте игру, позовите друзей или коллег, соберите пожелания и проведите жеребьёвку. Всё в одном месте и без
        лишних шагов.
      </p>

      <div class="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          class="rounded-full px-6 py-3 font-semibold text-slate-950 shadow-xl transition hover:brightness-110"
          :style="{ background: accent }"
          @click="emit('open-demo')"
        >
          Создать игру
        </button>
        <RouterLink
          to="/randomizer"
          class="rounded-full border border-white/25 px-6 py-3 font-semibold text-inherit backdrop-blur transition hover:bg-white/10"
          aria-label="Открыть быструю жеребьёвку"
        >
          Быстрая жеребьёвка
        </RouterLink>
      </div>

      <div class="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm opacity-70">
        <span>Безлимит участников</span>
        <span>До 10 вопросов в анкете</span>
        <span>До 3 организаторов</span>
      </div>
    </div>

    <div class="relative">
      <div class="absolute -inset-8 rounded-full opacity-40 blur-3xl" :style="{ background: theme.glow }"></div>
      <div class="relative rounded-3xl border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs uppercase tracking-widest opacity-60">Ваша игра</p>
            <h2 class="mt-1 text-xl font-bold">Новогодняя вечеринка</h2>
          </div>
          <span class="rounded-full border border-white/20 px-3 py-1 text-xs" :style="{ color: accent }"
            >Ждёт жеребьёвку</span
          >
        </div>

        <div class="mt-6 rounded-2xl border border-white/10 bg-slate-950/20 p-4">
          <div class="flex items-center justify-between text-sm">
            <span class="font-semibold">Заполнили анкету</span>
            <span class="opacity-70">8 из 12</span>
          </div>
          <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div class="h-full rounded-full" :style="{ width: '67%', background: accent }"></div>
          </div>
          <div class="mt-4 flex -space-x-2">
            <span
              v-for="n in 5"
              :key="n"
              class="grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-white/15 text-xs font-bold"
            >
              {{ ['О', 'М', 'А', 'Б', 'В'][n - 1] }}
            </span>
            <span class="grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-white/10 text-xs"
              >+7</span
            >
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p class="opacity-60">Бюджет</p>
            <p class="mt-1 font-semibold">до 1 500 ₽</p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p class="opacity-60">Обмен</p>
            <p class="mt-1 font-semibold">25 декабря</p>
          </div>
        </div>

        <button
          type="button"
          class="mt-5 w-full rounded-full py-3 font-semibold text-slate-950"
          :style="{ background: accent }"
          @click="emit('open-demo')"
        >
          Открыть кабинет организатора
        </button>
      </div>
    </div>
  </section>
</template>
