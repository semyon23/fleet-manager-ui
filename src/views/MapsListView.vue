<script setup>
import { ref, h, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard,
  NDataTable,
  NButton,
  NModal,
  NInput,
  NUpload,
  NTag,
  useMessage,
} from 'naive-ui'
import { useMapsStore } from '../stores/maps'
import { parsePGM, pgmToDataURL } from '../lib/pgm'
import { parseNav2Meta } from '../lib/nav2meta'
import * as api from '../api'

const store = useMapsStore()
const router = useRouter()
const msg = useMessage()

const showModal = ref(false)
const mapName = ref('')
const mapId = ref('')   // VDA mapId роботов; пусто — сгенерирует fms
const MAP_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const pgmFile = ref(null)
const yamlFile = ref(null)
const busy = ref(false)

function errorText(e) {
  return e instanceof api.ApiError ? `${e.code} — ${e.message}` : (e.message || String(e))
}

onMounted(async () => {
  try { await store.load() } catch (e) { msg.error('Maps not loaded: ' + errorText(e)) }
})

// Новая карта — сразу в fms (в mock-режиме — в localStorage браузера)
async function createMap(payload) {
  const id = mapId.value.trim()
  if (id && !MAP_ID_RE.test(id)) throw new Error('Map ID: 1-64 letters, digits, - or _')
  return store.create({ ...payload, ...(id ? { id } : {}) })
}

const BASE = import.meta.env.BASE_URL
const SAMPLES = [
  { name: 'Warehouse 25×20 m', pgm: `${BASE}samples/warehouse.pgm`, yaml: `${BASE}samples/warehouse.yaml`, key: 'warehouse' },
  { name: 'Workshop 10×10 m', pgm: `${BASE}samples/workshop.pgm`, yaml: `${BASE}samples/workshop.yaml`, key: 'workshop' },
]

async function loadSample(sample) {
  busy.value = true
  try {
    const [pgmRes, yamlRes] = await Promise.all([fetch(sample.pgm), fetch(sample.yaml)])
    if (!pgmRes.ok || !yamlRes.ok) throw new Error('Sample not found on server')
    const [buf, text] = await Promise.all([pgmRes.arrayBuffer(), yamlRes.text()])
    const pgm = parsePGM(buf)
    const meta = parseNav2Meta(text)
    const dataUrl = pgmToDataURL(pgm)
    const created = await createMap({
      name: sample.name,
      meta,
      pgmDataUrl: dataUrl,
      width: pgm.width,
      height: pgm.height,
    })
    msg.success(`Loaded ${sample.name} (${pgm.width}×${pgm.height}, ${meta.resolution} m/px)`)
    showModal.value = false
    router.push({ name: 'map-editor', params: { id: created.id } })
  } catch (e) {
    msg.error('Failed to load sample: ' + errorText(e))
  } finally {
    busy.value = false
  }
}

function reset() {
  mapName.value = ''
  mapId.value = ''
  pgmFile.value = null
  yamlFile.value = null
}

function onPgmChange({ file }) {
  pgmFile.value = file.file
}
function onYamlChange({ file }) {
  yamlFile.value = file.file
}

async function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsArrayBuffer(file)
  })
}
async function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsText(file)
  })
}

async function submit() {
  if (!mapName.value.trim()) return msg.error('Give the map a name')
  if (!pgmFile.value) return msg.error('Attach a .pgm file')
  if (!yamlFile.value) return msg.error('Attach a .yaml file')

  busy.value = true
  try {
    const [buf, text] = await Promise.all([
      readAsArrayBuffer(pgmFile.value),
      readAsText(yamlFile.value),
    ])
    const pgm = parsePGM(buf)
    const meta = parseNav2Meta(text)
    const dataUrl = pgmToDataURL(pgm)
    const created = await createMap({
      name: mapName.value.trim(),
      meta,
      pgmDataUrl: dataUrl,
      width: pgm.width,
      height: pgm.height,
    })
    msg.success(`Map ${created.name} created (${pgm.width}×${pgm.height} px, ${meta.resolution} m/px)`)
    showModal.value = false
    reset()
    router.push({ name: 'map-editor', params: { id: created.id } })
  } catch (e) {
    msg.error('Map not created: ' + errorText(e))
  } finally {
    busy.value = false
  }
}

async function del(row) {
  if (!confirm(`Delete "${row.name}"?`)) return
  try {
    await store.remove(row.id)
    msg.info('Map deleted')
  } catch (e) {
    msg.error('Map not deleted: ' + errorText(e))   // INVALID_STATE — на карте стоят роботы
  }
}

