<script setup>
import { computed } from 'vue'
import { infoPages } from '../content/infoPages'

const props = defineProps({
  kind: {
    type: String,
    required: true,
  },
})

const page = computed(() => infoPages[props.kind] ?? infoPages.faq)
</script>

<template>
  <section class="mx-auto max-w-3xl px-5 py-12">
    <div class="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Информация</p>
      <h1 class="mt-2 text-3xl font-bold tracking-tight">{{ page.title }}</h1>
      <p class="mt-3 opacity-70">{{ page.intro }}</p>
      <div class="mt-8 grid gap-5">
        <article
          v-for="section in page.sections"
          :key="section.title"
          class="rounded-xl border border-white/10 bg-white/5 p-4"
        >
          <h2 class="font-bold">{{ section.title }}</h2>
          <p class="mt-2 text-sm leading-relaxed opacity-70">{{ section.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
