<script setup>
// Робот, вид сверху, центр в (0, 0), нос — по +x до поворота. Рисуется внутри чужого <svg>:
// на Live Map (размер в пикселях карты) и в RobotIcon (таблицы, карточки).
import { computed } from 'vue'

const props = defineProps({
  length: { type: Number, required: true },   // вдоль хода
  width: { type: Number, required: true },
  look: { type: Object, required: true },     // robotLook(robot)
  rotate: { type: Number, default: 0 },       // градусы SVG
  selected: { type: Boolean, default: false },
})

const g = computed(() => {
  const l = props.length
  const w = props.width
  const stroke = Math.max(0.6, w * 0.07)
  return {
    l, w, stroke,
    x: -l / 2, y: -w / 2,
    radius: w * 0.14,
    bumper: Math.max(1, l * 0.08),
    bumperX: l / 2 - Math.max(1, l * 0.08) / 2 - stroke / 2,
    chevron: `${-l * 0.08},${-w * 0.24} ${l * 0.1},0 ${-l * 0.08},${w * 0.24}`,
    bar: { w: l * 0.07, h: w * 0.42, gap: l * 0.08 },
    pad: Math.max(1.5, w * 0.18),
    badge: Math.max(2.5, w * 0.22),
    reach: Math.hypot(l, w) / 2,
  }
})
</script>

<template>
  <g>
    <rect v-if="selected"
          :x="g.x - g.pad" :y="g.y - g.pad" :width="g.l + 2 * g.pad" :height="g.w + 2 * g.pad"
          :transform="`rotate(${rotate})`" :rx="g.radius + g.pad"
          fill="none" :stroke="look.color" :stroke-width="g.stroke * 0.8" :stroke-dasharray="`${g.stroke * 2} ${g.stroke * 2}`" />
    <g :transform="`rotate(${rotate})`">
      <rect :x="g.x" :y="g.y" :width="g.l" :height="g.w" :rx="g.radius"
            :fill="look.color" fill-opacity="0.22" :stroke="look.color" :stroke-width="g.stroke"
            :stroke-dasharray="look.dashed ? `${g.stroke * 2.5} ${g.stroke * 2}` : null" />
      <template v-if="!look.dashed">
        <line :x1="g.bumperX" :y1="g.y + g.w * 0.14" :x2="g.bumperX" :y2="-g.y - g.w * 0.14"
              :stroke="look.color" :stroke-width="g.bumper" stroke-linecap="round" />
      </template>
      <g v-if="look.mark === 'pause'" :fill="look.color">
        <rect :x="-g.bar.gap / 2 - g.bar.w" :y="-g.bar.h / 2" :width="g.bar.w" :height="g.bar.h" />
        <rect :x="g.bar.gap / 2" :y="-g.bar.h / 2" :width="g.bar.w" :height="g.bar.h" />
      </g>
      <polyline v-else :points="g.chevron" fill="none" :stroke="look.color" :stroke-width="g.stroke * 1.2"
                stroke-linecap="round" stroke-linejoin="round" />
    </g>
    <!-- Значок ошибки не поворачивается вместе с роботом: «!» всегда читается -->
    <g v-if="look.mark === 'error'" :transform="`translate(${g.reach * 0.7} ${-g.reach * 0.7})`">
      <circle :r="g.badge" fill="#ef4444" stroke="#ffffff" :stroke-width="g.stroke * 0.6" />
      <text y="0" text-anchor="middle" dominant-baseline="central" :font-size="g.badge * 1.4"
            font-weight="700" font-family="system-ui, sans-serif" fill="#ffffff">!</text>
    </g>
  </g>
</template>
