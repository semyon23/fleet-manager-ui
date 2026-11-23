<script setup>
import { ref, computed, watch, h, onMounted, onBeforeUnmount } from 'vue'
import {
  NCard, NDataTable, NButton, NModal, NInput, NSelect, NEmpty, NPopconfirm, NTabs, NTabPane, useMessage,
} from 'naive-ui'
import FleetStatusTag from '../components/FleetStatusTag.vue'
import { useMapsStore } from '../stores/maps'
import { useRobotsStore } from '../stores/robots'
import ActionListEditor from '../components/editor/ActionListEditor.vue'
import MissionDrawer from '../components/MissionDrawer.vue'
import MissionHistory from '../components/MissionHistory.vue'
import * as api from '../api'
import {
  ACTIVE_STATES, FINISHED_STATES, PRIORITIES, stateOf, canCancel, progressOf,
  toCreateRequest, stepErrors, formErrors,
} from '../lib/missions'

const maps = useMapsStore()
const robots = useRobotsStore()
const msg = useMessage()

// === Списки: активные (все) и последние завершённые — опрос 3 с, пока вкладка видна (контракт 9.1) ===
const active = ref([])
const finished = ref([])
const loadError = ref(null)
const RECENT = 20

async function refresh() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  try {
    const [a, f] = await Promise.all([
      api.missions.listMissions({ state: ACTIVE_STATES.join(','), limit: 200 }),
      api.missions.listMissions({ state: FINISHED_STATES.join(','), limit: RECENT }),
    ])
    active.value = a.items
    finished.value = f.items
    loadError.value = null
  } catch (e) {
    loadError.value = e?.message || 'Failed to load missions'
  }
}
let timer = null
onMounted(() => { refresh(); timer = setInterval(refresh, 3000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

// === Отмена ===
async function cancel(mission) {
  try {
    const result = await api.missions.cancelMission(mission.id)
    msg.success(result.state === 'CANCELING'
      ? `Mission ${mission.id}: canceling, waiting for the robot`
      : `Mission ${mission.id} canceled`)
    refresh()
  } catch (e) {
    msg.error(e?.message || `Failed to cancel ${mission.id}`)
  }
}

// === Карточка миссии ===
const openedId = ref(null)
const showDrawer = ref(false)
function openMission(id) {
  openedId.value = id
  showDrawer.value = true
}

// === Таблицы ===
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString() : '—')
const tag = (meta) => h(FleetStatusTag, { size: 'small', color: meta.color }, { default: () => meta.label })

const commonColumns = [
  {
    title: 'Mission', key: 'id',
    render: (m) => h('button', { class: 'flex flex-col text-left', onClick: () => openMission(m.id) }, [
      h('span', { class: 'font-mono text-xs text-(color:--ui-link) hover:underline' }, m.id),
      h('span', { class: 'text-xs text-(color:--ui-muted)' }, m.name),
    ]),
  },
  { title: 'Priority', key: 'priority', width: 90, render: (m) => tag(PRIORITIES[m.priority] || PRIORITIES.NORMAL) },
  {
    title: 'State', key: 'state', width: 120,
    render: (m) => h('div', { class: 'flex flex-col gap-0.5' }, [
      tag(stateOf(m)),
      m.error ? h('span', { class: 'text-[10px] text-rose-500', title: m.error.message }, m.error.code) : null,
    ]),
  },
  {
    title: 'Robot', key: 'robotId', width: 130,
    render: (m) => h('span', { class: 'font-mono text-xs' },
      m.robotId || (m.requestedRobotId ? `wants ${m.requestedRobotId}` : '—')),
  },
  {
    title: 'Progress', key: 'progress',
    render: (m) => {
      const p = progressOf(m)
      return h('span', { class: 'font-mono text-xs text-(color:--ui-muted)' },
        `${p.done}/${p.total} steps` + (p.nodeId ? ` → ${p.nodeId}` : ''))
    },
  },
]

const activeColumns = [
  ...commonColumns,
  { title: 'Created', key: 'createdAt', width: 100, render: (m) => h('span', { class: 'text-xs' }, time(m.createdAt)) },
  {
    title: '', key: 'actions', width: 90,
    render: (m) => (canCancel(m)
      ? h(NPopconfirm, { onPositiveClick: () => cancel(m), positiveText: 'Cancel mission', negativeText: 'Keep' }, {
        trigger: () => h(NButton, { size: 'tiny', type: 'error', tertiary: true }, { default: () => 'Cancel' }),
        default: () => (m.state === 'QUEUED' ? 'Cancel this mission?' : 'The robot will stop the mission. Cancel?'),
      })
      : null),
  },
]

const finishedColumns = [
  ...commonColumns,
  { title: 'Finished', key: 'finishedAt', width: 100, render: (m) => h('span', { class: 'text-xs' }, time(m.finishedAt)) },
]

// === Мастер создания ===
const showBuilder = ref(false)
const submitting = ref(false)
const showPreview = ref(false)
const errors = ref({ details: {}, message: null })   // ответ fms с ошибкой — что показать в форме

const emptyStep = () => ({ nodeId: null, actions: [] })
const form = ref({ name: '', mapId: null, priority: 'NORMAL', requestedRobotId: null, steps: [emptyStep()] })

async function openBuilder() {
  const mapId = maps.maps[0]?.id || null
  if (mapId) await maps.open(mapId).catch(() => {})   // в списке карт нет узлов
  form.value = { name: '', mapId, priority: 'NORMAL', requestedRobotId: null, steps: [emptyStep()] }
  errors.value = { details: {}, message: null }
  showBuilder.value = true
}

const mapOptions = computed(() => maps.maps.map((m) => ({ label: m.name, value: m.id })))
const currentMap = computed(() => (form.value.mapId ? maps.get(form.value.mapId) : null))
const priorityOptions = Object.entries(PRIORITIES).map(([value, { label }]) => ({ label, value }))

// Узлы шага — waypoints и станции карты (станция без рёбер — через узел взаимодействия, это решает fms)
const nodeOptions = computed(() => {
  const m = currentMap.value
  if (!m) return []
  const label = (n) => (n.name && n.name !== n.id ? `${n.id} · ${n.name}` : n.id)
  return [
    ...(m.waypoints || []).map((n) => ({ label: label(n), value: n.id })),
    ...(m.stations || []).map((n) => ({ label: `${label(n)} (station)`, value: n.id })),
  ]
})

// Робот на выбор — только роботы этой карты; не выбран — выбирает fms
const robotOptions = computed(() =>
  robots.robots.filter((r) => r.mapId === form.value.mapId).map((r) => ({ label: r.id, value: r.id })),
)

watch(() => form.value.mapId, async (mapId, prev) => {
  if (!mapId || !prev || mapId === prev) return
  await maps.open(mapId).catch(() => {})
  form.value.steps = [emptyStep()]           // узлы прежней карты здесь не годятся
  form.value.requestedRobotId = null
})

function addStep() { form.value.steps.push(emptyStep()) }
function removeStep(i) { form.value.steps.splice(i, 1) }
function moveStep(i, dir) {
  const j = i + dir
  if (j < 0 || j >= form.value.steps.length) return
  const [step] = form.value.steps.splice(i, 1)
  form.value.steps.splice(j, 0, step)
}

const payload = computed(() => toCreateRequest(form.value))
const canSubmit = computed(() => !!form.value.mapId && form.value.steps.length > 0 && form.value.steps.every((s) => s.nodeId))
const generalErrors = computed(() => formErrors(errors.value.details))

async function submit() {
  if (!canSubmit.value) return msg.error('Choose a map and a node for every step')
  submitting.value = true
  errors.value = { details: {}, message: null }
  try {
    const created = await api.missions.createMission(payload.value)
    msg.success(`Mission ${created.id} queued`)
    showBuilder.value = false
    refresh()
  } catch (e) {
    if (e?.code === 'INVALID_INPUT') errors.value = { details: e.details || {}, message: 'Check the highlighted fields' }
    else if (e?.code === 'INVALID_MISSION') errors.value = { details: {}, message: e.message }
    else if (e?.code === 'UNAVAILABLE') errors.value = { details: {}, message: 'fms is starting up, try again in a moment' }
    else if (e?.code === 'NETWORK' || e?.code === 'TIMEOUT') errors.value = { details: {}, message: 'No connection to fms' }
    else errors.value = { details: {}, message: e?.message || 'Failed to create the mission' }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <NCard size="small">
      <NTabs type="line" default-value="current" animated>
        <template #suffix>
          <NButton type="primary" size="small" :disabled="!maps.maps.length" @click="openBuilder">+ Create mission</NButton>
        </template>

        <NTabPane name="current" tab="Current">
          <div v-if="loadError" class="mb-3 rounded bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {{ loadError }}
          </div>

          <div class="mb-2 text-xs text-slate-500 dark:text-slate-400">Active — {{ active.length }}</div>
          <NEmpty v-if="!active.length" class="py-6"
                  :description="maps.maps.length ? 'No active missions' : 'Upload a map first — missions run on a map'">
            <template v-if="maps.maps.length" #extra>
              <NButton size="small" @click="openBuilder">Create a mission</NButton>
            </template>
          </NEmpty>
          <NDataTable v-else :columns="activeColumns" :data="active" :bordered="false" size="small" :row-key="(m) => m.id" />

          <div class="mb-2 mt-6 text-xs text-slate-500 dark:text-slate-400">Recently finished — last {{ RECENT }}</div>
          <NEmpty v-if="!finished.length" class="py-4" description="Nothing finished yet" />
          <NDataTable v-else :columns="finishedColumns" :data="finished" :bordered="false" size="small" :row-key="(m) => m.id" />
        </NTabPane>

        <NTabPane name="history" tab="History" display-directive="show:lazy">
          <MissionHistory @open="openMission" />
        </NTabPane>
      </NTabs>
    </NCard>

    <MissionDrawer v-model:show="showDrawer" :mission-id="openedId" @changed="refresh" />

    <!-- ============================================================= -->
    <!-- Мастер создания                                                -->
    <!-- ============================================================= -->
    <NModal
      v-model:show="showBuilder"
      preset="card"
      title="Create mission"
      style="width: 680px"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <div class="flex flex-col gap-4">
        <div v-if="errors.message" class="rounded bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {{ errors.message }}
          <ul v-if="generalErrors.length" class="mt-1 list-disc pl-5">
            <li v-for="e in generalErrors" :key="e">{{ e }}</li>
          </ul>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <label class="text-sm text-slate-600 dark:text-slate-400">
            Name <span class="text-xs text-(color:--ui-muted)">(optional)</span>
            <NInput v-model:value="form.name" placeholder="Pallet A3 → Dock 2" class="mt-1" />
          </label>
          <label class="text-sm text-slate-600 dark:text-slate-400">
            Priority
            <NSelect v-model:value="form.priority" :options="priorityOptions" class="mt-1" />
          </label>
          <label class="text-sm text-slate-600 dark:text-slate-400">
            Map
            <NSelect v-model:value="form.mapId" :options="mapOptions" placeholder="Which map" class="mt-1" />
          </label>
          <label class="text-sm text-slate-600 dark:text-slate-400">
            Robot
            <NSelect v-model:value="form.requestedRobotId" :options="robotOptions" clearable
                     placeholder="Any robot — fms chooses" class="mt-1" />
          </label>
        </div>

        <div class="rounded border border-slate-200 p-3 dark:border-slate-700">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium text-slate-700 dark:text-slate-300">Steps — drive to a node, then do its actions</span>
            <NButton size="tiny" tertiary type="primary" :disabled="!nodeOptions.length" @click="addStep">+ Add step</NButton>
          </div>
          <NEmpty v-if="!nodeOptions.length" size="small" description="This map has no nodes — add them in the Map Editor" />

          <div v-else class="flex flex-col gap-2">
            <div
              v-for="(step, i) in form.steps"
              :key="i"
              class="rounded border bg-slate-50 p-2 dark:bg-slate-950/50"
              :class="stepErrors(errors.details, i).length ? 'border-rose-400' : 'border-slate-100 dark:border-slate-800'"
            >
              <div class="flex items-center gap-2">
                <span class="w-6 text-right font-mono text-xs text-(color:--ui-muted)">{{ i + 1 }}.</span>
                <NSelect v-model:value="step.nodeId" :options="nodeOptions" filterable size="small"
                         placeholder="Node" class="flex-1" />
                <NButton size="tiny" tertiary :disabled="i === 0" title="Move up" @click="moveStep(i, -1)">↑</NButton>
                <NButton size="tiny" tertiary :disabled="i === form.steps.length - 1" title="Move down" @click="moveStep(i, 1)">↓</NButton>
                <NButton size="tiny" tertiary type="error" :disabled="form.steps.length === 1" title="Remove step" @click="removeStep(i)">✕</NButton>
              </div>
              <ul v-if="stepErrors(errors.details, i).length" class="mt-1 pl-8 text-[11px] text-rose-600 dark:text-rose-400">
                <li v-for="e in stepErrors(errors.details, i)" :key="e">{{ e }}</li>
              </ul>
              <div class="mt-2 pl-8">
                <ActionListEditor v-model:actions="step.actions" scope="node" :with-id="false" mission-step
                                  title="Actions on arrival" />
              </div>
            </div>
          </div>
        </div>

        <div class="rounded bg-slate-50 p-3 dark:bg-slate-800">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-xs text-slate-500 dark:text-slate-400">Request (POST /api/fms/missions)</span>
            <NButton size="tiny" tertiary @click="showPreview = !showPreview">{{ showPreview ? 'Hide' : 'Show' }} JSON</NButton>
          </div>
          <pre v-if="showPreview" class="max-h-48 overflow-auto rounded bg-slate-900 p-2 font-mono text-[11px] text-slate-100 dark:bg-slate-950">{{ JSON.stringify(payload, null, 2) }}</pre>
          <div v-else class="font-mono text-[11px] text-slate-600 dark:text-slate-300">
            {{ payload.steps.map((s) => s.nodeId || '?').join(' → ') }}
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between">
          <span class="text-xs text-(color:--ui-muted)">
            {{ form.requestedRobotId ? `Only ${form.requestedRobotId} will take it` : 'fms picks the robot that gets to step 1 fastest' }}
          </span>
          <div class="flex gap-2">
            <NButton :disabled="submitting" @click="showBuilder = false">Close</NButton>
            <NButton type="primary" :loading="submitting" :disabled="!canSubmit" @click="submit">Queue mission</NButton>
          </div>
        </div>
      </template>
    </NModal>
  </div>
</template>
