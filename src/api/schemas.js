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
// Карту хранит fms (контракт, раздел 6) как документ редактора: всё, что в нём есть, сервер возвращает
// как прислали. Поэтому схемы карты пропускают неизвестные поля (passthrough) — иначе поле, которого
// схема не знает (например, stopAllowed), пропало бы при чтении и при следующем сохранении.
// Граф проверяет сервер; здесь — только то, на что опирается код фронта.
export const MapMeta = z.object({
  resolution: z.number().positive(),
  origin: z.array(z.number()).min(2).max(3),
  occupiedThresh: z.number().min(0).max(1).optional(),
  freeThresh: z.number().min(0).max(1).optional(),
  negate: z.union([z.literal(0), z.literal(1)]).optional(),
  mode: z.enum(['trinary', 'scale', 'raw']).optional(),
}).passthrough()
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
  name: z.string().optional().default(''),
  description: z.string().optional().default(''),
  mapId: z.string().optional().default(''),
  actions: z.array(MapAction).optional().default([]),
  // Мировые радианы; нет поля — ориентация любая
  theta: z.number().optional(),
  allowedDeviationXY: z.object({ a: z.number(), b: z.number(), theta: z.number() }).optional(),
  allowedDeviationTheta: z.number().optional(),
}).passthrough()
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
  cost: z.number().default(0),                    // < 0 — только предупреждение, сервер считает 0
  maxSpeed: z.number().nonnegative().default(1),
  maximumMobileRobotHeight: z.number().nonnegative().optional(),
  minimumLoadHandlingDeviceHeight: z.number().nonnegative().optional(),
  orientation: z.number().optional(),
  orientationType: z.enum(['GLOBAL', 'TANGENTIAL']).optional(),
  direction: z.string().optional(),
  reachOrientationBeforeEntering: z.boolean().optional(),
  maximumRotationSpeed: z.number().nonnegative().optional(),
  corridor: Corridor.optional(),
  actions: z.array(MapAction).optional().default([]),
}).passthrough()
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
}).passthrough()
export const Station = z.object({
  id: z.string(),
  u: z.number(),
  v: z.number(),
  name: z.string().optional().default(''),
  kind: z.enum(['charge', 'loading', 'parking', 'custom']),
  description: z.string().optional().default(''),
  interactionNodeIds: z.array(z.string()).default([]),
}).passthrough()
export const MapEntity = z.object({
  id: z.string(),                       // = VDA mapId роботов
  name: z.string(),
  version: z.number().int().positive(), // растёт при каждом сохранении; PATCH обязан прислать ту, что загрузил
  width: z.number().positive(),
  height: z.number().positive(),
  meta: MapMeta,
  pgmDataUrl: z.string().nullable().optional(),
  waypoints: z.array(Waypoint).default([]),
  edges: z.array(Edge).default([]),
  stations: z.array(Station).default([]),
  zones: z.array(Zone).default([]),
  assignedRobots: z.array(z.string()).default([]),
  createdAt: IsoDateTime.optional(),
  updatedAt: IsoDateTime.optional(),
}).passthrough()
// GET /fms/maps — без графа и картинки: полную карту UI берёт GET /fms/maps/:id
export const MapSummary = MapEntity.omit({ pgmDataUrl: true, waypoints: true, edges: true, zones: true }).passthrough()
export const MapSummaryList = z.array(MapSummary)

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
// Состояние для цвета и фильтров — availability.state (lib/availability.js).
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
    connection: s?.connection || 'UNKNOWN',
    battery: Math.round(s?.power.stateOfCharge ?? 0),
    charging: s?.power.charging ?? false,
    x: s?.pose?.x ?? 0,
    y: s?.pose?.y ?? 0,
    theta: s?.pose?.theta ?? 0,
    mapId: s?.pose?.mapId ?? null,
    localized: s?.localized ?? null,  // Последний state от FMS. positionInitialized также обновляется из MQTT visualization.
    positionInitialized: s?.localized ?? false,
    driving: s?.driving ?? false,
    lastNodeId: s?.lastNodeId || '',
    paused: s?.paused ?? false,
    operatingMode: s?.operatingMode ?? null,
    safety: s?.safety ?? null,
    lastStateAt: s?.lastStateAt ?? null,
    errors: s?.errors ?? [],
    loads: s?.loads ?? [],
    mission: s?.missionId ?? null,
  }
}

