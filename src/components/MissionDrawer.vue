<script setup>
// Карточка миссии: состояние, времена, шаги с действиями и история (контракт 7.3).
// Пока миссия не завершена — опрос раз в 3 с (9.1); завершённая больше не меняется.
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { NDrawer, NDrawerContent, NButton, NPopconfirm, NEmpty, useMessage } from 'naive-ui'
import FleetStatusTag from './FleetStatusTag.vue'
import * as api from '../api'
import {
  PRIORITIES, stateOf, isFinished, canCancel, timingOf, formatDuration, formatEvent,
} from '../lib/missions'

const props = defineProps({
  missionId: { type: String, default: null },
  show: { type: Boolean, default: false },
})
const emit = defineEmits(['update:show', 'changed'])
const msg = useMessage()

const mission = ref(null)
const events = ref([])
const error = ref(null)
const now = ref(Date.now())
let pending = null

async function load() {
  const id = props.missionId
  if (!props.show || !id || pending || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
  const request = Symbol()
  pending = request
  try {
    const [m, e] = await Promise.all([
      api.missions.getMission(id),
      api.missions.listMissionEvents(id),
    ])
    if (pending !== request) return
    mission.value = m
    events.value = e
    now.value = Date.now()
    error.value = null
    if (isFinished(m)) stop()
  } catch (e) {
    if (pending === request) error.value = e?.status === 404 ? `Mission ${id} not found` : (e?.message || 'Failed to load the mission')
  } finally {
    if (pending === request) pending = null
  }
}

let timer = null
function stop() { if (timer) { clearInterval(timer); timer = null } }
watch(() => [props.show, props.missionId], ([show]) => {
  stop()
  pending = null
  error.value = null
  mission.value = null
  events.value = []
  if (!show) return
  load()
  timer = setInterval(load, 3000)
}, { immediate: true })
onBeforeUnmount(() => { stop(); pending = null })

const timing = computed(() => (mission.value ? timingOf(mission.value, now.value) : {}))
const time = (iso) => (iso ? new Date(iso).toLocaleString() : '—')
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString() : '')
const lines = computed(() => events.value.map((e) => ({ ...e, ...formatEvent(e, mission.value) })))

const stepColor = { RUNNING: '#3b82f6', COMPLETED: '#22c55e', FAILED: '#ef4444', CANCELED: '#64748b', SKIPPED: '#94a3b8' }

async function cancel() {
  try {
    const result = await api.missions.cancelMission(props.missionId)
    msg.success(result.state === 'CANCELING' ? 'Canceling, waiting for the robot' : 'Mission canceled')
    emit('changed')
    load()
  } catch (e) {
    msg.error(e?.message || 'Failed to cancel the mission')
  }
}
</script>

