<script setup>
import { ref } from 'vue'

const message = ref('')
const error = ref('')
const loading = ref(false)

async function loadMessage() {
  loading.value = true
  error.value = ''

  try {
    const response = await fetch('/api/message')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    message.value = (await response.json()).message
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-slate-950 p-8 text-slate-100">
    <section class="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
      <p class="text-xs font-semibold uppercase tracking-widest text-emerald-400">
        Node.js · Express · Vue · Tailwind
      </p>
      <h1 class="mt-3 text-3xl font-bold">Secret Santa</h1>
      <p class="mt-2 text-slate-400">Проверьте связь клиента с API.</p>

      <button
        type="button"
        class="mt-6 rounded-lg bg-emerald-500 px-5 py-2.5 font-medium text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
        :disabled="loading"
        @click="loadMessage"
      >
        {{ loading ? 'Загрузка...' : 'Получить сообщение' }}
      </button>

      <p v-if="message" class="mt-5 rounded-lg bg-slate-800 p-4 text-emerald-300">{{ message }}</p>
      <p v-if="error" class="mt-5 rounded-lg bg-red-950 p-4 text-red-300">Ошибка: {{ error }}</p>
    </section>
  </main>
</template>
