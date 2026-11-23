<script setup>
defineProps({
  length: { type: Number, required: true },
  color: { type: String, required: true },
  rotate: { type: Number, required: true },
  selected: Boolean,
  detailed: Boolean,
  loaded: Boolean,
})

// Нос смотрит по +X. Длина корпуса в координатах рисунка — от −31 до +31.
const BODY_LENGTH = 62
</script>

<template>
  <g :transform="`rotate(${rotate}) scale(${length / BODY_LENGTH})`">
    <path v-if="selected" d="M-37-17v-10h10M27-27h10v10M37 17v10H27M-27 27h-10V17"
          fill="none" class="selection-corners stroke-[#173f52] dark:stroke-[#d5f2ff]" stroke-width="2.8" stroke-linecap="round" />
    <g fill="#1c252d" stroke="#d3dade" stroke-width="1.4">
      <rect x="-10" y="-23" width="20" height="7" rx="2" />
      <rect x="-10" y="16" width="20" height="7" rx="2" />
    </g>
    <path d="M-31-13L-25-19H23L31-12V12L23 19H-25L-31 13Z"
          fill="#29353e" stroke="#f0f4f6" stroke-width="2.4" stroke-linejoin="round" />
    <rect x="-19" y="-14" width="33" height="28" rx="3" fill="#44515b" />
    <path d="M-28-11L-24-15H-22V15H-24L-28 11Z" :fill="color" />
    <g v-if="loaded" class="robot-load">
      <rect x="-18" y="-14" width="31" height="28" rx="2" fill="#e9b469" stroke="#362d25" stroke-width="2" />
      <path d="M-8-12V12M3-12V12" fill="none" stroke="#99632e" stroke-width="2.5" />
      <path v-if="detailed" d="M-15-10V10M10-10V10" stroke="#f8d39b" stroke-width="1.5" />
    </g>
    <path d="M17-6L25 0L17 6" fill="none" stroke="#f5f8fa" stroke-width="3.3"
          stroke-linecap="round" stroke-linejoin="round" />
  </g>
</template>
