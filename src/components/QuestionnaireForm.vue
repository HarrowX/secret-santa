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
const errors = ref({})

function toArray(value) {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

watch(
  () => [props.questions, props.answers],
  () => {
    const next = {}
    for (const answer of props.answers) next[answer.question_id] = answer.value ?? ''
    for (const question of props.questions) {
      if (next[question.id] === undefined) next[question.id] = question.type === 'multi' ? [] : ''
      else if (question.type === 'multi') next[question.id] = toArray(next[question.id])
      else if (Array.isArray(next[question.id])) next[question.id] = next[question.id].join(', ')
    }
    values.value = next
    errors.value = {}
  },
  { immediate: true, deep: true },
)

function options(question) {
  return Array.isArray(question.options) ? question.options.map(String) : []
}

function questionLabel(question) {
  return `${question.title}${question.required ? ' (обязательно)' : ''}`
}

function checked(questionId, option) {
  return toArray(values.value[questionId]).includes(option)
}

function toggle(questionId, option) {
  const current = toArray(values.value[questionId])
  values.value[questionId] = current.includes(option) ? current.filter((item) => item !== option) : [...current, option]
  delete errors.value[questionId]
}

function isEmpty(question) {
  if (question.type === 'multi') return !toArray(values.value[question.id]).length
  return !String(values.value[question.id] ?? '').trim()
}

function validate() {
  const next = {}
  for (const question of props.questions) {
    if (question.required && isEmpty(question)) next[question.id] = 'Ответьте на обязательный вопрос'
  }
  errors.value = next
  return !Object.keys(next).length
}

function save() {
  if (!props.editable || props.busy || !validate()) return
  emit(
    'save',
    props.questions.map((question) => ({
      questionId: question.id,
      value:
        question.type === 'multi'
          ? toArray(values.value[question.id]).join(', ')
          : String(values.value[question.id] ?? ''),
    })),
  )
}
</script>

<template>
  <form v-if="questions.length" class="grid gap-3" @submit.prevent="save">
    <div v-for="question in questions" :key="question.id" class="grid gap-1 text-sm">
      <label v-if="question.type !== 'multi'" :for="`question-${question.id}`" class="font-semibold">{{
        questionLabel(question)
      }}</label>
      <span v-if="question.hint" class="text-xs opacity-50">{{ question.hint }}</span>
      <span v-if="['single', 'multi'].includes(question.type)" class="text-xs opacity-50">
        Выберите подходящий вариант
      </span>

      <input
        v-if="question.type === 'number'"
        :id="`question-${question.id}`"
        v-model="values[question.id]"
        type="number"
        :aria-invalid="Boolean(errors[question.id])"
        class="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm outline-none focus:border-white/40 disabled:opacity-60"
        :class="errors[question.id] ? 'border-rose-400' : ''"
        :disabled="!editable || busy"
      />
      <select
        v-else-if="question.type === 'boolean'"
        :id="`question-${question.id}`"
        v-model="values[question.id]"
        :aria-invalid="Boolean(errors[question.id])"
        class="rounded-xl border border-white/15 px-4 py-2 text-sm outline-none focus:border-white/40 disabled:opacity-60"
        :class="errors[question.id] ? 'border-rose-400' : ''"
        :disabled="!editable || busy"
      >
        <option value="">Не выбрано</option>
        <option value="да">Да</option>
        <option value="нет">Нет</option>
      </select>
      <select
        v-else-if="question.type === 'single'"
        :id="`question-${question.id}`"
        v-model="values[question.id]"
        :aria-invalid="Boolean(errors[question.id])"
        class="rounded-xl border border-white/15 px-4 py-2 text-sm outline-none focus:border-white/40 disabled:opacity-60"
        :class="errors[question.id] ? 'border-rose-400' : ''"
        :disabled="!editable || busy"
      >
        <option value="">Не выбрано</option>
        <option v-for="option in options(question)" :key="option" :value="option">{{ option }}</option>
      </select>
      <fieldset
        v-else-if="question.type === 'multi'"
        role="group"
        class="flex flex-wrap gap-2 rounded-xl border border-white/10 p-2"
      >
        <legend class="font-semibold">{{ questionLabel(question) }}</legend>
        <label
          v-for="option in options(question)"
          :key="option"
          class="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs transition"
          :class="checked(question.id, option) ? 'border-transparent' : 'border-white/20 opacity-70'"
          :style="checked(question.id, option) ? { background: accent, color: '#0b1120' } : {}"
        >
          <input
            type="checkbox"
            class="h-3.5 w-3.5"
            :checked="checked(question.id, option)"
            :disabled="!editable || busy"
            @change="toggle(question.id, option)"
          />
          {{ option }}
        </label>
        <span v-if="!options(question).length" class="text-xs opacity-50">Варианты не заданы</span>
      </fieldset>
      <input
        v-else
        :id="`question-${question.id}`"
        v-model="values[question.id]"
        type="text"
        maxlength="2000"
        :aria-invalid="Boolean(errors[question.id])"
        class="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm outline-none placeholder:text-current/40 focus:border-white/40 disabled:opacity-60"
        :class="errors[question.id] ? 'border-rose-400' : ''"
        :disabled="!editable || busy"
      />
      <p v-if="errors[question.id]" role="alert" class="text-xs text-rose-300">{{ errors[question.id] }}</p>
    </div>
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
