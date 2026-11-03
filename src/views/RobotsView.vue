<script setup>
import { ref, computed } from 'vue'
import { useRobotsStore } from '../stores/robots'
import {
  NCard, NDataTable, NTag, NButton, NModal, NInput, NSelect, NSwitch, NPopconfirm,
  NDrawer, NDrawerContent, NEmpty, useMessage,
} from 'naive-ui'
import { h } from 'vue'
import { previewSpriteFor, tintStyle } from '../lib/robotSprite'
import * as api from '../api'
import { subscribeRobot, unsubscribeRobot } from '../composables/useRobotMqtt'

const store = useRobotsStore()
const msg = useMessage()

function toggleLive(val) {
  if (val) store.startPolling()
  else store.stopPolling()
}

const statusColor = {
  moving: '#22c55e',
  charging: '#eab308',
  idle: '#64748b',
  error: '#ef4444',
  offline: '#94a3b8',
  deploying: '#f97316',
}
const statusOptions = [
  { label: 'Moving', value: 'moving' },
  { label: 'Charging', value: 'charging' },
  { label: 'Idle', value: 'idle' },
  { label: 'Error', value: 'error' },
  { label: 'Offline', value: 'offline' },
  { label: 'Deploying', value: 'deploying' },
]

// === Filter by status ===
const statusFilter = ref([])  // pустой = все

const filteredRobots = computed(() => {
  if (!statusFilter.value.length) return store.robots
  const set = new Set(statusFilter.value)
  return store.robots.filter((r) => set.has(r.status))
})

// === Drawer with robot details ===
const selectedId = ref(null)
const showDrawer = ref(false)
const selectedRobot = computed(() =>
  selectedId.value ? store.robots.find((r) => r.id === selectedId.value) : null,
)
function openDrawer(id) {
  selectedId.value = id
  showDrawer.value = true
}

// === Ошибки: по code из ответа (контракт v2, раздел 2.1), без HTTP-кодов в UI ===
function connectionErrorText(e) {
  if (e?.code === 'NETWORK') return 'No connection to the server'
  if (e?.code === 'TIMEOUT') return 'The server is not responding'
  if (e?.code === 'UNAVAILABLE') return 'The fleet service is temporarily unavailable, try again'
  return null
}

// === Delete ===
function deleteErrorText(e, name) {
  if (e?.code === 'NOT_FOUND') return `Robot "${name}" is already deleted`
  if (e?.code === 'ROBOT_BUSY') return `Robot "${name}" is executing a mission — wait for it to finish`
  return connectionErrorText(e) || `Failed to delete robot "${name}"`
}
async function deleteRobot(id) {
  try {
    await api.robots.deleteRobot(id)
    store.removeRobot(id)
    unsubscribeRobot(id)
    if (selectedId.value === id) { selectedId.value = null; showDrawer.value = false }
    msg.success(`Robot "${id}" deleted`)
  } catch (e) {
    msg.error(deleteErrorText(e, id))
  }
}

// === Table columns ===
const columns = [
  {
    title: '',
    key: 'sprite',
    width: 64,
    render: (r) =>
      h('img', {
        src: previewSpriteFor(r),
        alt: r.id,
        class: 'h-10 w-10 object-contain',
        style: tintStyle(r.status),
      }),
  },
  {
    title: 'ID', key: 'id', sorter: 'default',
    render: (r) => h('button', {
      class: 'font-mono text-brand-800 dark:text-brand-300 hover:underline',
      onClick: (e) => { e.stopPropagation(); openDrawer(r.id) },
    }, r.id),
  },
  { title: 'Model', key: 'model' },
  {
    title: 'Status', key: 'status',
    filterOptions: statusOptions,
    filter: (val, row) => row.status === val,
    render: (r) => h(NTag, { color: { color: statusColor[r.status], textColor: 'white' }, size: 'small' }, { default: () => r.status }),
  },
  {
    title: 'Battery', key: 'battery', sorter: (a, b) => a.battery - b.battery,
    render: (r) => h('div', { class: 'flex items-center gap-2 min-w-[70px]' }, [
      h('div', { class: 'h-1.5 flex-1 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden' }, [
        h('div', {
          class: 'h-full',
          style: `width: ${r.battery}%; background: ${r.battery < 20 ? '#ef4444' : r.battery < 50 ? '#eab308' : '#22c55e'}`,
        }),
      ]),
      h('span', { class: 'font-mono text-xs w-8 text-right' }, `${r.battery}%`),
    ]),
  },
  { title: 'Mission', key: 'mission', render: (r) => h('span', { class: 'font-mono text-xs text-slate-500' }, r.mission || '—') },
  { title: 'Uptime', key: 'uptime', render: (r) => h('span', { class: 'font-mono text-xs' }, r.uptime) },
  {
    title: 'Actions', key: 'actions',
    render: (r) =>
      h('div', { class: 'flex gap-1' }, [
        h(NButton, { size: 'tiny', tertiary: true, onClick: () => openDrawer(r.id) }, { default: () => 'Details' }),
        h(NPopconfirm, {
          onPositiveClick: () => deleteRobot(r.id),
          positiveText: 'Delete',
          negativeText: 'Cancel',
        }, {
          default: () => `Delete robot "${r.id}"? It will be removed from the fleet on the backend.`,
          trigger: () => h(NButton, { size: 'tiny', tertiary: true, type: 'error', title: 'Delete robot' }, { default: () => '✕' }),
        }),
      ]),
  },
]

