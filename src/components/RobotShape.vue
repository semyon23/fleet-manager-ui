<script setup>
// Робот, вид сверху, центр в (0, 0), нос — по +x до поворота. Тот же AMR с дифференциальным приводом,
// что на заставке (public/splash/robot.svg): корпус, два ведущих колеса по бокам, опорные колёса по углам,
// лидар спереди. Корпус у всех один; состояние — цветная полоса на корме.
// Рисуется внутри чужого <svg>: на Live Map (размер в пикселях карты) и в RobotIcon (таблицы, карточки).
import { computed } from 'vue'

const props = defineProps({
  length: { type: Number, required: true },   // вдоль хода; рисунок масштабируется по длине
  width: { type: Number, default: 0 },        // не нужен: пропорции — как у робота с заставки
  look: { type: Object, required: true },     // robotLook(robot): color — цвет полосы состояния
  rotate: { type: Number, default: 0 },       // градусы SVG
  selected: { type: Boolean, default: false },
})

// Рисунок заставки: корпус 68 x 44, с колёсами 68 x 58 единиц
const DRAWING_LENGTH = 68
const scale = computed(() => props.length / DRAWING_LENGTH)
</script>

<template>
  <g>
    <circle v-if="selected" :r="40 * scale" fill="#3b82f6" fill-opacity="0.12" stroke="#3b82f6" :stroke-width="3 * scale" />
    <g :transform="`rotate(${rotate}) scale(${scale})`">
      <!-- Ведущие колёса: светлый обод и протектор — читаются и на тёмном фоне -->
      <g fill="#334155" stroke="#cbd5e1" stroke-width="1.5">
        <rect x="-11" y="-29" width="22" height="9" rx="3" />
        <rect x="-11" y="20" width="22" height="9" rx="3" />
      </g>
      <g stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round">
        <path d="M-6 -27V-22M0 -27V-22M6 -27V-22" />
        <path d="M-6 22V27M0 22V27M6 22V27" />
      </g>
      <rect x="-34" y="-22" width="68" height="44" rx="10" fill="#e2e8f0" stroke="#0f766e" stroke-width="3" />
      <!-- Опорные колёса по углам -->
      <g fill="#94a3b8" stroke="#64748b" stroke-width="1">
        <circle cx="-27" cy="-15" r="3" />
        <circle cx="-27" cy="15" r="3" />
        <circle cx="27" cy="-15" r="3" />
        <circle cx="27" cy="15" r="3" />
      </g>
      <!-- Полоса состояния на корме -->
      <rect x="-31" y="-19" width="8" height="38" rx="2" :fill="look.color" />
      <rect x="-20" y="-8" width="26" height="16" rx="3" fill="#cbd5e1" />
      <!-- Лидар — нос робота -->
      <circle cx="20" cy="0" r="7" fill="#2d3748" />
      <circle cx="20" cy="0" r="3" fill="#4fd1c5" />
    </g>
  </g>
</template>
