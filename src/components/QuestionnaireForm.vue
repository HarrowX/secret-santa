<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  questions: {
    type: Array,
    default: () => [],
  },
  answers: {
    type: Array,
    default: () => [],
  },
  editable: {
    type: Boolean,
    default: false,
  },
  busy: Boolean,
  accent: String,
})

const emit = defineEmits(['save'])

const values = ref({})

watch(
  () => [props.questions, props.answers],
  () => {
    const next = {}
    for (const answer of props.answers) next[answer.question_id] = answer.value ?? ''
    for (const question of props.questions) {
      if (next[question.id] === undefined) next[question.id] = ''
    }
    values.value = next
  },
  { immediate: true, deep: true },
)

function options(question) {
  return String(question.hint ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function checked(questionId, option) {
  return String(values.value[questionId] ?? '')
    .split(',')
    .map((item) => item.trim())
    .includes(option)
}

function toggle(questionId, option) {
  const current = String(values.value[questionId] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const next = checked(questionId, option)
    ? current.filter((item) => item !== option)
    : [...current, option]
  values.value[questionId] = next.join(', ')
}

function save() {
  emit(
    'save',
    props.questions.map((question) => ({
      questionId: question.id,
      value: values.value[question.id] ?? '',
    })),
  )
}
</script>

<template>
  <form v-if="questions.length" class="grid gap-3" @submit.prevent="save">
    <label v-for="question in questions" :key="question.id" class="grid gap-1 text-sm">
      <span class="font-semibold">
        {{ question.title }}
        <span v-if="question.required" class="opacity-60">*</span>
      </span>
      <span v-if="question.hint && !['single', 'multi'].includes(question.type)" class="text-xs opacity-50">{{ question.hint }}</span>
      <input
        v-if="question.type === 'number'"
        v-model="values[question.id]"
        type="number"
        class="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm outline-none focus:border-white/40 disabled:opacity-60"
        :disabled="!editable || busy"
      />
      <select
        v-else-if="question.type === 'boolean'"
        v-model="values[question.id]"
        class="rounded-xl border border-white/15 bg-slate-900/80 px-4 py-2 text-sm outline-none focus:border-white/40 disabled:opacity-60"
        :disabled="!editable || busy"
      >
        <option value="">Не выбрано</option>
        <option value="да">Да</option>
        <option value="нет">Нет</option>
      </select>
      <select
        v-else-if="question.type === 'single'"
        v-model="values[question.id]"
        class="rounded-xl border border-white/15 bg-slate-900/80 px-4 py-2 text-sm outline-none focus:border-white/40 disabled:opacity-60"
        :disabled="!editable || busy"
      >
        <option value="">Не выбрано</option>
        <option v-for="option in options(question)" :key="option" :value="option">{{ option }}</option>
      </select>
      <div v-else-if="question.type === 'multi'" class="flex flex-wrap gap-2">
        <button
          v-for="option in options(question)"
          :key="option"
          type="button"
          class="rounded-full border px-3 py-1 text-xs transition disabled:opacity-60"
          :class="checked(question.id, option) ? 'border-transparent' : 'border-white/20 opacity-70'"
          :disabled="!editable || busy"
          :style="checked(question.id, option) ? { background: accent, color: '#0b1120' } : {}"
          @click="toggle(question.id, option)"
        >
          {{ option }}
        </button>
      </div>
      <input
        v-else
        v-model="values[question.id]"
        type="text"
        maxlength="2000"
        class="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm outline-none focus:border-white/40 disabled:opacity-60"
        :disabled="!editable || busy"
      />
    </label>
    <button
      v-if="editable"
      type="submit"
      class="rounded-full px-5 py-2 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
      :style="{ background: accent, color: '#0b1120' }"
      :disabled="busy"
    >
      Сохранить ответы
    </button>
  </form>
  <p v-else class="text-sm opacity-50">Организатор ещё не добавил вопросы</p>
</template>
