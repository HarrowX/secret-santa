<script setup>
import { ref, watch } from 'vue'
import { api, ensureSession } from '../lib/api'
import { presets } from '../content/presets'

const props = defineProps({
  accent: String,
  themeId: String,
  themes: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['created'])

const title = ref('')
const budget = ref('')
const exchangeDate = ref('')
const rules = ref('')
const format = ref('')
const selectedTheme = ref(props.themeId)
const busy = ref(false)
const error = ref('')

watch(
  () => props.themeId,
  (value) => {
    selectedTheme.value = value
  },
)

function applyPreset(id) {
  const preset = presets.find((item) => item.id === id)
  if (!preset) return
  format.value = preset.id
  selectedTheme.value = preset.themeId
  if (!rules.value || presets.some((item) => rules.value === item.rules)) {
    rules.value = preset.rules
  }
}

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await ensureSession()
    const game = await api.games.create({
      title: title.value,
      budget: budget.value,
      exchangeDate: exchangeDate.value,
      rules: rules.value,
      format: format.value,
      themeId: selectedTheme.value,
    })
    emit('created', game)
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="mx-auto max-w-6xl px-5 pb-4" @submit.prevent="submit">
    <div class="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold">Настройте игру и начните</h2>
          <p class="mt-1 text-xs opacity-60">Регистрация не нужна — игра появится сразу</p>
        </div>
        <button
          type="submit"
          class="rounded-full px-5 py-2.5 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
          :style="{ background: accent, color: '#0b1120' }"
          :disabled="busy || !title.trim()"
        >
          {{ busy ? 'Создаём…' : 'Создать игру' }}
        </button>
      </div>

      <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label class="grid gap-1 text-sm sm:col-span-2">
          <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Название</span>
          <input
            v-model="title"
            type="text"
            required
            maxlength="120"
            placeholder="Корпоратив в декабре"
            class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-white/40"
          />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Бюджет</span>
          <input
            v-model="budget"
            type="text"
            maxlength="80"
            placeholder="1500 ₽"
            class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
          />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Дата обмена</span>
          <input
            v-model="exchangeDate"
            type="date"
            class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-white/40"
          />
        </label>
        <label class="grid gap-1 text-sm lg:col-span-2">
          <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Формат</span>
          <select
            :value="format"
            class="rounded-xl border border-white/15 px-4 py-2.5 text-sm outline-none focus:border-white/40"
            @change="applyPreset($event.target.value)"
          >
            <option value="">Без пресета</option>
            <option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.label }}</option>
          </select>
        </label>
        <label class="grid gap-1 text-sm lg:col-span-2">
          <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Тема</span>
          <select
            v-model="selectedTheme"
            class="rounded-xl border border-white/15 px-4 py-2.5 text-sm outline-none focus:border-white/40"
          >
            <option v-for="item in themes" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <label class="grid gap-1 text-sm lg:col-span-2">
          <span class="text-xs font-semibold uppercase tracking-widest opacity-60">Правила</span>
          <textarea
            v-model="rules"
            rows="2"
            maxlength="2000"
            placeholder="Без сладкого, до 25 декабря"
            class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-current/40 focus:border-white/40"
          ></textarea>
        </label>
      </div>

      <p v-if="error" role="alert" class="mt-3 text-sm text-rose-300">{{ error }}</p>
    </div>
  </form>
</template>
