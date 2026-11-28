<script setup>
import { ref } from 'vue'
import { api } from '../lib/api'
import { usePreferencesStore } from '../stores/preferences'

const preferences = usePreferencesStore()
const email = ref('')
const subject = ref('')
const body = ref('')
const busy = ref(false)
const sent = ref(false)
const error = ref('')

async function submit() {
  busy.value = true
  error.value = ''
  try {
    const payload = { email: email.value, subject: subject.value, body: body.value }
    if (!payload.email.trim()) delete payload.email
    await api.support.send(payload)
    sent.value = true
    email.value = ''
    subject.value = ''
    body.value = ''
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    busy.value = false
  }
}

function startNew() {
  email.value = ''
  subject.value = ''
  body.value = ''
  error.value = ''
  sent.value = false
}
</script>

<template>
  <section class="mx-auto max-w-2xl px-5 py-12">
    <div class="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <h1 class="text-3xl font-bold tracking-tight">Поддержка</h1>
      <p class="mt-2 text-sm opacity-70">Опишите ситуацию — если вы укажете почту, мы ответим на неё.</p>

      <div v-if="sent" role="status" class="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm">
        <p>Обращение отправлено. Если вы указали email, мы ответим на него.</p>
        <button type="button" class="mt-3 text-sm underline opacity-70 transition hover:opacity-100" @click="startNew">
          Написать ещё
        </button>
      </div>

      <form v-else class="mt-6 grid gap-3" @submit.prevent="submit">
        <label class="grid gap-1 text-sm">
          <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Email для ответа</span>
          <input
            v-model="email"
            type="email"
            maxlength="160"
            placeholder="you@example.com"
            class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-white/40"
          />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Тема</span>
          <input
            v-model="subject"
            type="text"
            required
            maxlength="120"
            class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-white/40"
          />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Сообщение</span>
          <textarea
            v-model="body"
            required
            rows="6"
            maxlength="2000"
            class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-white/40"
          ></textarea>
        </label>
        <p class="text-xs opacity-60">{{ body.length }}/2000</p>
        <button
          type="submit"
          class="rounded-full px-5 py-2.5 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
          :style="{ background: preferences.theme.accent, color: '#0b1120' }"
          :disabled="busy || !subject.trim() || !body.trim()"
        >
          {{ busy ? 'Отправляем…' : 'Отправить обращение' }}
        </button>
        <p v-if="error" role="alert" class="text-sm text-rose-300">{{ error }}</p>
      </form>
    </div>
  </section>
</template>
