<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  person: {
    type: Object,
    required: true,
  },
  accent: String,
  busy: Boolean,
  receiverName: String,
})

const emit = defineEmits(['save'])

const initials = computed(() =>
  (props.person.name ?? '')
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('ru'),
)

const open = ref(false)
const form = ref({})

watch(
  () => props.person,
  (person) => {
    form.value = {
      name: person.name ?? '',
      email: person.email ?? '',
      wishlist: person.wishlist ?? '',
      address: person.address ?? '',
      notes: person.notes ?? '',
      preferred: person.preferred ?? '',
    }
  },
  { immediate: true, deep: true },
)

function save() {
  emit('save', {
    name: form.value.name,
    email: form.value.email || null,
    wishlist: form.value.wishlist || null,
    address: form.value.address || null,
    notes: form.value.notes || null,
    preferred: form.value.preferred || null,
  })
}
</script>

<template>
  <div class="rounded-xl border border-white/10 bg-white/5">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition hover:bg-white/5"
      @click="open = !open"
    >
      <span class="flex items-center gap-3">
        <span
          class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold"
          :style="{ background: accent, color: '#0b1120' }"
        >{{ initials }}</span>
        <span class="grid text-left">
          <span class="font-semibold">{{ person.name }}</span>
          <span v-if="receiverName" class="text-xs opacity-50">дарит → {{ receiverName }}</span>
        </span>
      </span>
      <span class="flex items-center gap-2 text-xs opacity-60">
        <span v-if="person.filled">участвует</span>
        <span v-else>ожидаем</span>
        <span>{{ open ? '−' : '+' }}</span>
      </span>
    </button>
    <form v-if="open" class="grid gap-2 border-t border-white/10 p-4" @submit.prevent="save">
      <label class="grid gap-1 text-xs">
        <span class="font-semibold uppercase tracking-widest opacity-60">Имя</span>
        <input
          v-model="form.name"
          type="text"
          maxlength="80"
          class="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
        />
      </label>
      <label class="grid gap-1 text-xs">
        <span class="font-semibold uppercase tracking-widest opacity-60">Email</span>
        <input
          v-model="form.email"
          type="email"
          maxlength="160"
          class="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
        />
      </label>
      <label class="grid gap-1 text-xs">
        <span class="font-semibold uppercase tracking-widest opacity-60">Желания</span>
        <textarea
          v-model="form.wishlist"
          rows="2"
          maxlength="2000"
          class="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
        ></textarea>
      </label>
      <label class="grid gap-1 text-xs">
        <span class="font-semibold uppercase tracking-widest opacity-60">Адрес</span>
        <input
          v-model="form.address"
          type="text"
          maxlength="2000"
          class="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
        />
      </label>
      <label class="grid gap-1 text-xs">
        <span class="font-semibold uppercase tracking-widest opacity-60">Желаемые участники</span>
        <input
          v-model="form.preferred"
          type="text"
          maxlength="2000"
          class="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
        />
      </label>
      <label class="grid gap-1 text-xs">
        <span class="font-semibold uppercase tracking-widest opacity-60">Нежелаемые участники</span>
        <input
          type="text"
          readonly
          :value="'Задаётся через исключения'"
          class="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm opacity-50"
        />
      </label>
      <label class="grid gap-1 text-xs">
        <span class="font-semibold uppercase tracking-widest opacity-60">Заметки</span>
        <textarea
          v-model="form.notes"
          rows="2"
          maxlength="2000"
          class="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
        ></textarea>
      </label>
      <button
        type="submit"
        class="rounded-full px-4 py-2 text-xs font-bold transition hover:opacity-80 disabled:opacity-50"
        :style="{ background: accent, color: '#0b1120' }"
        :disabled="busy"
      >
        Сохранить карточку
      </button>
    </form>
  </div>
</template>
