import { z } from 'zod'

/**
 * Zod-схемы для runtime-валидации ответов бэка. Пойманное несовпадение
 * бросит `ApiError(500, 'SCHEMA_MISMATCH', ...)` — сразу видно что бэк
 * поехал с контракта, без гадания на прод-мониторинге.
 *
 * Все схемы соответствуют `docs/API_CONTRACT.md`.
 */

// === Общее ===
export const IsoDateTime = z.string().datetime({ offset: true })

export const ApiErrorBody = z.object({
  code: z.string(),
  message: z.string(),
  details: z.any().optional(),
})

// === Auth ===
export const LoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
export const LoginResponse = z.object({
  token: z.string(),
  refreshToken: z.string(),
  expiresAt: IsoDateTime,
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    role: z.enum(['operator', 'admin', 'viewer']),
  }),
})
export const RefreshRequest = z.object({ refreshToken: z.string() })
export const RefreshResponse = LoginResponse.pick({
  token: true, refreshToken: true, expiresAt: true,
})

// === Maps ===
export const MapMeta = z.object({
  resolution: z.number().positive(),
  origin: z.tuple([z.number(), z.number(), z.number()]),
  occupiedThresh: z.number().min(0).max(1).optional(),
  freeThresh: z.number().min(0).max(1).optional(),
  negate: z.union([z.literal(0), z.literal(1)]).optional(),
  mode: z.enum(['trinary', 'scale', 'raw']).optional(),
})
// Action узла/ребра (VDA 5050 v3, 7.3). Значение параметра — любой JSON.
export const MapAction = z.object({
  actionId: z.string(),
  actionType: z.string(),
  blockingType: z.enum(['NONE', 'SOFT', 'SINGLE', 'HARD']),
  actionDescriptor: z.string().optional(),
  actionParameters: z.array(z.object({
    key: z.string(),
    value: z.any(),
  })).optional().default([]),
  retriable: z.boolean().optional(),
})
// Action в ACTION-зоне — без actionId (его генерирует робот)
export const ZoneAction = MapAction.omit({ actionId: true })

export const Waypoint = z.object({
  id: z.string(),
  u: z.number(),
  v: z.number(),
  name: z.string(),
  description: z.string().optional().default(''),
  mapId: z.string().optional().default(''),
  actions: z.array(MapAction).optional().default([]),
  // Мировые радианы; нет поля — ориентация любая
  theta: z.number().optional(),
  allowedDeviationXY: z.object({ a: z.number(), b: z.number(), theta: z.number() }).optional(),
  allowedDeviationTheta: z.number().optional(),
})
export const Corridor = z.object({
  leftWidth: z.number().nonnegative(),
  rightWidth: z.number().nonnegative(),
  corridorReferencePoint: z.enum(['KINEMATIC_CENTER', 'CONTOUR']).optional(),
  releaseRequired: z.boolean().optional(),
  releaseLossBehavior: z.enum(['STOP', 'RETURN']).optional(),
})
export const Edge = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  cost: z.number().nonnegative().default(0),
  maxSpeed: z.number().positive().default(1),
  maximumMobileRobotHeight: z.number().nonnegative().optional(),
  minimumLoadHandlingDeviceHeight: z.number().nonnegative().optional(),
  orientation: z.number().optional(),
  orientationType: z.enum(['GLOBAL', 'TANGENTIAL']).optional(),
  direction: z.string().optional(),
  reachOrientationBeforeEntering: z.boolean().optional(),
  maximumRotationSpeed: z.number().nonnegative().optional(),
  corridor: Corridor.optional(),
  actions: z.array(MapAction).optional().default([]),
})
// Зона карты (VDA 5050 v3, 6.4). Вершины в пикселях карты, углы — мировые радианы.
// Поля типа (maximumSpeed, direction, ...) — см. lib/vda5050.js ZONE_TYPES.
export const Zone = z.object({
  id: z.string(),
  type: z.enum([
    'BLOCKED', 'LINE_GUIDED', 'RELEASE', 'COORDINATED_REPLANNING', 'SPEED_LIMIT',
    'ACTION', 'PRIORITY', 'PENALTY', 'DIRECTED', 'BIDIRECTED',
  ]),
  name: z.string().optional().default(''),
  vertices: z.array(z.object({ u: z.number(), v: z.number() })).min(3),
  maximumSpeed: z.number().optional(),
  entryActions: z.array(ZoneAction).optional(),
  duringActions: z.array(ZoneAction).optional(),
  exitActions: z.array(ZoneAction).optional(),
  releaseLossBehavior: z.enum(['STOP', 'CONTINUE', 'EVACUATE']).optional(),
  priorityFactor: z.number().min(0).max(1).optional(),
  penaltyFactor: z.number().min(0).max(1).optional(),
  direction: z.number().optional(),
  directedLimitation: z.enum(['SOFT', 'RESTRICTED', 'STRICT']).optional(),
  bidirectedLimitation: z.enum(['SOFT', 'RESTRICTED']).optional(),
})
export const Station = z.object({
  id: z.string(),
  u: z.number(),
  v: z.number(),
  name: z.string(),
  kind: z.enum(['charge', 'loading', 'parking', 'custom']),
  description: z.string().optional().default(''),
  interactionNodeIds: z.array(z.string()).default([]),
})
export const MapEntity = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  meta: MapMeta,
  pgmDataUrl: z.string().optional(),
  waypoints: z.array(Waypoint).default([]),
  edges: z.array(Edge).default([]),
  stations: z.array(Station).default([]),
  zones: z.array(Zone).default([]),
  assignedRobots: z.array(z.string()).default([]),
  createdAt: IsoDateTime.optional(),
  updatedAt: IsoDateTime.optional(),
})
export const MapList = z.array(MapEntity)

