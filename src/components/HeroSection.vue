<script setup>
import ThemeDecor from './ThemeDecor.vue'

defineProps({
  theme: Object,
  accent: String,
})

const emit = defineEmits(['open-create'])

const highlights = ['Приглашения по ссылке', 'Анкеты и пожелания', 'Жеребьёвка и история']
</script>

<template>
  <section
    class="relative isolate mx-auto grid max-w-6xl gap-12 overflow-hidden px-5 py-14 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-20"
  >
    <ThemeDecor :theme-id="theme.id" :accent="accent" />
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
          @click="emit('open-create')"
        >
          Создать игру
        </button>
        <RouterLink
          to="/randomizer"
          class="rounded-full border border-white/25 px-6 py-3 font-semibold text-inherit backdrop-blur transition hover:bg-white/10"
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
            <h2 class="mt-1 text-xl font-bold">Начните с настроек</h2>
          </div>
          <span class="rounded-full border border-white/20 px-3 py-1 text-xs" :style="{ color: accent }"
            >Без регистрации</span
          >
        </div>

        <div class="mt-6 grid gap-3">
          <div
            v-for="item in highlights"
            :key="item"
            class="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/20 p-4 text-sm"
          >
            <span class="grid h-7 w-7 place-items-center rounded-full" :style="{ background: accent, color: '#0b1120' }"
              >✓</span
            >
            <span>{{ item }}</span>
          </div>
        </div>

        <button
          type="button"
          class="mt-5 w-full rounded-full py-3 font-semibold text-slate-950"
          :style="{ background: accent }"
          @click="emit('open-create')"
        >
          Настроить игру
        </button>
      </div>
    </div>
  </section>
</template>
