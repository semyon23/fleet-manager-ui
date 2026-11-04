<script setup>
import { ref, computed, h } from 'vue'
import { useRobotsStore } from '../stores/robots'
import {
  NCard, NDataTable, NTag, NButton, NModal, NInput, NSelect, NSwitch, NPopconfirm,
  NDrawer, NDrawerContent, NEmpty, NTooltip, useMessage,
} from 'naive-ui'
import { previewSpriteFor, tintStyle } from '../lib/robotSprite'
import { AVAILABILITY_OPTIONS, availabilityOf } from '../lib/availability'
import * as api from '../api'
import { subscribeRobot, unsubscribeRobot } from '../composables/useRobotMqtt'

const store = useRobotsStore()
const msg = useMessage()

function toggleLive(val) {
  if (val) store.startPolling()
  else store.stopPolling()
}

// === Filter by availability state ===
const stateFilter = ref([])  // пустой = все

const filteredRobots = computed(() => {
  if (!stateFilter.value.length) return store.robots
  const set = new Set(stateFilter.value)
  return store.robots.filter((r) => set.has(r.availability?.state))
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
// Робот с миссией: сервер отвечает ROBOT_BUSY — спрашиваем, удалить ли с отменой миссии (?force=true)
const busyRobot = ref(null)   // { id, mission } — открыт диалог «робот занят»

async function deleteRobot(id, force = false) {
  try {
    await api.robots.deleteRobot(id, { force })
    store.removeRobot(id)
    unsubscribeRobot(id)
    if (selectedId.value === id) { selectedId.value = null; showDrawer.value = false }
    busyRobot.value = null
    msg.success(force ? `Robot "${id}" deleted, its mission is canceled` : `Robot "${id}" deleted`)
  } catch (e) {
    if (e?.code === 'ROBOT_BUSY' && !force) {
      busyRobot.value = { id, mission: store.robots.find((r) => r.id === id)?.mission }
      return
    }
    busyRobot.value = null
    if (e?.code === 'NOT_FOUND') msg.error(`Robot "${id}" is already deleted`)
    else msg.error(connectionErrorText(e) || `Failed to delete robot "${id}"`)
  }
}

// === Pause / resume ===
// Ответ — «команда отправлена»; что робот встал на паузу, видно по status.paused при следующем опросе
async function setPaused(robot, paused) {
  try {
    if (paused) await api.robots.pauseRobot(robot.id)
    else await api.robots.resumeRobot(robot.id)
    msg.success(paused ? `Pause sent to "${robot.id}"` : `Resume sent to "${robot.id}"`)
  } catch (e) {
    if (e?.code === 'NOT_FOUND') msg.error(`Robot "${robot.id}" is not connected to the fleet yet`)
    else msg.error(connectionErrorText(e) || 'Failed to send the command')
  }
}

// === Table columns ===
function availabilityTag(r) {
  const meta = availabilityOf(r)
  const reasons = r.availability?.reasons || []
  const tag = h(NTag, { color: { color: meta.color, textColor: 'white' }, size: 'small' }, { default: () => meta.label })
  if (!reasons.length) return tag
  // Причины — в подсказке; рядом число, чтобы было видно, что подсказка есть
  return h(NTooltip, null, {
    trigger: () => h('span', { class: 'inline-flex items-center gap-1' }, [
      tag,
      h('span', { class: 'text-xs text-slate-500 dark:text-slate-400' }, `${reasons.length} ⓘ`),
    ]),
    default: () => h('ul', { class: 'text-xs' }, reasons.map((x) => h('li', x.message))),
  })
}

function batteryBar(r) {
  return h('div', { class: 'flex items-center gap-2 min-w-[90px]' }, [
    h('div', { class: 'h-1.5 flex-1 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden' }, [
      h('div', {
        class: 'h-full',
        style: `width: ${r.battery}%; background: ${r.battery < 20 ? '#ef4444' : r.battery < 50 ? '#eab308' : '#22c55e'}`,
      }),
    ]),
    h('span', { class: 'font-mono text-xs w-10 text-right' }, `${r.charging ? '⚡' : ''}${r.battery}%`),
  ])
}

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
        style: tintStyle(r),
      }),
  },
  {
    title: 'ID', key: 'id', sorter: 'default',
    render: (r) => h('div', { class: 'flex flex-col' }, [
      h('button', {
        class: 'font-mono text-left text-brand-800 dark:text-brand-300 hover:underline',
        onClick: (e) => { e.stopPropagation(); openDrawer(r.id) },
      }, r.id),
      r.name && r.name !== r.id ? h('span', { class: 'text-xs text-slate-500' }, r.name) : null,
    ]),
  },
  { title: 'Robot', key: 'model', render: (r) => h('span', { class: 'font-mono text-xs' }, r.model) },
  {
    title: 'State', key: 'state',
    sorter: (a, b) => availabilityOf(a).label.localeCompare(availabilityOf(b).label),
    render: availabilityTag,
  },
  { title: 'Battery', key: 'battery', sorter: (a, b) => a.battery - b.battery, render: batteryBar },
  { title: 'Mission', key: 'mission', render: (r) => h('span', { class: 'font-mono text-xs text-slate-500' }, r.mission || '—') },
  {
    title: 'Actions', key: 'actions',
    render: (r) =>
      h('div', { class: 'flex gap-1', onClick: (e) => e.stopPropagation() }, [
        h(NButton, {
          size: 'tiny', tertiary: true, disabled: r.connection !== 'ONLINE',
          title: r.paused ? 'Resume the robot' : 'Pause the robot',
          onClick: () => setPaused(r, !r.paused),
        }, { default: () => (r.paused ? 'Resume' : 'Pause') }),
        h(NPopconfirm, {
          onPositiveClick: () => deleteRobot(r.id),
          positiveText: 'Delete',
          negativeText: 'Cancel',
        }, {
          default: () => `Delete robot "${r.id}" from the fleet?`,
          trigger: () => h(NButton, { size: 'tiny', tertiary: true, type: 'error', title: 'Delete robot' }, { default: () => '✕' }),
        }),
      ]),
  },
]

