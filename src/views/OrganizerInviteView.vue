<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ensureSession } from '../lib/api'

const route = useRoute()
const router = useRouter()
const error = ref('')
const loading = ref(true)

onMounted(async () => {
  try {
    await ensureSession()
    const game = await api.organizerInvites.accept(route.params.token)
    await router.replace(`/game/${game.token}`)
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="mx-auto grid min-h-screen max-w-xl place-items-center px-4 py-10">
    <div class="w-full rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
      <h1 class="text-2xl font-black">Приглашение организатора</h1>
      <p v-if="loading" class="mt-3 text-sm opacity-60">Принимаем приглашение…</p>
      <p v-else-if="error" class="mt-3 text-sm text-rose-300">{{ error }}</p>
      <p v-else class="mt-3 text-sm opacity-60">Готово</p>
      <RouterLink v-if="error" to="/my" class="mt-5 inline-block text-sm underline">В мои игры</RouterLink>
    </div>
  </section>
</template>
