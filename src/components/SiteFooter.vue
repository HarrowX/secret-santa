<script setup>
defineProps({
  accent: String,
  isDay: Boolean,
})
</script>

<template>
  <footer
    class="mt-10 border-t"
    :class="isDay ? 'border-slate-900/10 bg-white/30' : 'border-white/10 bg-slate-950/25'"
  >
    <div class="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <p class="text-lg font-black tracking-tight">тайный санта<span :style="{ color: accent }">.</span></p>
        <p class="mt-3 max-w-xs text-sm leading-relaxed opacity-60">Праздник начинается с маленькой тайны.</p>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest opacity-60">Игра</p>
        <div class="mt-3 grid gap-2 text-sm opacity-75">
          <RouterLink to="/" class="hover:underline">Создать игру</RouterLink>
          <RouterLink to="/randomizer" class="hover:underline">Быстрая жеребьёвка</RouterLink>
          <RouterLink to="/my" class="hover:underline">Мои игры</RouterLink>
        </div>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest opacity-60">Форматы</p>
        <div class="mt-3 grid gap-2 text-sm opacity-75">
          <span>Друзьям</span>
          <span>Коллегам</span>
          <span>Семье</span>
          <span>Классу</span>
          <span>Белому слону</span>
        </div>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest opacity-60">Помощь</p>
        <div class="mt-3 grid gap-2 text-sm opacity-75">
          <RouterLink to="/faq" class="hover:underline">Частые вопросы</RouterLink>
          <RouterLink to="/support" class="hover:underline">Написать в поддержку</RouterLink>
          <RouterLink to="/terms" class="hover:underline">Условия</RouterLink>
          <RouterLink to="/privacy" class="hover:underline">Приватность</RouterLink>
        </div>
      </div>
    </div>
    <div class="border-t border-white/10 px-5 py-5 text-center text-xs opacity-50">© 2014–2026 Тайный Санта · дизайн-прототип</div>
  </footer>
</template>