// Высота таблицы: подобрана так, чтобы верх (header топбара + отступы +
// заголовок карточки) вычитался из вьюпорта. Внутри NDataTable будет sticky
// header, tbody скроллится. Живёт как computed на случай если позже
// поменяется структура (напр. появится хлебный ряд).
const tableMaxHeight = 'calc(100vh - 14rem)'

// === Register robot modal ===
const showRegister = ref(false)
const submitting = ref(false)
// id — латиница, цифры, - и _ (контракт v2, 5.2); manufacturer и serialNumber — как в настройках самого робота
const emptyForm = () => ({ id: '', name: '', manufacturer: '', serialNumber: '' })
const form = ref(emptyForm())
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function openRegister() {
  form.value = emptyForm()
  showRegister.value = true
}

// Понятные подписи полей для сообщений из details
const FIELD_LABELS = { id: 'ID', name: 'Name', manufacturer: 'Manufacturer', serialNumber: 'Serial number', labels: 'Labels' }

function registerErrorText(e, id) {
  if (e?.code === 'ALREADY_EXISTS') return `Robot "${id}" or a robot with this manufacturer and serial number is already registered`
  if (e?.code === 'INVALID_INPUT' && e.details && Object.keys(e.details).length) {
    return Object.entries(e.details).map(([field, why]) => `${FIELD_LABELS[field] || field}: ${why}`).join('; ')
  }
  return connectionErrorText(e) || 'Failed to register the robot'
}

