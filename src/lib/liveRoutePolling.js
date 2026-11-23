// Каждый выбор карты получает свой объект, в том числе при возврате A → B → A.
export function createLiveRoutePoller({ listRoutes, onChange, isVisible = () => true, now = Date.now }) {
  let selected = null

  function selectMap(id) {
    const snapshot = { status: id ? 'loading' : 'idle', routes: [], updatedAt: null }
    selected = id ? { id, snapshot, pending: false } : null
    onChange(snapshot)
    return refresh()
  }

  async function refresh() {
    const map = selected
    if (!map || map.pending || !isVisible()) return
    map.pending = true
    try {
      const routes = await listRoutes(map.id)
      if (map !== selected) return
      map.snapshot = { status: 'ready', routes, updatedAt: now() }
    } catch {
      if (map !== selected) return
      const status = map.snapshot.updatedAt === null ? 'unavailable' : 'stale'
      if (map.snapshot.status === status) return
      map.snapshot = { ...map.snapshot, status }
    } finally {
      map.pending = false
    }
    onChange(map.snapshot)
  }

  function dispose() {
    selected = null
  }

  return { selectMap, refresh, dispose }
}
