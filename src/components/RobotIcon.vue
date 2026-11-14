<script setup>
// Значок робота для таблиц и карточек — тот же вид сверху, что на Live Map, носом вправо
import { computed } from 'vue'
import RobotShape from './RobotShape.vue'
import { robotLook, DEFAULT_FOOTPRINT } from '../lib/robotLook'

const props = defineProps({
  robot: { type: Object, default: null },
  size: { type: Number, default: 40 },   // px
})

const look = computed(() => robotLook(props.robot))
const length = 30
const width = (length * DEFAULT_FOOTPRINT.width) / DEFAULT_FOOTPRINT.length
</script>

<template>
  <svg :width="size" :height="size" viewBox="-20 -20 40 40" role="img" :aria-label="`${robot?.id || 'robot'}: ${look.label}`">
    <RobotShape :length="length" :width="width" :look="look" />
  </svg>
</template>
