<script setup>
import { formatEventTime } from '../lib/journal'

defineProps({ at: { type: String, required: true } })
</script>

<template>
  <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
    <time :datetime="at" class="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-(color:--ui-muted)">
      {{ formatEventTime(at) }}
    </time>
    <div class="min-w-0 flex-[1_1_16rem] wrap-anywhere">
      <slot />
    </div>
  </div>
</template>
