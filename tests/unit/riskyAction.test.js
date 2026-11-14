import { describe, it, expect, vi } from 'vitest'
import { runRisky, consequencesOf } from '../../src/composables/useRiskyAction'

const busy = { code: 'ROBOT_BUSY', message: 'Robot amr-01 is executing mission m-1', details: {} }
const consequences = { code: 'CONFIRMATION_REQUIRED', message: 'x', details: { warnings: ['dead end at n7', 'robot amr-01 loses its node'] } }

// Сервер: без force — ошибка, с force — ok
const server = (error) => vi.fn(async (force) => { if (!force) throw error; return 'done' })

describe('runRisky — 409 with consequences, retry with force', () => {
  it('no consequences — done at once, nobody asked', async () => {
    const run = vi.fn(async () => 'done')
    const confirm = vi.fn()
    expect(await runRisky(run, { ask: true, confirm, notify: vi.fn() })).toBe('done')
    expect(run).toHaveBeenCalledWith(false)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('ask on — consequences shown, agreed — repeated with force', async () => {
    const run = server(consequences)
    const confirm = vi.fn(async () => true)
    expect(await runRisky(run, { ask: true, confirm, notify: vi.fn() })).toBe('done')
    expect(confirm).toHaveBeenCalledWith(['dead end at n7', 'robot amr-01 loses its node'])
    expect(run.mock.calls).toEqual([[false], [true]])
  })

  it('ask on — declined — nothing repeated, null', async () => {
    const run = server(busy)
    expect(await runRisky(run, { ask: true, confirm: async () => false, notify: vi.fn() })).toBeNull()
    expect(run.mock.calls).toEqual([[false]])
  })

  it('ask off — repeated with force at once, consequences as a notification', async () => {
    const run = server(busy)
    const notify = vi.fn()
    const confirm = vi.fn()
    expect(await runRisky(run, { ask: false, confirm, notify })).toBe('done')
    expect(confirm).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(['Robot amr-01 is executing mission m-1'])
  })

  it('other errors go to the caller as they are', async () => {
    const conflict = { code: 'VERSION_CONFLICT', message: 'reload' }
    await expect(runRisky(server(conflict), { ask: true, confirm: vi.fn(), notify: vi.fn() })).rejects.toBe(conflict)
  })

  it('consequences — warnings, otherwise the message', () => {
    expect(consequencesOf(consequences)).toHaveLength(2)
    expect(consequencesOf(busy)).toEqual([busy.message])
  })
})
