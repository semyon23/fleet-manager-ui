<script setup>
defineProps({
  length: { type: Number, required: true },
  color: { type: String, required: true },
  rotate: { type: Number, required: true },
  selected: Boolean,
  detailed: Boolean,
  loaded: Boolean,
  driving: Boolean,
})

// Нос смотрит по +X; рамка выбора не входит в габарит корпуса.
const BODY_LENGTH = 76
</script>

<template>
  <g :transform="`rotate(${rotate}) scale(${length / BODY_LENGTH})`">
    <path v-if="selected" class="selection-corners stroke-[#247233] dark:stroke-[#96df85]"
          d="M-41-19v-10h10M31-29h10v10M41 19v10H31M-31 29h-10V19"
          fill="none" stroke-width="1.7" vector-effect="non-scaling-stroke" />
    <g class="robot-chassis">
      <path d="M-34-23Q-38-19-38 0T-34 23Q-31 26-25 26H25Q31 26 34 23Q38 19 38 0T34-23Q31-26 25-26H-25Q-31-26-34-23Z"
            fill="#305df4" />
      <path d="M-28-23Q-24-26-18-26H18Q26-26 29-22Q34-16 34 0T29 22Q26 26 18 26H-18Q-25 26-29 22Q-34 16-34 0T-28-23Z"
            fill="#2c2d2f" />
      <path d="M34-3h3v6h-3Z" fill="#163caf" />
      <path class="robot-status-light" d="M-37-3h3v6h-3Z" :fill="color" />
    </g>
    <g v-if="loaded" class="robot-load">
      <rect x="-19" y="-18" width="35" height="36" rx="2" fill="#a77930" />
      <rect x="-18" y="-18" width="34" height="34" rx="2" fill="#efc36d" />
      <path d="M-4-17H1V15H-4Z" fill="#dfad57" />
      <path v-if="detailed" d="M-1-8V9M-9 0H7" fill="none" stroke="#a47b41" stroke-width="1" />
    </g>
    <g v-else class="robot-hub">
      <circle cx="-1" cy="0" r="7.5" fill="#656668" />
      <circle v-if="detailed" cx="-1" cy="0" r="11.8" fill="none" stroke="#656668"
              stroke-width="1.5" stroke-linecap="round" stroke-dasharray=".5 8.8" />
    </g>
    <path class="robot-heading" d="M17-8L28 0L17 8Z" :fill="driving ? '#94e87d' : '#f7f8f9'" />
  </g>
</template>
