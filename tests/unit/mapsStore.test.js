// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMapsStore } from '../../src/stores/maps'
import * as api from '../../src/api'

// Store карт в mock-режиме: «сервер» — api/mocks/maps.mock.js в localStorage, правила как у fms
const MAP = {
  name: 'Floor 1', width: 200, height: 100,
  meta: { resolution: 0.05, origin: [0, 0, 0] },
  pgmDataUrl: 'data:image/png;base64,AAAA',
}
const waypoint = (id) => ({ id, u: 10, v: 20, name: id })

describe('maps store — карты в fms, версия, черновики', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('fm.api.useMocks', '1')
    setActivePinia(createPinia())
  })

  it('create с id робота и без него', async () => {
    const store = useMapsStore()
    const own = await store.create({ ...MAP, id: 'map_1' })
    const generated = await store.create(MAP)
    expect(own.id).toBe('map_1')
    expect(own.version).toBe(1)
    expect(generated.id).toMatch(/^map-[a-z0-9]+$/)
    await expect(store.create({ ...MAP, id: 'map_1' })).rejects.toMatchObject({ code: 'ALREADY_EXISTS' })
  })

  it('список — без графа и картинки; open грузит карту целиком', async () => {
    await useMapsStore().create({ ...MAP, id: 'm', waypoints: [waypoint('n1')] })
    setActivePinia(createPinia())   // как после перезагрузки страницы
    const store = useMapsStore()

    await store.load()
    expect(store.get('m').full).toBe(false)
    expect(store.get('m').waypoints).toBeUndefined()

    await store.open('m')
    expect(store.get('m').full).toBe(true)
    expect(store.get('m').waypoints).toEqual([waypoint('n1')])
    expect(store.get('m').pgmDataUrl).toBe(MAP.pgmDataUrl)
  })

  it('update — только локально, save — PATCH с версией', async () => {
    const store = useMapsStore()
    await store.create({ ...MAP, id: 'm' })
    store.update('m', { waypoints: [waypoint('n1')] })
    expect(store.get('m').dirty).toBe(true)
    expect((await api.maps.getMap('m')).waypoints).toEqual([])   // на «сервере» ещё нет

    const saved = await store.save('m')
    expect(saved.version).toBe(2)
    expect(saved.dirty).toBe(false)
    expect((await api.maps.getMap('m')).waypoints).toEqual([waypoint('n1')])
    expect(saved.pgmDataUrl).toBe(MAP.pgmDataUrl)              // картинку не трогали
  })

  it('updateMeta сливает метаданные, а не заменяет', async () => {
    const store = useMapsStore()
    await store.create({ ...MAP, id: 'm', meta: { ...MAP.meta, mode: 'trinary' } })
    store.updateMeta('m', { resolution: 0.1 })
    expect(store.get('m').meta).toEqual({ resolution: 0.1, origin: [0, 0, 0], mode: 'trinary' })
  })

  it('сохранил кто-то другой — 409 VERSION_CONFLICT, свои правки не теряются до reload', async () => {
    const store = useMapsStore()
    await store.create({ ...MAP, id: 'm' })
    await api.maps.updateMap('m', { version: 1, name: 'other user' })   // вторая вкладка

    store.update('m', { name: 'mine' })
    await expect(store.save('m')).rejects.toMatchObject({ code: 'VERSION_CONFLICT', details: { currentVersion: 2 } })
    expect(store.get('m').name).toBe('mine')
    expect(store.get('m').dirty).toBe(true)

    await store.reload('m')
    expect(store.get('m').name).toBe('other user')
    expect(store.get('m').version).toBe(2)
    expect(store.get('m').dirty).toBe(false)
  })

  it('черновик восстанавливается после перезагрузки страницы, если карту не меняли', async () => {
    let store = useMapsStore()
    await store.create({ ...MAP, id: 'm' })
    store.update('m', { waypoints: [waypoint('draft')] })
    window.dispatchEvent(new Event('beforeunload'))            // черновик записан

    setActivePinia(createPinia())
    store = useMapsStore()
    expect(await store.open('m')).toBe('restored')
    expect(store.get('m').waypoints).toEqual([waypoint('draft')])
    expect(store.get('m').dirty).toBe(true)
    expect(JSON.parse(localStorage.getItem('fm.maps.drafts.v1')).m.pgmDataUrl).toBeUndefined()   // без картинки
  })

  it('черновик выбрасывается, если карту за это время сохранили в fms', async () => {
    let store = useMapsStore()
    await store.create({ ...MAP, id: 'm' })
    store.update('m', { waypoints: [waypoint('draft')] })
    window.dispatchEvent(new Event('beforeunload'))
    await api.maps.updateMap('m', { version: 1, name: 'saved elsewhere' })

    setActivePinia(createPinia())
    store = useMapsStore()
    expect(await store.open('m')).toBe('discarded')
    expect(store.get('m').waypoints).toEqual([])
    expect(store.get('m').dirty).toBe(false)
    expect(JSON.parse(localStorage.getItem('fm.maps.drafts.v1') || '{}').m).toBeUndefined()
  })

  it('после save черновика нет', async () => {
    const store = useMapsStore()
    await store.create({ ...MAP, id: 'm' })
    store.update('m', { name: 'x' })
    window.dispatchEvent(new Event('beforeunload'))
    await store.save('m')
    window.dispatchEvent(new Event('beforeunload'))
    expect(JSON.parse(localStorage.getItem('fm.maps.drafts.v1')).m).toBeUndefined()
  })

  it('remove удаляет карту и её черновик', async () => {
    const store = useMapsStore()
    await store.create({ ...MAP, id: 'm' })
    store.update('m', { name: 'x' })
    window.dispatchEvent(new Event('beforeunload'))
    await store.remove('m')
    expect(store.get('m')).toBeNull()
    await expect(api.maps.getMap('m')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(JSON.parse(localStorage.getItem('fm.maps.drafts.v1')).m).toBeUndefined()
  })

  it('load не трогает открытую карту с несохранёнными правками', async () => {
    const store = useMapsStore()
    await store.create({ ...MAP, id: 'm' })
    store.update('m', { name: 'mine' })
    await store.load()
    expect(store.get('m').full).toBe(true)
    expect(store.get('m').name).toBe('mine')
  })
})