const errorLevelColor = { WARNING: '#eab308', URGENT: '#f97316', CRITICAL: '#ef4444', FATAL: '#b91c1c' }

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
    // Робот зарегистрирован → подписка на его MQTT-топики (amr/v3/<manufacturer>/<serialNumber>/…)
    subscribeRobot(robot)
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
          v-model:value="stateFilter"
          :options="AVAILABILITY_OPTIONS"
          multiple
          size="small"
          placeholder="All states"
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
      <NButton size="tiny" tertiary @click="stateFilter = []">Clear filter</NButton>
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
              :style="tintStyle(selectedRobot)"
            />
          </div>

          <div>
            <NTag :color="{ color: availabilityOf(selectedRobot).color, textColor: 'white' }">
              {{ availabilityOf(selectedRobot).label }}
            </NTag>
            <ul v-if="selectedRobot.availability?.reasons?.length" class="mt-2 flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
              <li v-for="reason in selectedRobot.availability.reasons" :key="reason.code">• {{ reason.message }}</li>
            </ul>
          </div>

          <div class="grid grid-cols-2 gap-3 text-sm">
            <div class="text-slate-500">Name</div>
            <div>{{ selectedRobot.name }}</div>

            <div class="text-slate-500">Manufacturer / serial</div>
            <div class="font-mono text-xs">{{ selectedRobot.model }}</div>

            <div class="text-slate-500">Connection</div>
            <div class="font-mono text-xs">{{ selectedRobot.connection }}</div>

            <div class="text-slate-500">Mode</div>
            <div class="font-mono text-xs">{{ selectedRobot.operatingMode || '—' }}</div>

            <div class="text-slate-500">Battery</div>
            <div class="flex items-center gap-2">
              <div class="h-1.5 w-24 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  class="h-full"
                  :style="`width: ${selectedRobot.battery}%; background: ${selectedRobot.battery < 20 ? '#ef4444' : selectedRobot.battery < 50 ? '#eab308' : '#22c55e'}`"
                ></div>
              </div>
              <span class="font-mono text-xs">{{ selectedRobot.charging ? '⚡ ' : '' }}{{ selectedRobot.battery }}%</span>
            </div>

            <div class="text-slate-500">Last node</div>
            <div class="font-mono text-xs">{{ selectedRobot.lastNodeId || '—' }}</div>

            <div class="text-slate-500">Position</div>
            <div class="font-mono text-xs">
              {{ selectedRobot.x.toFixed(2) }}, {{ selectedRobot.y.toFixed(2) }} m · {{ ((selectedRobot.theta * 180) / Math.PI).toFixed(1) }}°
              <span v-if="selectedRobot.mapId" class="text-slate-500">· {{ selectedRobot.mapId }}</span>
            </div>

            <div class="text-slate-500">Mission</div>
            <div class="font-mono text-xs">{{ selectedRobot.mission || '—' }}</div>

            <div class="text-slate-500">Last update</div>
            <div class="font-mono text-xs">{{ selectedRobot.lastStateAt ? new Date(selectedRobot.lastStateAt).toLocaleTimeString() : '—' }}</div>
          </div>

          <div v-if="selectedRobot.errors.length" class="flex flex-col gap-2">
            <div class="text-sm text-slate-500">Robot errors</div>
            <div
              v-for="(err, i) in selectedRobot.errors"
              :key="i"
              class="rounded border border-slate-200 dark:border-slate-700 p-2 text-xs"
            >
              <NTag size="tiny" :color="{ color: errorLevelColor[err.level] || '#64748b', textColor: 'white' }">{{ err.level }}</NTag>
              <span class="ml-2 font-mono">{{ err.errorType }}</span>
              <div v-if="err.description" class="mt-1 text-slate-600 dark:text-slate-300">{{ err.description }}</div>
            </div>
          </div>

          <div class="flex gap-2">
            <NButton
              size="small"
              :disabled="selectedRobot.connection !== 'ONLINE'"
              @click="setPaused(selectedRobot, !selectedRobot.paused)"
            >
              {{ selectedRobot.paused ? 'Resume' : 'Pause' }}
            </NButton>
            <div class="flex-1"></div>
            <NPopconfirm
              :on-positive-click="() => deleteRobot(selectedRobot.id)"
              positive-text="Delete"
              negative-text="Cancel"
            >
              <template #trigger>
                <NButton size="small" type="error" tertiary>Delete</NButton>
              </template>
              Delete robot "{{ selectedRobot.id }}" from the fleet?
            </NPopconfirm>
          </div>
        </div>
        <div v-else class="text-sm text-slate-500">No robot selected.</div>
      </NDrawerContent>
    </NDrawer>

    <!-- Робот занят: удалить с отменой миссии? -->
    <NModal
      :show="!!busyRobot"
      preset="dialog"
      type="warning"
      title="Robot is busy"
      positive-text="Delete and cancel mission"
      negative-text="Keep the robot"
      @positive-click="deleteRobot(busyRobot.id, true)"
      @negative-click="busyRobot = null"
      @close="busyRobot = null"
      @mask-click="busyRobot = null"
    >
      <template v-if="busyRobot">
        Robot "{{ busyRobot.id }}" is executing mission
        <span class="font-mono">{{ busyRobot.mission || '' }}</span>.
        Deleting it cancels the mission and stops the robot.
      </template>
    </NModal>
  </NCard>
</template>