<template>
  <NDrawer :show="show" :width="480" @update:show="(v) => emit('update:show', v)">
    <NDrawerContent :title="missionId || 'Mission'" closable>
      <div v-if="error" class="rounded bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>
      <div v-else-if="!mission" class="text-sm text-(color:--ui-muted)">Loading…</div>

      <div v-else class="flex flex-col gap-5 text-sm">
        <div class="flex flex-col gap-2">
          <div class="text-base font-medium">{{ mission.name }}</div>
          <div class="flex flex-wrap items-center gap-2">
            <FleetStatusTag size="small" :color="stateOf(mission).color">{{ stateOf(mission).label }}</FleetStatusTag>
            <FleetStatusTag size="small" :color="PRIORITIES[mission.priority].color">{{ PRIORITIES[mission.priority].label }}</FleetStatusTag>
            <NPopconfirm v-if="canCancel(mission)" positive-text="Cancel mission" negative-text="Keep" @positive-click="cancel">
              <template #trigger>
                <NButton size="tiny" type="error" tertiary>Cancel</NButton>
              </template>
              {{ mission.state === 'QUEUED' ? 'Cancel this mission?' : 'The robot will stop the mission. Cancel?' }}
            </NPopconfirm>
          </div>
          <div v-if="mission.error" class="rounded bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            <span class="font-mono">{{ mission.error.code }}</span> — {{ mission.error.message }}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span class="text-(color:--ui-muted)">Robot</span>
          <span class="font-mono">{{ mission.robotId || (mission.requestedRobotId ? `wants ${mission.requestedRobotId}` : '—') }}</span>
          <span class="text-(color:--ui-muted)">Map</span><span class="font-mono">{{ mission.mapId }}</span>
          <span class="text-(color:--ui-muted)">Created</span><span>{{ time(mission.createdAt) }}</span>
          <span class="text-(color:--ui-muted)">Started</span><span>{{ time(mission.startedAt) }}</span>
          <span class="text-(color:--ui-muted)">Finished</span><span>{{ time(mission.finishedAt) }}</span>
          <span class="text-(color:--ui-muted)">Waited</span><span>{{ formatDuration(timing.waited) }}</span>
          <span class="text-(color:--ui-muted)">Ran</span><span>{{ formatDuration(timing.ran) }}</span>
          <span class="text-(color:--ui-muted)">Total</span><span>{{ formatDuration(timing.total) }}</span>
        </div>

        <div>
          <div class="mb-2 text-xs font-medium uppercase tracking-wide text-(color:--ui-muted)">Steps</div>
          <ol class="flex flex-col gap-2">
            <li v-for="(step, i) in mission.steps" :key="i"
                class="rounded border p-2"
                :class="mission.currentStep === i && !isFinished(mission) ? 'border-(--ui-primary)' : 'border-(--ui-border)'">
              <div class="flex items-center justify-between">
                <span><span class="font-mono text-xs text-(color:--ui-muted)">{{ i + 1 }}.</span> <span class="font-mono">{{ step.nodeId }}</span></span>
                <FleetStatusTag size="tiny" :color="stepColor[mission.stepStates[i]?.state] || 'var(--ui-muted)'">
                  {{ mission.stepStates[i]?.state || 'PENDING' }}
                </FleetStatusTag>
              </div>
              <div v-if="mission.stepStates[i]?.startedAt" class="text-[11px] text-(color:--ui-muted)">
                {{ clock(mission.stepStates[i].startedAt) }}
                <template v-if="mission.stepStates[i].finishedAt"> → {{ clock(mission.stepStates[i].finishedAt) }}
                  ({{ formatDuration(Date.parse(mission.stepStates[i].finishedAt) - Date.parse(mission.stepStates[i].startedAt)) }})</template>
              </div>
              <div v-if="mission.stepStates[i]?.waitingForTraffic" class="text-[11px] text-amber-800 dark:text-amber-300">waiting for traffic</div>
              <ul v-if="step.actions.length" class="mt-1 flex flex-col gap-0.5 pl-4 text-xs">
                <li v-for="(a, j) in step.actions" :key="j" class="flex justify-between">
                  <span class="font-mono">{{ a.actionType }}<span class="text-(color:--ui-muted)"> · {{ a.blockingType || 'HARD' }}</span></span>
                  <span class="text-(color:--ui-muted)">{{ mission.stepStates[i]?.actions?.[j]?.status || '' }}</span>
                </li>
              </ul>
            </li>
          </ol>
        </div>

        <div>
          <div class="mb-2 text-xs font-medium uppercase tracking-wide text-(color:--ui-muted)">History</div>
          <NEmpty v-if="!lines.length" size="small" description="No events yet" />
          <ol v-else class="relative ml-1 border-l border-slate-200 dark:border-slate-700">
            <li v-for="line in lines" :key="line.id" class="mb-3 ml-4">
              <span class="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full" :style="{ background: line.color }" />
              <div class="flex items-baseline justify-between gap-2">
                <span class="font-medium">{{ line.title }}</span>
                <span class="shrink-0 font-mono text-[11px] text-(color:--ui-muted)">{{ clock(line.at) }}</span>
              </div>
              <div v-if="line.detail" class="text-xs text-(color:--ui-muted)">{{ line.detail }}</div>
            </li>
          </ol>
        </div>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>
