import { describe, expect, it, vi } from 'vitest'
import { createLiveRoutePoller } from '../../src/lib/liveRoutePolling'

const routesA = [{ robotId: 'robot-a', mapId: 'A' }]
const routesB = [{ robotId: 'robot-b', mapId: 'B' }]

function deferred() {
  let resolve, reject
  const promise = new Promise((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

function setup() {
  const listRoutes = vi.fn()
  const now = vi.fn(() => 1000)
  const onChange = vi.fn()
  const poller = createLiveRoutePoller({ listRoutes, now, onChange })
  return { poller, listRoutes, now, onChange }
}

describe('Live Map route polling', () => {
  it('reports a failed first request, then accepts a successful empty result', async () => {
    const { poller, listRoutes, onChange } = setup()
    listRoutes.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])

    await poller.selectMap('A')
    expect(onChange).toHaveBeenLastCalledWith({ status: 'unavailable', routes: [], updatedAt: null })

    await poller.refresh()
    expect(onChange).toHaveBeenLastCalledWith({ status: 'ready', routes: [], updatedAt: 1000 })

    listRoutes.mockRejectedValueOnce(new Error('offline'))
    await poller.refresh()
    expect(onChange).toHaveBeenLastCalledWith({ status: 'stale', routes: [], updatedAt: 1000 })
  })

  it('keeps the last successful routes and time across failures, then replaces them on recovery', async () => {
    const { poller, listRoutes, now, onChange } = setup()
    listRoutes.mockResolvedValueOnce(routesA)
    await poller.selectMap('A')
    expect(onChange).toHaveBeenLastCalledWith({ status: 'ready', routes: routesA, updatedAt: 1000 })

    now.mockReturnValue(2000)
    listRoutes.mockRejectedValue(new Error('offline'))
    await poller.refresh()
    await poller.refresh()
    expect(onChange).toHaveBeenLastCalledWith({ status: 'stale', routes: routesA, updatedAt: 1000 })

    now.mockReturnValue(4000)
    listRoutes.mockResolvedValueOnce([])
    await poller.refresh()
    expect(onChange).toHaveBeenLastCalledWith({ status: 'ready', routes: [], updatedAt: 4000 })
  })

  it('applies just one request while several refreshes for the same map overlap', async () => {
    const { poller, listRoutes, onChange } = setup()
    const request = deferred()
    listRoutes.mockReturnValueOnce(request.promise)

    const first = poller.selectMap('A')
    const next = poller.refresh()
    request.resolve(routesA)
    await Promise.all([first, next])
    expect(listRoutes).toHaveBeenCalledTimes(1)
    expect(listRoutes).toHaveBeenCalledWith('A')
    expect(onChange).toHaveBeenLastCalledWith({ status: 'ready', routes: routesA, updatedAt: 1000 })
  })

  it('ignores a late result from map A and a late error from B after switching back to A', async () => {
    const { poller, listRoutes, onChange, now } = setup()
    const oldA = deferred()
    const pendingB = deferred()
    listRoutes.mockResolvedValueOnce(routesA).mockReturnValueOnce(oldA.promise)
      .mockReturnValueOnce(pendingB.promise).mockResolvedValueOnce([])

    await poller.selectMap('A')
    const refreshA = poller.refresh()
    const loadB = poller.selectMap('B')
    expect(onChange).toHaveBeenLastCalledWith({ status: 'loading', routes: [], updatedAt: null })

    now.mockReturnValue(4000)
    await poller.selectMap('A')
    expect(onChange).toHaveBeenLastCalledWith({ status: 'ready', routes: [], updatedAt: 4000 })
    onChange.mockClear()
    oldA.resolve(routesA)
    pendingB.reject(new Error('late failure from B'))
    await Promise.all([refreshA, loadB])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the selected map B when a successful reply belongs to the previous map', async () => {
    const { poller, listRoutes, onChange } = setup()
    const pendingA = deferred()
    listRoutes.mockReturnValueOnce(pendingA.promise).mockResolvedValueOnce(routesB)
    const loadA = poller.selectMap('A')
    await poller.selectMap('B')
    pendingA.resolve(routesA)
    await loadA
    expect(onChange).toHaveBeenLastCalledWith({ status: 'ready', routes: routesB, updatedAt: 1000 })
  })

  it('ignores a response that arrives after leaving Live Map', async () => {
    const { poller, listRoutes, onChange } = setup()
    const pending = deferred()
    listRoutes.mockReturnValueOnce(pending.promise)
    const load = poller.selectMap('A')
    poller.dispose()
    onChange.mockClear()
    pending.resolve(routesA)
    await load
    expect(onChange).not.toHaveBeenCalled()
  })
})