// === Robots (контракт v2, раздел 5) ===
// Робот целиком: spec (пишет control) + status (dispatch) + availability (control).
// Enum'ы из статуса робота (connection, operatingMode, ...) — строки: их значения приходят от робота
// по VDA 5050, и неизвестное значение не должно ронять весь список.
export const RobotLifecycle = z.enum(['ACTIVE', 'PENDING_DELETE'])
export const AvailabilityState = z.enum([
  'OFFLINE', 'NOT_READY', 'IDLE', 'BUSY', 'CHARGING', 'PAUSED', 'ERROR', 'DELETING',
])
export const Availability = z.object({
  state: AvailabilityState,
  reasons: z.array(z.object({ code: z.string(), message: z.string() })).default([]),
})
export const RobotErrorV2 = z.object({
  errorType: z.string(),
  level: z.string(),                       // WARNING | URGENT | CRITICAL | FATAL
  description: z.string().default(''),
  hint: z.string().default(''),
  references: z.record(z.string(), z.string()).default({}),
})
export const RobotStatusV2 = z.object({
  connection: z.string(),                  // UNKNOWN | ONLINE | OFFLINE | HIBERNATING | CONNECTION_BROKEN | STALE
  operatingMode: z.string(),
  pose: z.object({ x: z.number(), y: z.number(), theta: z.number(), mapId: z.string() }).nullable(),
  localized: z.boolean(),
  lastNodeId: z.string(),
  driving: z.boolean(),
  paused: z.boolean(),
  power: z.object({
    stateOfCharge: z.number(),
    charging: z.boolean(),
    voltage: z.number().nullable(),
    range: z.number().nullable(),
  }),
  safety: z.object({ emergencyStop: z.string(), fieldViolation: z.boolean() }),
  errors: z.array(RobotErrorV2).default([]),
  loads: z.array(z.object({ loadId: z.string(), loadType: z.string() })).default([]),
  missionId: z.string().nullable(),
  factsheetReceivedAt: IsoDateTime.nullable(),
  lastStateAt: IsoDateTime.nullable(),
})
export const RobotV2 = z.object({
  id: z.string(),
  name: z.string(),
  manufacturer: z.string(),
  serialNumber: z.string(),
  labels: z.record(z.string(), z.string()).default({}),
  lifecycle: RobotLifecycle,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  status: RobotStatusV2.nullable(),        // null — от робота ещё ничего не было
  availability: Availability.nullable(),   // null — control ещё не посчитал
  graphPosition: z.any().nullable(),       // позже, вместе с картами
  info: z.any().nullable(),                // позже: выжимка из factsheet
})
export const RobotV2List = z.array(RobotV2)

// POST /fms/robots. manufacturer + serialNumber — как в топиках робота (amr/v3/<manufacturer>/<serialNumber>/…)
export const RegisterRobotRequest = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().optional(),
  manufacturer: z.string().min(1),
  serialNumber: z.string().min(1),
  labels: z.record(z.string(), z.string()).optional(),
})

// Внутренний робот, который ест UI (таблица, карта, дашборд). Строится из RobotV2.
// status — фронтовое состояние для цвета и фильтров; пока оно выводится из availability
// (переходная таблица, заменим на availability целиком на шаге U-3).
const STATE_TO_STATUS = {
  OFFLINE: 'offline',
  NOT_READY: 'idle',
  IDLE: 'idle',
  BUSY: 'moving',
  CHARGING: 'charging',
  PAUSED: 'idle',
  ERROR: 'error',
  DELETING: 'offline',
}
export function toViewRobot(r) {
  const s = r.status
  return {
    id: r.id,
    name: r.name,
    manufacturer: r.manufacturer,
    serialNumber: r.serialNumber,
    labels: r.labels,
    lifecycle: r.lifecycle,
    model: `${r.manufacturer} · ${r.serialNumber}`,
    availability: r.availability,          // { state, reasons } или null
    status: STATE_TO_STATUS[r.availability?.state] || 'offline',
    connection: s?.connection || 'UNKNOWN',
    battery: Math.round(s?.power.stateOfCharge ?? 0),
    charging: s?.power.charging ?? false,
    x: s?.pose?.x ?? 0,
    y: s?.pose?.y ?? 0,
    theta: s?.pose?.theta ?? 0,
    mapId: s?.pose?.mapId ?? null,
    positionInitialized: s?.localized ?? false,
    lastNodeId: s?.lastNodeId || '',
    paused: s?.paused ?? false,
    errors: s?.errors ?? [],
    mission: s?.missionId ?? null,
    uptime: '—',
  }
}

// === Missions ===
export const Mission = z.object({
  id: z.string(),
  name: z.string(),
  mapId: z.string(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  robotId: z.string().nullable(),
  nodeIds: z.array(z.string()),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})
export const MissionList = z.array(Mission)
// Робота НЕ передаём — бэк-диспетчер сам выберет свободного и вернёт его в Mission.robotId
export const CreateMissionRequest = z.object({
  name: z.string().min(1),
  mapId: z.string(),
  nodeIds: z.array(z.string()).min(2),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional().default('normal'),
})

// === Alerts ===
export const Alert = z.object({
  id: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  robotId: z.string().nullable(),
  message: z.string(),
  code: z.string().optional(),
  createdAt: IsoDateTime,
  acknowledged: z.boolean().default(false),
})
export const AlertList = z.array(Alert)

// === Settings ===
export const AppSettings = z.object({
  backendUrl: z.string(),
  mqttUrl: z.string().optional(),
  units: z.enum(['metric', 'imperial']).default('metric'),
  language: z.string().default('en'),
})
