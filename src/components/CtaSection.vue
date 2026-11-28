<script setup>
defineProps({
  accent: String,
})

const emit = defineEmits(['open-create'])
</script>

<template>
  <section class="mx-auto max-w-6xl px-5 pb-20">
    <div
      class="relative overflow-hidden rounded-[2rem] border border-white/15 bg-white/5 px-6 py-12 text-center backdrop-blur sm:px-12"
    >
      <div
        class="absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        :style="{ background: accent }"
      ></div>
      <p class="relative text-xs font-semibold uppercase tracking-[0.3em] opacity-60">
        Праздник начинается с маленькой тайны
      </p>
      <h2 class="relative mt-3 text-3xl font-black sm:text-4xl">Готовы удивить друзей или коллег?</h2>
      <p class="relative mx-auto mt-3 max-w-xl leading-relaxed opacity-70">
        Создайте игру за пару минут, пригласите близких и наблюдайте, как растёт предвкушение подарков.
      </p>
      <div class="relative mt-7 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          class="rounded-full px-6 py-3 font-semibold text-slate-950 shadow-xl transition hover:brightness-110"
          :style="{ background: accent }"
          @click="emit('open-create')"
        >
          Создать игру бесплатно
        </button>
      </div>
      <p class="relative mt-5 text-xs opacity-50">Все возможности доступны сразу.</p>
    </div>
  </section>
</template>
