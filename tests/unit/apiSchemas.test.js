import { describe, it, expect } from 'vitest'
import * as S from '../../src/api/schemas'

describe('API schemas — happy path', () => {
  it('LoginResponse parses valid payload', () => {
    const ok = S.LoginResponse.safeParse({
      token: 't', refreshToken: 'r',
      expiresAt: '2026-08-27T11:15:00Z',
      user: { id: 'u1', email: 'a@b.com', name: 'A', role: 'admin' },
    })
    expect(ok.success).toBe(true)
  })

  it('MapEntity accepts minimum fields', () => {
    const ok = S.MapEntity.safeParse({
      id: 'm1', name: 'M', width: 100, height: 100,
      meta: { resolution: 0.05, origin: [0, 0, 0] },
    })
    expect(ok.success).toBe(true)
  })

  it('Mission requires createdAt as ISO', () => {
    const bad = S.Mission.safeParse({
      id: 'M', name: 'x', mapId: 'm', status: 'pending',
      robotId: null, nodeIds: [],
      createdAt: 'yesterday', updatedAt: 'yesterday',
    })
    expect(bad.success).toBe(false)
  })

  it('Alert acknowledged defaults to false', () => {
    const ok = S.Alert.parse({
      id: 'A', severity: 'info', robotId: null, message: 'x',
      createdAt: '2026-08-27T11:00:00Z',
    })
    expect(ok.acknowledged).toBe(false)
  })

  it('CreateMissionRequest requires >= 2 nodeIds', () => {
    const bad = S.CreateMissionRequest.safeParse({
      name: 'x', mapId: 'm', nodeIds: ['only-one'],
    })
    expect(bad.success).toBe(false)
  })

  it('Waypoint action blockingType must be enum', () => {
    const bad = S.Waypoint.safeParse({
      id: 'n1', u: 0, v: 0, name: 'n',
      actions: [{ actionId: 'a', actionType: 'pick', blockingType: 'HARDCORE' }],
    })
    expect(bad.success).toBe(false)
  })
})

describe('Robot v2 (контракт, раздел 5.1) → внутренний робот', () => {
  // Как его отдаёт база fms (GET /fms/robots/:id)
  const robot = {
    id: 'amr-01', name: 'AMR 01', manufacturer: 'ktc', serialNumber: 'amr1', labels: { zone: 'A' },
    lifecycle: 'ACTIVE', createdAt: '2026-11-03T19:47:59.396Z', updatedAt: '2026-11-03T19:47:59.396Z',
    status: {
      connection: 'ONLINE', operatingMode: 'AUTOMATIC',
      pose: { x: 12.4, y: 8.2, theta: 1.57, mapId: 'map_1' }, localized: true, lastNodeId: 'n7',
      driving: false, paused: false,
      power: { stateOfCharge: 78.4, charging: false, voltage: 48, range: null },
      safety: { emergencyStop: 'NONE', fieldViolation: false },
      errors: [{ errorType: 'noRoute', level: 'WARNING', description: 'x', hint: '', references: { nodeId: 'n8' } }],
      loads: [], missionId: 'm-102',
      factsheetReceivedAt: '2026-11-03T19:47:59.000Z', lastStateAt: '2026-11-03T19:47:59.606Z',
    },
    availability: { state: 'BUSY', reasons: [] },
    graphPosition: null,
    info: null,
  }

  it('parses a full robot', () => {
    expect(S.RobotV2.safeParse(robot).success).toBe(true)
  })

  it('parses a robot without status and availability (nothing from the robot yet)', () => {
    expect(S.RobotV2.safeParse({ ...robot, status: null, availability: null }).success).toBe(true)
  })

  it('rejects an unknown availability state and lifecycle', () => {
    expect(S.RobotV2.safeParse({ ...robot, availability: { state: 'FLYING', reasons: [] } }).success).toBe(false)
    expect(S.RobotV2.safeParse({ ...robot, lifecycle: 'GONE' }).success).toBe(false)
  })

  it('maps to the internal robot', () => {
    const r = S.toViewRobot(S.RobotV2.parse(robot))
    expect(r.id).toBe('amr-01')
    expect(r.name).toBe('AMR 01')
    expect(r.serialNumber).toBe('amr1')
    expect(r.availability.state).toBe('BUSY')
    expect(r.driving).toBe(false)
    expect(r.battery).toBe(78)
    expect(r.x).toBe(12.4)
    expect(r.mapId).toBe('map_1')
    expect(r.mission).toBe('m-102')
    expect(r.connection).toBe('ONLINE')
    expect(r.positionInitialized).toBe(true)
  })

  it('robot without status and availability has empty defaults', () => {
    const r = S.toViewRobot({ ...robot, status: null, availability: null })
    expect(r.availability).toBe(null)
    expect(r.driving).toBe(false)
    expect(r.battery).toBe(0)
    expect(r.mission).toBe(null)
    expect(r.connection).toBe('UNKNOWN')
  })

  it('register request checks the id like the server does', () => {
    const ok = { id: 'amr-01', manufacturer: 'ktc', serialNumber: 'amr1' }
    expect(S.RegisterRobotRequest.safeParse(ok).success).toBe(true)
    expect(S.RegisterRobotRequest.safeParse({ ...ok, id: 'with space' }).success).toBe(false)
    expect(S.RegisterRobotRequest.safeParse({ ...ok, serialNumber: '' }).success).toBe(false)
  })
})

describe('MapEntity — поля VDA 5050 v3 и зоны', () => {
  const base = {
    id: 'm1', name: 'F1', width: 100, height: 100,
    meta: { resolution: 0.05, origin: [0, 0, 0] },
  }

  it('сохраняет атрибуты узла/ребра и зоны', () => {
    const m = S.MapEntity.parse({
      ...base,
      waypoints: [{ id: 'n1', u: 1, v: 2, name: 'n1', theta: 1.57, allowedDeviationXY: { a: 0.2, b: 0.1, theta: 0 },
        actions: [{ actionId: 'a', actionType: 'waitForTrigger', blockingType: 'HARD', actionParameters: [{ key: 'triggerType', value: ['LOCAL'] }] }] }],
      edges: [{ id: 'e', from: 'n1', to: 'n1', maxSpeed: 1, corridor: { leftWidth: 0.5, rightWidth: 0.5, releaseRequired: true, releaseLossBehavior: 'RETURN' } }],
      zones: [{ id: 'z1', type: 'SPEED_LIMIT', vertices: [{ u: 0, v: 0 }, { u: 10, v: 0 }, { u: 10, v: 10 }], maximumSpeed: 0.3 }],
    })
    expect(m.waypoints[0].theta).toBe(1.57)
    expect(m.waypoints[0].actions[0].actionParameters[0].value).toEqual(['LOCAL'])
    expect(m.edges[0].corridor.releaseLossBehavior).toBe('RETURN')
    expect(m.zones[0].maximumSpeed).toBe(0.3)
  })

  it('отклоняет зону с неизвестным типом или < 3 вершин', () => {
    expect(() => S.MapEntity.parse({ ...base, zones: [{ id: 'z', type: 'LAVA', vertices: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }] }] })).toThrow()
    expect(() => S.MapEntity.parse({ ...base, zones: [{ id: 'z', type: 'BLOCKED', vertices: [{ u: 0, v: 0 }] }] })).toThrow()
  })
})
