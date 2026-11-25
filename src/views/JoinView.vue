<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../lib/api'
import { usePreferencesStore } from '../stores/preferences'

const route = useRoute()
const preferences = usePreferencesStore()
const invite = ref(null)
const email = ref('')
const error = ref('')
const loading = ref(true)
const submitting = ref(false)
const done = ref(false)

watch(
  () => route.params.token,
  async (token) => {
    loading.value = true
    error.value = ''
    done.value = false
    invite.value = null
    try {
      const response = await api.invites.get(token)
      invite.value = response
      email.value = response.participant.email ?? ''
      preferences.setTheme(response.game.themeId)
    } catch (requestError) {
      error.value = requestError.message
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

async function accept() {
  submitting.value = true
  error.value = ''
  try {
    await api.invites.accept(route.params.token, { email: email.value || null })
    done.value = true
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-2xl px-5 py-16">
    <p class="text-xs font-semibold uppercase tracking-[0.3em] opacity-60">Приглашение</p>

    <p v-if="loading" class="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm opacity-70">Открываем приглашение…</p>
    <p v-else-if="error" role="alert" class="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm text-rose-200">{{ error }}</p>

    <div v-else-if="invite" class="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <h1 class="text-2xl font-bold">{{ invite.game.title }}</h1>
      <p class="mt-2 opacity-70">{{ invite.participant.name }}, ваше участие подтверждено организатором.</p>

      <form v-if="!done && !invite.participant.filled" class="mt-6 grid gap-3" @submit.prevent="accept">
        <label class="grid gap-1 text-sm">
          <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Email по желанию</span>
          <input
            v-model="email"
            type="email"
            maxlength="160"
            placeholder="Не обязательно"
            class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
          />
        </label>
        <button
          type="submit"
          class="rounded-full px-5 py-2.5 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
          :style="{ background: preferences.theme.accent, color: '#0b1120' }"
          :disabled="submitting"
        >
          {{ submitting ? 'Отправляем…' : 'Подтвердить участие' }}
        </button>
      </form>

      <p v-else class="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm opacity-70">
        {{ done || invite.participant.filled ? 'Вы в игре. Организатор сообщит детали обмена.' : '' }}
      </p>
    </div>
  </section>
</template>
