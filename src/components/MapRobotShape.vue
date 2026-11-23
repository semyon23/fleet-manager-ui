<script setup>
defineProps({
  length: { type: Number, required: true },
  color: { type: String, required: true },
  rotate: { type: Number, required: true },
  selected: Boolean,
  detailed: Boolean,
})

// Нос смотрит по +X. Длина корпуса в координатах рисунка — от −31 до +31.
const BODY_LENGTH = 62
</script>

<template>
  <g :transform="`rotate(${rotate}) scale(${length / BODY_LENGTH})`">
    <path v-if="selected" d="M-37-17v-10h10M27-27h10v10M37 17v10H27M-27 27h-10V17"
          fill="none" class="selection-corners stroke-[#173f52] dark:stroke-[#d5f2ff]" stroke-width="2.8" stroke-linecap="round" />
    <g fill="#28343d" stroke="#deeaeb" stroke-width="1.6">
      <rect x="-15" y="-25" width="25" height="9" rx="3" />
      <rect x="-15" y="16" width="25" height="9" rx="3" />
    </g>
    <path d="M-31-16Q-31-20-26-20H19L31-12V12L19 20H-26Q-31 20-31 16Z"
          fill="#263842" stroke="#f3f8f8" stroke-width="2.6" stroke-linejoin="round" />
    <path d="M-26-14Q-26-16-23-16H9L15-10V10L9 16H-23Q-26 16-26 14Z" fill="#d8e5e6" />
    <path d="M-24-16H-17V16H-24Q-27 16-27 13V-13Q-27-16-24-16Z" :fill="color" />
    <path d="M-12-10H5L10-6V6L5 10H-12Z" fill="#b4c8ca" />
    <path d="M17-6L24 0L17 6" fill="none" stroke="#fff" stroke-width="3.4"
          stroke-linecap="round" stroke-linejoin="round" />
    <g v-if="detailed">
      <path d="M-8-5H3M-8-1H3M-8 3H0" stroke="#8aa5a9" stroke-width="1.5" stroke-linecap="round" />
      <g fill="#83999c">
        <circle cx="-12" cy="-13" r="1" />
        <circle cx="-12" cy="13" r="1" />
      </g>
    </g>
  </g>
</template>