// === Миссии (контракт v2, раздел 7) ===
export const MISSION_STATE_VALUES = ['QUEUED', 'ASSIGNED', 'RUNNING', 'PAUSED', 'CANCELING', 'COMPLETED', 'FAILED', 'CANCELED']
export const PRIORITY_VALUES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL']

const MissionAction = z.object({
  actionType: z.string(),
  blockingType: z.string().optional(),
  actionParameters: z.array(z.object({ key: z.string(), value: z.any() })).optional(),
}).passthrough()

const MissionStep = z.object({
  nodeId: z.string(),
  actions: z.array(MissionAction).default([]),
})

const StepState = z.object({
  state: z.string(),
  startedAt: IsoDateTime.nullable(),
  finishedAt: IsoDateTime.nullable(),
  waitingForTraffic: z.boolean().default(false),
  actions: z.array(z.object({ actionId: z.string(), actionType: z.string(), status: z.string() }).passthrough()).default([]),
}).passthrough()

export const Mission = z.object({
  id: z.string(),
  name: z.string(),
  mapId: z.string(),
  priority: z.enum(PRIORITY_VALUES),
  requestedRobotId: z.string().nullable(),
  robotId: z.string().nullable(),
  steps: z.array(MissionStep),
  state: z.enum(MISSION_STATE_VALUES),
  currentStep: z.number().int().nullable(),
  stepStates: z.array(StepState),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  createdAt: IsoDateTime,
  assignedAt: IsoDateTime.nullable(),
  startedAt: IsoDateTime.nullable(),
  finishedAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime,
  createdBy: z.string().nullable(),
}).passthrough()

export const MissionPage = z.object({ items: z.array(Mission), nextCursor: z.string().nullable() })

// Событие истории миссии (7.3): общие поля + поля своего type (state, reason, error, stepIndex, ...)
export const MissionEvent = z.object({
  id: z.number(),
  missionId: z.string(),
  at: IsoDateTime,
  robotId: z.string().nullable(),
  type: z.enum(['STATE', 'STEP', 'ACTION']),
}).passthrough()
export const MissionEventList = z.object({ items: z.array(MissionEvent) })

// === Маршруты роботов (контракт 7.4) ===
const RoutePart = z.object({ nodes: z.array(z.string()), edges: z.array(z.string()) })
export const RobotRoute = z.object({
  robotId: z.string(),
  mapId: z.string(),
  missionId: z.string(),
  stepIndex: z.number().int(),
  released: RoutePart,
  planned: RoutePart,
  goals: z.array(z.string()),
  nextMissionId: z.string().nullable(),
})
export const RobotRouteList = z.object({ items: z.array(RobotRoute) })

// === Тревоги и журнал (контракт 8) ===
export const SEVERITY_VALUES = ['INFO', 'WARNING', 'ERROR', 'CRITICAL']

export const Alarm = z.object({
  id: z.string(),
  severity: z.enum(SEVERITY_VALUES),
  source: z.string(),
  code: z.string(),
  title: z.string(),
  detail: z.string(),
  robotId: z.string().nullable(),
  missionId: z.string().nullable(),
  active: z.boolean(),
  createdAt: IsoDateTime,
  clearedAt: IsoDateTime.nullable(),
  acknowledgedAt: IsoDateTime.nullable(),
  acknowledgedBy: z.string().nullable(),
}).passthrough()
export const AlarmPage = z.object({ items: z.array(Alarm), nextCursor: z.string().nullable() })

// Событие журнала (8.4): общие поля + поля своего type
export const JournalEvent = z.object({
  id: z.number(),
  at: IsoDateTime,
  source: z.enum(['MISSION', 'ROBOT', 'ALARM', 'SYSTEM']),
  type: z.string(),
  robotId: z.string().nullable(),
  missionId: z.string().nullable(),
  alarmId: z.string().nullable(),
}).passthrough()
export const EventPage = z.object({ items: z.array(JournalEvent), nextCursor: z.string().nullable() })

// === Settings ===
export const AppSettings = z.object({
  backendUrl: z.string(),
  mqttUrl: z.string().optional(),
  units: z.enum(['metric', 'imperial']).default('metric'),
  language: z.string().default('en'),
})