async function submitRegister() {
  const values = Object.fromEntries(Object.entries(form.value).map(([k, v]) => [k, v.trim()]))
  if (!ID_PATTERN.test(values.id)) return msg.error('ID: 1–64 characters, letters, digits, - or _')
  if (!values.manufacturer) return msg.error('Manufacturer is required')
  if (!values.serialNumber) return msg.error('Serial number is required')
  submitting.value = true
  try {
    const robot = await api.robots.registerRobot(values)
    store.addRobot(robot)
    // Робот зарегистрирован → подписка на его MQTT-топики (переделаем на amr/v3 и serialNumber в U-4)
    subscribeRobot(robot.id, robot.manufacturer)
    msg.success(api.getMockMode() ? `Robot "${robot.id}" registered (mock)` : `Robot "${robot.id}" registered`)
    showRegister.value = false
  } catch (e) {
    msg.error(registerErrorText(e, values.id))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <NCard title="Robots" size="small" class="!bg-white dark:!bg-slate-900">
    <template #header-extra>
      <div class="flex items-center gap-3">
        <NSelect
          v-model:value="statusFilter"
          :options="statusOptions"
          multiple
          size="small"
          placeholder="All statuses"
          clearable
          style="width: 220px"
        />
        <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span :class="store.pollingActive ? 'inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse' : 'inline-block h-2 w-2 rounded-full bg-slate-400'"></span>
          <span>Live (5s)</span>
          <NSwitch :value="store.pollingActive" size="small" @update:value="toggleLive" />
        </div>
        <span v-if="store.lastPollError" class="text-xs text-rose-600 font-mono" :title="store.lastPollError">poll error</span>
        <span v-else-if="store.lastPollAt" class="text-xs text-slate-400 font-mono">{{ store.lastPollAt.toLocaleTimeString() }}</span>
        <NButton type="primary" size="small" @click="openRegister">+ Register robot</NButton>
      </div>
    </template>

    <div v-if="!store.robots.length" class="py-10">
      <NEmpty description="No robots in the fleet yet">
        <template #extra>
          <NButton type="primary" size="small" @click="openRegister">Register first robot</NButton>
        </template>
      </NEmpty>
    </div>
    <!-- Скролл держим ВНУТРИ карточки, чтобы sidebar/topbar не уезжали
         при большом парке. max-height задаём CSS-переменной от viewport,
         NDataTable внутри делает sticky-хедер + скролл tbody.
         Правка по Семёну 2026-09-08. -->
    <NDataTable
      v-else
      :columns="columns"
      :data="filteredRobots"
      :bordered="false"
      :max-height="tableMaxHeight"
      :row-props="(row) => ({ style: 'cursor: pointer', onClick: () => openDrawer(row.id) })"
    />
    <div v-if="store.robots.length && filteredRobots.length === 0" class="mt-3 text-center text-xs text-slate-500">
      No robots match the current filter.
      <NButton size="tiny" tertiary @click="statusFilter = []">Clear filter</NButton>
    </div>

    <!-- ============================================================= -->
    <!-- Register modal                                                 -->
    <!-- ============================================================= -->
    <NModal
      v-model:show="showRegister"
      preset="card"
      title="Register new robot"
      style="width: 480px"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <div class="flex flex-col gap-4">
        <label class="text-sm text-slate-600 dark:text-slate-400">
          ID
          <NInput v-model:value="form.id" placeholder="amr-01" class="mt-1" />
        </label>

        <label class="text-sm text-slate-600 dark:text-slate-400">
          Name <span class="text-slate-400 text-xs">(optional, defaults to ID)</span>
          <NInput v-model:value="form.name" placeholder="AMR 01" class="mt-1" />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="text-sm text-slate-600 dark:text-slate-400">
            Manufacturer
            <NInput v-model:value="form.manufacturer" placeholder="ktc" class="mt-1" />
          </label>
          <label class="text-sm text-slate-600 dark:text-slate-400">
            Serial number
            <NInput v-model:value="form.serialNumber" placeholder="amr1" class="mt-1" />
          </label>
        </div>

        <div class="rounded bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-400">
          Manufacturer and serial number must match the robot's own settings: the fleet finds the robot
          by them. They cannot be changed later. The robot class comes from the robot itself once it
          is online.
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton :disabled="submitting" @click="showRegister = false">Cancel</NButton>
          <NButton type="primary" :loading="submitting" @click="submitRegister">Register</NButton>
        </div>
      </template>
    </NModal>

    <!-- ============================================================= -->
    <!-- Details drawer                                                 -->
    <!-- ============================================================= -->
    <NDrawer v-model:show="showDrawer" :width="420">
      <NDrawerContent :title="selectedRobot?.id || 'Robot details'" closable>
        <div v-if="selectedRobot" class="flex flex-col gap-4">
          <div class="grid place-items-center rounded bg-slate-100 dark:bg-slate-800 py-4">
            <img
              :src="previewSpriteFor(selectedRobot)"
              :alt="selectedRobot.id"
              class="h-32 w-32 object-contain"
              :style="tintStyle(selectedRobot.status)"
            />
          </div>

          <div class="grid grid-cols-2 gap-3 text-sm">
            <div class="text-slate-500">Status</div>
            <div><NTag :color="{ color: statusColor[selectedRobot.status], textColor: 'white' }" size="small">{{ selectedRobot.status }}</NTag></div>

            <div class="text-slate-500">Model</div>
            <div class="font-mono text-xs">{{ selectedRobot.model }}</div>

            <div class="text-slate-500">Battery</div>
            <div class="flex items-center gap-2">
              <div class="h-1.5 w-24 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  class="h-full"
                  :style="`width: ${selectedRobot.battery}%; background: ${selectedRobot.battery < 20 ? '#ef4444' : selectedRobot.battery < 50 ? '#eab308' : '#22c55e'}`"
                ></div>
              </div>
              <span class="font-mono text-xs">{{ selectedRobot.battery }}%</span>
            </div>

            <div class="text-slate-500">Position</div>
            <div class="font-mono text-xs">{{ selectedRobot.x.toFixed(2) }}, {{ selectedRobot.y.toFixed(2) }} m</div>

            <div class="text-slate-500">Heading</div>
            <div class="font-mono text-xs">{{ ((selectedRobot.theta * 180) / Math.PI).toFixed(1) }}°</div>

            <div class="text-slate-500">Mission</div>
            <div class="font-mono text-xs">{{ selectedRobot.mission || '—' }}</div>

            <div class="text-slate-500">Uptime</div>
            <div class="font-mono text-xs">{{ selectedRobot.uptime }}</div>
          </div>

          <div class="rounded bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-500 dark:text-slate-400">
            Pause / Stop / Home commands and live pose will be wired once the backend
            exposes <code>POST /api/fms/robots/:id/command</code> and WebSocket state.
          </div>

          <div class="flex gap-2">
            <NButton size="small" disabled title="Backend not yet implemented">Pause</NButton>
            <NButton size="small" type="error" disabled title="Backend not yet implemented">Stop</NButton>
            <NButton size="small" type="primary" disabled title="Backend not yet implemented">Home</NButton>
            <div class="flex-1"></div>
            <NPopconfirm
              :on-positive-click="() => deleteRobot(selectedRobot.id)"
              positive-text="Delete"
              negative-text="Cancel"
            >
              <template #trigger>
                <NButton size="small" type="error" tertiary>Delete</NButton>
              </template>
              Delete robot "{{ selectedRobot.id }}"?
            </NPopconfirm>
          </div>
        </div>
        <div v-else class="text-sm text-slate-500">No robot selected.</div>
      </NDrawerContent>
    </NDrawer>
  </NCard>
</template>
