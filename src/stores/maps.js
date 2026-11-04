import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '../api'

/**
 * Карты. Хранит их fms (контракт, раздел 6): список — без графа и картинки, полная карта грузится,
 * когда её открывают (open). Редактор меняет карту здесь же, синхронно (update), а на сервер она уходит
 * по кнопке Save (save) с версией, которую загрузили: сохранил кто-то раньше — 409 VERSION_CONFLICT.
 *
 * Запись в maps — карта с сервера и два поля фронта:
 *   full  — граф и картинка загружены (иначе это строка из списка);
 *   dirty — есть несохранённые правки.
 * Несохранённые правки — черновик в localStorage (без картинки): переживают перезагрузку страницы,
 * если карту на сервере за это время не меняли.
 * В mock-режиме «сервер» — api/mocks/maps.mock.js в localStorage, правила те же.
 */

const DRAFTS_KEY = 'fm.maps.drafts.v1'
const DRAFT_DEBOUNCE_MS = 250   // при перетаскивании узла update() вызывается ~60 раз в секунду
// Что меняет редактор и что уходит в PATCH
const EDITABLE = ['name', 'width', 'height', 'meta', 'waypoints', 'edges', 'stations', 'zones', 'assignedRobots']

function editable(map) {
  return Object.fromEntries(EDITABLE.filter((key) => key in map).map((key) => [key, map[key]]))
}

function readDrafts() {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY)) || {} } catch { return {} }
}
function writeDrafts(drafts) {
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)) } catch (e) { console.warn('[maps] draft not saved:', e.message) }
}
function dropDraft(id) {
  const drafts = readDrafts()
  if (!(id in drafts)) return
  delete drafts[id]
  writeDrafts(drafts)
}

export const useMapsStore = defineStore('maps', () => {
  const maps = ref([])
  const count = computed(() => maps.value.length)

  function get(id) {
    return maps.value.find((m) => m.id === id) || null
  }
  function put(map) {
    const idx = maps.value.findIndex((m) => m.id === map.id)
    if (idx < 0) maps.value.push(map)
    else maps.value[idx] = map
  }

  // === Черновики: с дебаунсом, по всем картам, изменённым с прошлой записи
  let draftTimer = null
  const draftIds = new Set()
  function scheduleDraft(id) {
    draftIds.add(id)
    if (!draftTimer) draftTimer = setTimeout(flushDrafts, DRAFT_DEBOUNCE_MS)
  }
  function flushDrafts() {
    clearTimeout(draftTimer)
    draftTimer = null
    if (!draftIds.size) return
    const drafts = readDrafts()
    for (const id of draftIds) {
      const map = get(id)
      if (map?.dirty) drafts[id] = { baseVersion: map.version, ...editable(map) }
      else delete drafts[id]
    }
    draftIds.clear()
    writeDrafts(drafts)
  }
  if (typeof window !== 'undefined') {
    // Не потерять последние правки при закрытии вкладки
    window.addEventListener('beforeunload', flushDrafts)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushDrafts()
    })
  }

  // Список карт. Открытая карта остаётся, если на сервере та же версия или в ней несохранённые правки
  // (тогда при сохранении будет конфликт — пусть решает пользователь); иначе её граф грузится заново.
  async function load() {
    const list = await api.maps.listMaps()
    maps.value = list.map((summary) => {
      const current = get(summary.id)
      if (current?.full && (current.version === summary.version || current.dirty)) return current
      return { ...summary, full: false, dirty: false }
    })
  }

  // Полная карта. Уже открыта — не грузится заново. Возвращает, что стало с черновиком:
  // 'restored' — правки восстановлены, 'discarded' — карту на сервере поменяли, черновик выброшен, null — его не было.
  async function open(id) {
    if (get(id)?.full) return null
    const map = await api.maps.getMap(id)
    const draft = readDrafts()[id]
    if (draft && draft.baseVersion === map.version) {
      const { baseVersion, ...fields } = draft
      put({ ...map, ...fields, full: true, dirty: true })
      return 'restored'
    }
    put({ ...map, full: true, dirty: false })
    if (draft) {
      dropDraft(id)
      return 'discarded'
    }
    return null
  }

  // Выбросить свои правки и загрузить карту с сервера (после конфликта версий)
  async function reload(id) {
    const map = get(id)
    if (map) put({ ...map, full: false, dirty: false })
    draftIds.delete(id)
    dropDraft(id)
    await open(id)
  }

  // Правка из редактора: только здесь, на сервер — по save()
  function update(id, patch) {
    const map = get(id)
    if (!map) return null
    put({ ...map, ...patch, dirty: true })
    scheduleDraft(id)
    return get(id)
  }

  // Метаданные (resolution, origin) — глубокий merge, чтобы не терять occupiedThresh, mode и т.п.
  function updateMeta(id, metaPatch) {
    const map = get(id)
    if (!map) return null
    return update(id, { meta: { ...map.meta, ...metaPatch } })
  }

  // PATCH с версией. Ошибки (409 VERSION_CONFLICT, 400 INVALID_MAP, ...) — ApiError, решает экран.
  async function save(id) {
    const map = get(id)
    if (!map?.full) throw new Error(`map ${id} is not open`)
    const saved = await api.maps.updateMap(id, { version: map.version, ...editable(map) })
    const latest = get(id)
    if (latest !== map) {
      // Правили, пока сохраняли: правки остаются несохранёнными, но уже поверх новой версии
      put({ ...latest, version: saved.version, updatedAt: saved.updatedAt })
    } else {
      put({ ...saved, full: true, dirty: false })
    }
    scheduleDraft(id)
    return get(id)
  }

  // { id?, name, meta, pgmDataUrl, width, height } → POST; id — mapId роботов, нет — сгенерирует сервер
  async function create(payload) {
    const created = await api.maps.createMap(payload)
    put({ ...created, full: true, dirty: false })
    return get(created.id)
  }

  async function remove(id) {
    await api.maps.deleteMap(id)
    maps.value = maps.value.filter((m) => m.id !== id)
    draftIds.delete(id)
    dropDraft(id)
  }

  return { maps, count, get, load, open, reload, update, updateMeta, save, create, remove }
})
