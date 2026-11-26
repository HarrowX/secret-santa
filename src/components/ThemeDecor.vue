<script setup>
import { computed } from 'vue'

const props = defineProps({
  themeId: { type: String, default: 'winter' },
  accent: { type: String, default: '#8ec5ff' },
  compact: { type: Boolean, default: false },
})

const motifs = ['winter', 'halloween', 'alpine', 'egypt', 'pixel', 'sakura', 'space', 'cyberpunk', 'valley', 'tropical']

const motif = computed(() => (motifs.includes(props.themeId) ? props.themeId : 'winter'))
</script>

<template>
  <div
    class="theme-decor"
    :class="[`theme-decor--${motif}`, { 'theme-decor--compact': compact }]"
    :style="{ '--decor-color': accent }"
    aria-hidden="true"
  >
    <svg
      v-if="motif === 'winter'"
      class="theme-decor__scene"
      viewBox="0 0 240 140"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <g stroke-width="2" opacity=".75">
        <path d="M42 20v34M25 28.5l34 17M59 28.5l-34 17" />
        <path d="m42 20-6 6m6-6 6 6m-6 34-6-6m6 6 6-6M25 28.5l8-1m-8 1 2 8m32-8-8-1m8 1-2 8" />
        <path d="M92 62v24M80 68l24 12M104 68l-24 12" />
        <path d="m92 62-4 4m4-4 4 4m-4 20-4-4m4 4 4-4M80 68l6-1m-6 1 1 6m23-6-6-1m6 1-1 6" />
      </g>
      <g fill="currentColor" stroke="none" opacity=".45">
        <rect x="146" y="66" width="54" height="46" rx="6" />
        <path d="M138 66h70v11h-70z" />
        <path d="M170 66c-2-10 4-18 11-18s13 8 11 18h-8c1-6-1-10-3-10s-4 4-3 10z" />
      </g>
      <g fill="currentColor" stroke="none" opacity=".6">
        <circle cx="122" cy="24" r="3" />
        <circle cx="206" cy="34" r="2" />
        <circle cx="74" cy="110" r="2" />
      </g>
    </svg>

    <svg
      v-else-if="motif === 'halloween'"
      class="theme-decor__scene"
      viewBox="0 0 240 140"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        d="M30 116V78c0-22 10-38 26-38s26 16 26 38v38l-9-8-9 8-8-8-8 8-9-8-9 8z"
        fill="currentColor"
        fill-opacity=".35"
      />
      <path d="M45 76h6m16 0h6" stroke-width="3" />
      <path d="M165 116c-20 0-34-15-34-34s14-32 34-32 34 13 34 32-14 34-34 34z" fill="currentColor" fill-opacity=".4" />
      <path d="M163 51c-4-9 3-14 8-8 5-6 12-1 8 8" stroke-width="3" />
      <path d="M149 80l10-7 10 7 10-7 10 7" stroke-width="2" opacity=".7" />
      <path d="M105 34c8 4 12 4 20 0m-16 12c10 5 18 5 28 0" stroke-width="2" opacity=".65" />
    </svg>

    <svg
      v-else-if="motif === 'alpine'"
      class="theme-decor__scene"
      viewBox="0 0 240 140"
      fill="none"
      stroke="currentColor"
      stroke-linejoin="round"
    >
      <path d="M8 126 78 34l54 70 32-40 68 62z" fill="currentColor" fill-opacity=".25" stroke-width="2" />
      <path d="m78 34 22 29-12-4-10 9-11-9-11 4z" fill="currentColor" fill-opacity=".6" stroke="none" />
      <path d="m164 64 18 22-11-4-7 6-9-6-9 4z" fill="currentColor" fill-opacity=".45" stroke="none" />
      <path d="M20 108h200" stroke-width="2" opacity=".6" />
      <path d="M92 126v-22m-8 22 8-22 8 22" stroke-width="2" opacity=".55" />
    </svg>

    <svg
      v-else-if="motif === 'egypt'"
      class="theme-decor__scene"
      viewBox="0 0 240 140"
      fill="none"
      stroke="currentColor"
      stroke-linejoin="round"
    >
      <circle cx="182" cy="36" r="18" fill="currentColor" fill-opacity=".35" stroke="none" />
      <path d="M12 124 82 38l70 86z" fill="currentColor" fill-opacity=".25" stroke-width="2" />
      <path d="M84 124 132 60l48 64z" fill="currentColor" fill-opacity=".35" stroke-width="2" />
      <path d="m82 38 26 32H56z" fill="currentColor" fill-opacity=".55" stroke="none" />
      <path d="M132 60l20 26h-40z" fill="currentColor" fill-opacity=".5" stroke="none" />
      <path d="M22 124h196" stroke-width="2" opacity=".6" />
    </svg>

    <svg
      v-else-if="motif === 'pixel'"
      class="theme-decor__scene"
      viewBox="0 0 240 140"
      fill="currentColor"
      stroke="none"
    >
      <path d="M28 32h28v28H28zM64 32h28v28H64zM28 68h28v28H28zM100 68h28v28h-28z" opacity=".45" />
      <path d="M64 68h28v28H64zM136 32h28v28h-28zM172 68h28v28h-28z" opacity=".25" />
      <path d="M100 32h28v28h-28zM136 68h28v28h-28zM172 32h28v28h-28z" opacity=".6" />
      <path d="M208 104h12v12h-12zM16 104h12v12H16z" opacity=".7" />
    </svg>

    <svg
      v-else-if="motif === 'sakura'"
      class="theme-decor__scene"
      viewBox="0 0 240 140"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
    >
      <g fill="currentColor" fill-opacity=".42" stroke="none">
        <ellipse cx="42" cy="40" rx="18" ry="9" transform="rotate(35 42 40)" />
        <ellipse cx="88" cy="84" rx="18" ry="9" transform="rotate(-25 88 84)" />
        <ellipse cx="150" cy="34" rx="18" ry="9" transform="rotate(60 150 34)" />
        <ellipse cx="196" cy="92" rx="18" ry="9" transform="rotate(-40 196 92)" />
        <ellipse cx="122" cy="118" rx="18" ry="9" transform="rotate(20 122 118)" />
      </g>
      <path d="M24 120c34-14 62-10 86 0m40-8c28-12 58-10 82 2" stroke-width="2" opacity=".55" />
    </svg>

    <svg
      v-else-if="motif === 'space'"
      class="theme-decor__scene"
      viewBox="0 0 240 140"
      fill="none"
      stroke="currentColor"
    >
      <circle cx="140" cy="70" r="36" fill="currentColor" fill-opacity=".3" stroke="none" />
      <ellipse cx="140" cy="70" rx="60" ry="18" transform="rotate(-18 140 70)" stroke-width="3" opacity=".7" />
      <g fill="currentColor" stroke="none" opacity=".75">
        <path d="m36 28 3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
        <path d="m210 30 2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
        <circle cx="60" cy="106" r="3" />
        <circle cx="206" cy="112" r="2" />
        <circle cx="100" cy="26" r="2" />
      </g>
    </svg>

    <svg
      v-else-if="motif === 'cyberpunk'"
      class="theme-decor__scene"
      viewBox="0 0 240 140"
      fill="none"
      stroke="currentColor"
    >
      <circle cx="94" cy="52" r="30" stroke-width="3" opacity=".65" />
      <circle cx="154" cy="86" r="22" stroke-width="3" opacity=".45" />
      <path d="M0 124h240M0 112h240M0 100h240M0 88h240M0 76h240" stroke-width="1" opacity=".35" />
      <path d="M40 140 116 68m40 72 76-72m-152 72L4 68" stroke-width="1" opacity=".3" />
      <path d="M188 28h28v28h-28z" stroke-width="2" opacity=".7" />
    </svg>

    <svg
      v-else-if="motif === 'valley'"
      class="theme-decor__scene"
      viewBox="0 0 240 140"
      fill="none"
      stroke="currentColor"
      stroke-linejoin="round"
    >
      <path d="M0 126c40-32 72-32 112 0 40-32 76-32 128 0z" fill="currentColor" fill-opacity=".22" stroke="none" />
      <path d="M48 118V58m-18 34 18-34 18 34M48 72l-14 18m14-18 14 18" stroke-width="2" opacity=".7" />
      <path d="M154 120V50m-20 40 20-40 20 40M154 64l-16 22m16-22 16 22" stroke-width="2" opacity=".55" />
      <path d="M0 126h240" stroke-width="2" opacity=".5" />
    </svg>

    <svg
      v-else
      class="theme-decor__scene"
      viewBox="0 0 240 140"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
    >
      <circle cx="184" cy="44" r="22" fill="currentColor" fill-opacity=".4" stroke="none" />
      <path d="M30 128c8-34 30-56 64-66" stroke-width="3" opacity=".7" />
      <path
        d="M94 62c-22-16-46-14-64 4 24-4 42 2 56 18m8-22c2-24 20-38 44-38-14 18-18 36-12 54m-32 6c22-10 46-6 64 12-24-2-42 6-54 22"
        stroke-width="2"
      />
      <path d="M0 128h240" stroke-width="2" opacity=".5" />
    </svg>
  </div>
</template>
