<script setup>
defineProps({
  color: { type: String, required: true },
  size: { type: String, default: 'medium' },
})
</script>

<template>
  <span class="status-tag" :data-size="size" :style="{ '--status-color': color }">
    <span class="status-dot" aria-hidden="true"></span>
    <slot />
  </span>
</template>

<style scoped>
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: .4em;
  padding: .14em .55em;
  border-radius: 4px;
  background: color-mix(in srgb, var(--status-color) 14%, var(--ui-surface));
  color: var(--ui-text);
  font-size: 14px;
  line-height: 1.45;
  white-space: nowrap;
  vertical-align: middle;
}
.status-tag[data-size="small"] { font-size: 12px; }
.status-tag[data-size="tiny"] { font-size: 11px; }
.status-dot {
  width: .55em;
  height: .55em;
  flex: none;
  border-radius: 50%;
  background: var(--status-color);
}
</style>