const columns = [
  { title: 'ID', key: 'id', render: (r) => h('span', { class: 'font-mono text-xs text-brand-800' }, r.id) },
  {
    title: 'Name',
    key: 'name',
    render: (r) =>
      h(
        'a',
        {
          class: 'cursor-pointer font-medium text-brand-700 hover:text-brand-900 hover:underline',
          onClick: () => router.push({ name: 'map-editor', params: { id: r.id } }),
        },
        r.name
      ),
  },
  {
    title: 'Size',
    key: 'size',
    render: (r) => h('span', { class: 'font-mono text-xs text-slate-600' }, `${r.width} × ${r.height} px`),
  },
  {
    title: 'Resolution',
    key: 'res',
    render: (r) => h('span', { class: 'font-mono text-xs text-slate-600' }, `${r.meta.resolution} m/px`),
  },
  {
    title: 'Version',
    key: 'version',
    render: (r) => h('span', { class: 'flex items-center gap-1 font-mono text-xs text-slate-600' }, [
      `v${r.version}`,
      r.dirty ? h(NTag, { size: 'tiny', type: 'warning' }, { default: () => 'unsaved' }) : null,
    ]),
  },
  {
    title: 'Assigned to',
    key: 'assigned',
    render: (r) =>
      r.assignedRobots?.length
        ? h('div', { class: 'flex gap-1' }, r.assignedRobots.map((id) => h(NTag, { size: 'tiny' }, { default: () => id })))
        : h('span', { class: 'text-xs text-slate-400' }, '—'),
  },
  {
    title: 'Updated',
    key: 'updatedAt',
    render: (r) => h('span', { class: 'font-mono text-xs text-slate-500' }, (r.updatedAt || '').slice(0, 16).replace('T', ' ')),
  },
  {
    title: 'Actions',
    key: 'actions',
    render: (r) =>
      h('div', { class: 'flex gap-1' }, [
        h(NButton, { size: 'tiny', onClick: () => router.push({ name: 'map-editor', params: { id: r.id } }) }, { default: () => 'Edit' }),
        h(NButton, { size: 'tiny', type: 'error', ghost: true, onClick: () => del(r) }, { default: () => 'Delete' }),
      ]),
  },
]
</script>

<template>
  <NCard title="Maps" size="small" class="!bg-white dark:!bg-slate-900">
    <template #header-extra>
      <NButton type="primary" size="small" @click="showModal = true">+ New map</NButton>
    </template>

    <div v-if="!store.maps.length" class="grid place-items-center rounded border-2 border-dashed border-slate-200 py-12 text-center">
      <div>
        <div class="text-4xl">✎</div>
        <div class="mt-2 text-sm text-slate-500">No maps yet. Upload a ROS 2 Nav2 map (.pgm + .yaml)…</div>
        <NButton type="primary" class="mt-4" @click="showModal = true">+ Upload first map</NButton>
        <div class="my-4 text-xs uppercase tracking-wider text-slate-400">or try a sample</div>
        <div class="flex justify-center gap-2">
          <NButton
            v-for="s in SAMPLES"
            :key="s.key"
            size="small"
            ghost
            :disabled="busy"
            @click="loadSample(s)"
          >
            {{ s.name }}
          </NButton>
        </div>
      </div>
    </div>
    <NDataTable v-else :columns="columns" :data="store.maps" :bordered="false" />

    <NModal
      v-model:show="showModal"
      preset="card"
      title="New map"
      style="width: 520px"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <div class="flex flex-col gap-4">
        <div class="rounded bg-brand-50 p-3">
          <div class="text-xs uppercase tracking-wider text-brand-800">Quick start — try a sample</div>
          <div class="mt-2 flex gap-2">
            <NButton
              v-for="s in SAMPLES"
              :key="s.key"
              size="tiny"
              type="primary"
              ghost
              :disabled="busy"
              @click="loadSample(s)"
            >
              {{ s.name }}
            </NButton>
          </div>
        </div>

        <div class="flex items-center gap-3 text-xs text-slate-400">
          <div class="h-px flex-1 bg-slate-200" />
          OR UPLOAD YOUR OWN
          <div class="h-px flex-1 bg-slate-200" />
        </div>

        <label class="text-sm text-slate-600">
          Map name
          <NInput v-model:value="mapName" placeholder="Warehouse — Floor 1" class="mt-1" />
        </label>

        <label class="text-sm text-slate-600">
          Map ID <span class="text-xs text-slate-400">(optional)</span>
          <NInput v-model:value="mapId" placeholder="map_1" class="mt-1" />
          <span class="mt-1 block text-xs text-slate-400">
            The mapId robots use for this map (map_id in the robot settings). Empty — fms generates one.
          </span>
        </label>

        <label class="text-sm text-slate-600">
          Map image (.pgm)
          <NUpload
            :max="1"
            accept=".pgm"
            :default-upload="false"
            :show-file-list="!!pgmFile"
            @change="onPgmChange"
            class="mt-1"
          >
            <NButton dashed block>{{ pgmFile ? pgmFile.name : 'Select .pgm file' }}</NButton>
          </NUpload>
        </label>

        <label class="text-sm text-slate-600">
          Map metadata (.yaml)
          <NUpload
            :max="1"
            accept=".yaml,.yml"
            :default-upload="false"
            :show-file-list="!!yamlFile"
            @change="onYamlChange"
            class="mt-1"
          >
            <NButton dashed block>{{ yamlFile ? yamlFile.name : 'Select .yaml file' }}</NButton>
          </NUpload>
        </label>

        <div class="rounded bg-slate-50 p-3 text-xs text-slate-600">
          Files are parsed in the browser; the map is saved in fms (in mock mode — in this browser).
          Map ID also applies to the samples above.
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton @click="showModal = false">Cancel</NButton>
          <NButton type="primary" :loading="busy" @click="submit">Create & open editor</NButton>
        </div>
      </template>
    </NModal>
  </NCard>
</template>
