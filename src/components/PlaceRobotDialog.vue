<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NSelect, NInputNumber, NButton, useMessage } from 'naive-ui'
import * as api from '../api'
import { useMapsStore } from '../stores/maps'
import { useRobotsStore } from '../stores/robots'

/**
 * Поставить робота на узел карты (контракт, раздел 5.2, position). Робот после включения не знает,
 * на каком он узле, — оператор говорит это fms, fms шлёт роботу initializePosition с координатами узла.
 */
const props = defineProps({
  robot: { type: Object, default: null },   // робот из stores/robots
  show: { type: Boolean, default: false },
})
const emit = defineEmits(['update:show'])

const maps = useMapsStore()
const robots = useRobotsStore()
const msg = useMessage()

const mapId = ref(null)
const nodeId = ref(null)
const headingDeg = ref(null)   // пусто — ориентация узла, у узла нет — прежняя
const error = ref('')
const submitting = ref(false)

// Открыли: карта робота (pose.mapId), если она есть в fms, иначе первая; узел — тот, где робот стоит
watch(() => props.show, (show) => {
  if (!show) return
  mapId.value = maps.get(props.robot?.mapId) ? props.robot.mapId : maps.maps[0]?.id || null
  nodeId.value = props.robot?.lastNodeId || null
  headingDeg.value = null
  error.value = ''
})

watch(mapId, (id) => {
  if (id) maps.open(id).catch((e) => { error.value = `Map ${id} is not loaded: ${e.message}` })
})

const mapOptions = computed(() =>
  maps.maps.map((m) => ({ label: m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id, value: m.id })),
)
const map = computed(() => {
  const m = mapId.value ? maps.get(mapId.value) : null
  return m?.full ? m : null
})
// Узлы графа — waypoints и станции
const nodeOptions = computed(() => {
  if (!map.value) return []
  const label = (n) => (n.name && n.name !== n.id ? `${n.name} (${n.id})` : n.id)
  return [
    ...(map.value.waypoints || []).map((n) => ({ label: label(n), value: n.id })),
    ...(map.value.stations || []).map((n) => ({ label: `${label(n)} · station`, value: n.id })),
  ]
})
// Узел не с этой карты — сбросить
watch(nodeOptions, (options) => {
  if (nodeId.value && options.length && !options.some((o) => o.value === nodeId.value)) nodeId.value = null
})

function errorText(e) {
  if (e?.code === 'NETWORK') return 'No connection to the server'
  if (e?.code === 'TIMEOUT') return 'The server is not responding'
  if (e?.code === 'UNAVAILABLE') return 'fms is not ready yet (loading maps), try again in a few seconds'
  if (e?.code === 'INVALID_INPUT' && e.details && Object.keys(e.details).length) return Object.values(e.details).join('; ')
  return e?.message || 'Failed to send the position'
}

async function submit() {
  error.value = ''
  submitting.value = true
  try {
    const theta = headingDeg.value === null ? undefined : (headingDeg.value * Math.PI) / 180
    await api.robots.setPosition(props.robot.id, { mapId: mapId.value, nodeId: nodeId.value, theta })
    msg.success(`Position sent to "${props.robot.id}"`)
    emit('update:show', false)
    // Ответ — «команда отправлена»; новое положение робот пришлёт в следующем state
    setTimeout(() => robots.pollOnce(), 1000)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="robot ? `Place ${robot.id} on a node` : 'Place robot on a node'"
    style="width: 440px"
    :bordered="false"
    :segmented="{ content: 'soft' }"
    @update:show="(value) => emit('update:show', value)"
  >
    <div class="flex flex-col gap-4">
      <div class="rounded bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-400">
        Tell fms which node the robot is standing on. The robot takes the node's coordinates as its position,
        so it must really be there.
      </div>

      <label class="text-sm text-slate-600 dark:text-slate-400">
        Map
        <NSelect v-model:value="mapId" :options="mapOptions" placeholder="No maps in fms" class="mt-1" />
      </label>
      <div v-if="robot?.mapId && robot.mapId !== mapId" class="-mt-2 text-xs text-amber-600">
        The robot reports map {{ robot.mapId }}: the robot must have this map too.
      </div>
      <div v-if="map?.dirty" class="-mt-2 text-xs text-amber-600">
        This map has unsaved changes: fms uses the saved version.
      </div>

      <label class="text-sm text-slate-600 dark:text-slate-400">
        Node
        <NSelect v-model:value="nodeId" :options="nodeOptions" filterable placeholder="Select a node" class="mt-1"
                 :loading="!!mapId && !map" />
      </label>

      <label class="text-sm text-slate-600 dark:text-slate-400">
        Heading, ° <span class="text-slate-400 text-xs">(optional: the node's heading, otherwise the current one)</span>
        <NInputNumber v-model:value="headingDeg" :min="-180" :max="180" clearable placeholder="auto" class="mt-1" />
      </label>

      <div v-if="error" class="text-sm text-rose-600">{{ error }}</div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <NButton :disabled="submitting" @click="emit('update:show', false)">Cancel</NButton>
        <NButton type="primary" :loading="submitting" :disabled="!mapId || !nodeId" @click="submit">Place</NButton>
      </div>
    </template>
  </NModal>
</template>
