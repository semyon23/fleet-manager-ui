# API Contract — fms ↔ Web UI

Версия 2 (черновик), 2026-10-14. Заменяет версию от 2026-08-27.
Правка 2026-10-14: WebSocket fms убран — обновления опросом REST, позже события fms в MQTT (раздел 9).
Правка 2026-11-14: миссии — как они работают в fms (раздел 7): свой `id` и повтор запроса, проверки
при создании, отмена, следующая миссия робота; история миссии (7.3), маршруты роботов (7.4), период
`from`/`to` в списке миссий, ошибка `CONFIRMATION_REQUIRED` (2.1, 6.3).

Документ — источник истины для фронта и бэка. Меняем контракт только через правку этого файла.

**Главное, что изменилось по сравнению с версией 1:**

- Роботы: формат `spec + status + availability` вместо `name/spec/status{state,…}`.
  Регистрация — с `serialNumber`, класс робота берётся из factsheet.
- Карты хранятся на сервере (fleet_database); у карты есть `version`. zoneSet собирает сервер.
  У узла появляется `stopAllowed`.
- Миссии: шаги с действиями (`steps[{nodeId, actions}]`) вместо `nodeIds`, новые состояния и
  прогресс по шагам.
- Тревоги: `/fms/alarms` вместо `/fms/alerts`, утверждён формат.
- WebSocket fms убран. Поза — из MQTT-брокера, остальное — опросом REST; позже события fms
  публикуются в тот же брокер (раздел 9).
- MQTT напрямую от брокера — VDA 5050 v3: `amr/v3/...`, `mobileRobotPosition`.
- Убрано из fms: teleop, reboot / shutdown, режим построения карты — это напрямую с роботом
  (раздел 12).

---

## 1. Архитектура

```
                       ┌──────────────── шлюз /api (nginx / Envoy, JWT) ────────────────┐
 браузер ──── HTTP ───►│  GET  /api/fms/robots, /maps, /missions, /alarms  → fleet_database (только чтение)
                       │  GET  /api/fms/routes                             → fleet_control (маршруты в памяти)
                       │  POST/PATCH/DELETE /api/fms/*                     → fleet_control
                       │  /api/auth/*, /api/health                         → fleet_control
                       └────────────────────────────────────────────────────────────────┘
 браузер ── MQTT/WS ──► брокер: amr/v3/+/+/visualization, connection (только чтение)
                                позже: fms/v1/# — события fms (раздел 9.2)
```

- **Фронту маршрутизация не видна:** один базовый URL `{apiBaseUrl}` = `.../api`, все пути
  `/fms/*`. Таблица «какой сервис отвечает» нужна бэку и шлюзу.
- **Чтение** списков, карточек и истории — fleet_database (REST поверх Postgres, только чтение).
  Исключение — маршруты роботов `GET /fms/routes` (7.4): их знает только fleet_control, в базу они не
  пишутся.
- **Любое действие** (создать, изменить, удалить, отменить, подтвердить) — fleet_control. Он
  проверяет и пишет в базу сам.
- **Изменения статусов, миссий, тревог** — опросом REST (раздел 9.1); позже — события fms в
  MQTT-брокере (раздел 9.2).
- **Живая поза робота** (5–10 Гц) — напрямую из MQTT-брокера (раздел 10). Через fms поза идёт только
  в статусе робота, не чаще 1 Гц.
- fleet_dispatch (связь с роботами) фронту не виден.

---

## 2. Общие правила

| Что | Правило |
|---|---|
| Формат | JSON, `Content-Type: application/json`, UTF-8 |
| Имена полей | `camelCase` |
| Enum | строки ЗАГЛАВНЫМИ, как в VDA 5050: `ONLINE`, `HARD`, `CRITICAL` |
| Время | ISO 8601 UTC с миллисекундами: `2026-10-14T10:15:00.123Z` |
| Единицы | метры, радианы, м/с, проценты (0..100) |
| Id | строки. Id робота задаёт оператор, остальные (миссии, тревоги, карты) — сервер |
| Пустые коллекции | всегда `[]` или `{}` по типу поля, никогда не наоборот; `null` — «нет значения» |
| Необязательные поля | помечены `?`; отсутствующее поле = `null` |

### 2.1. Ошибки

Все ответы не 2xx:

```json
{ "code": "ROBOT_BUSY", "message": "Robot amr-01 is executing mission m-102", "details": {} }
```

`message` — английский текст для оператора, фронт может показать как есть. `details` — по коду.

| HTTP | `code` | Когда |
|---|---|---|
| 400 | `INVALID_INPUT` | Не прошла проверка полей. `details: { field: "почему" }` |
| 400 | `INVALID_MAP` | Карта не прошла проверку. `details: { errors: [..], warnings: [..] }` |
| 400 | `INVALID_MISSION` | Миссию нельзя выполнить: между шагами нет пути по графу. `message` называет шаги, `details: {}` |
| 401 | `UNAUTHORIZED` | Нет токена или он просрочен |
| 403 | `FORBIDDEN` | Роли не хватает прав |
| 404 | `NOT_FOUND` | Нет такой записи |
| 409 | `ALREADY_EXISTS` | Id занят, или пара `manufacturer + serialNumber` уже зарегистрирована, или миссия с этим `id` уже есть с другим запросом (7.2) |
| 409 | `VERSION_CONFLICT` | Карту изменили, пока её редактировали (раздел 6.3) |
| 409 | `CONFIRMATION_REQUIRED` | У действия есть последствия, которые оператор должен подтвердить. `details: { warnings: [..] }`. Подтвердил — повторить тот же запрос с `?force=true` (6.3) |
| 409 | `ROBOT_BUSY` | Действие невозможно, пока у робота активная миссия |
| 409 | `INVALID_STATE` | Действие невозможно в текущем состоянии (отмена завершённой миссии и т.п.) |
| 503 | `UNAVAILABLE` | Сервис недоступен, повторить позже |
| 500 | `INTERNAL` | Ошибка сервера |

### 2.2. Авторизация

Без изменений.

- Все пути, кроме `POST /auth/login` и `POST /auth/refresh`, требуют `Authorization: Bearer <jwt>`.
- Роли:
  - `viewer` — только чтение;
  - `operator` — миссии, пауза, подтверждение тревог;
  - `admin` — всё, включая роботов и карты.

### 2.3. История и пагинация

Списки, которые растут (миссии, тревоги), отдаются страницами:

```
GET /fms/missions?limit=50&before=<cursor>
→ 200 { "items": [...], "nextCursor": "..." | null }
```

- `limit` — 1..200, по умолчанию 50.
- `nextCursor` — передать как есть в `before` за следующей страницей; `null` — страниц больше нет.
- Период — `from` / `to`, время ISO 8601: `?from=2026-11-01T00:00:00Z&to=2026-12-01T00:00:00Z`. Полуинтервал
  `[from, to)`: `from` входит, `to` — нет, поэтому соседние периоды не пересекаются. Можно с долями
  секунды и смещением, но `+` в адресе — `%2B` (`2026-11-14T03:00:00%2B03:00`), иначе он придёт пробелом.
  `to` не позже `from` — 400 `INVALID_INPUT`.

Списки роботов и карт — без пагинации: простой массив.

---

## 3. Auth

Без изменений по сравнению с версией 1.

| Метод | Путь | Тело → ответ |
|---|---|---|
| POST | `/auth/login` | `{email, password}` → `{token, refreshToken, expiresAt, user}` |
| POST | `/auth/refresh` | `{refreshToken}` → то же, что login |
| POST | `/auth/logout` | → 204 |
| GET | `/auth/me` | → `{id, email, name, role}` |

`role`: `viewer` | `operator` | `admin`.

---

## 4. Health

```
GET /health → 200
{
  "status": "OK" | "DEGRADED",
  "services": { "control": "OK", "database": "OK", "dispatch": "OK", "broker": "DOWN" }
}
```

Фронт показывает только кружок и время ответа:
- 200 и `OK` — зелёный;
- `DEGRADED` — жёлтый;
- нет ответа — красный.

---

## 5. Роботы

### 5.1. Объект `Robot`

```jsonc
{
  "id": "amr-01",                    // id в fms, задаёт оператор при регистрации
  "name": "AMR 01",                  // для людей; по умолчанию = id
  "manufacturer": "ktc",             // VDA manufacturer
  "serialNumber": "amr1",            // VDA serialNumber
  "labels": { "zone": "A" },
  "lifecycle": "ACTIVE",             // ACTIVE | PENDING_DELETE
  "createdAt": "...", "updatedAt": "...",

  "status": RobotStatus | null,      // null — от робота ещё ничего не было
  "availability": Availability,      // считает fleet_control
  "graphPosition": GraphPosition | null,

  "info": RobotInfo | null           // из factsheet; null — factsheet ещё не приходил
}
```

**`RobotStatus`** — последнее состояние робота. Пишет fleet_dispatch.

```jsonc
{
  "connection": "ONLINE",            // UNKNOWN | ONLINE | OFFLINE | HIBERNATING | CONNECTION_BROKEN | STALE
  "operatingMode": "AUTOMATIC",      // STARTUP | AUTOMATIC | SEMIAUTOMATIC | INTERVENED | MANUAL | SERVICE | TEACH_IN
  "pose": { "x": 12.3, "y": 4.5, "theta": 1.57, "mapId": "map-a1" } | null,
  "localized": true,
  "lastNodeId": "n014",              // "" — нет
  "driving": false,
  "paused": false,
  "power": { "stateOfCharge": 76.5, "charging": false, "voltage": 48.1, "range": null },
  "safety": { "emergencyStop": "NONE", "fieldViolation": false },   // NONE | MANUAL | REMOTE
  "errors": [
    { "errorType": "batteryLow", "level": "WARNING", "description": "...", "hint": "", "references": {} }
  ],                                 // level: WARNING | URGENT | CRITICAL | FATAL
  "loads": [ { "loadId": "PALLET-1", "loadType": "EPAL" } ],
  "missionId": "m-102" | null,
  "factsheetReceivedAt": "..." | null,
  "lastStateAt": "..."               // время последнего state от робота
}
```

- `STALE` — связь по VDA есть, но state давно не приходил.
- `UNKNOWN` — робот зарегистрирован, но ещё ничего не присылал.
- `pose` здесь обновляется не чаще раза в секунду. Плавное движение на Live Map — из MQTT
  (раздел 10).

**`Availability`** — может ли робот брать работу и почему нет. Считает fleet_control.

```jsonc
{
  "state": "NOT_READY",   // OFFLINE | NOT_READY | IDLE | BUSY | CHARGING | PAUSED | ERROR | DELETING
  "reasons": [
    { "code": "NOT_ON_GRAPH", "message": "robot is not on a node of map map_1, set its position first" }
  ]
}
```

| `state` | Значение |
|---|---|
| `OFFLINE` | `connection` не `ONLINE` |
| `NOT_READY` | На связи, но работать не может — см. `reasons` |
| `IDLE` | Свободен, готов к миссии |
| `BUSY` | Выполняет миссию |
| `CHARGING` | Заряжается и свободен (может взять миссию, если заряда хватает) |
| `PAUSED` | На паузе |
| `ERROR` | Ошибка уровня CRITICAL / FATAL |
| `DELETING` | Удаляется (`lifecycle = PENDING_DELETE`) |

Коды `reasons` (список расширяемый, фронт показывает `message`):
- `NO_FACTSHEET`;
- `STARTUP`;
- `MODE_NOT_AUTOMATIC`;
- `NOT_LOCALIZED`;
- `UNKNOWN_MAP` — карты робота (`status.pose.mapId`) нет в fms: создать карту с этим id (раздел 6);
- `NOT_ON_GRAPH` — `status.lastNodeId` не узел карты робота (после включения робот узла не знает):
  поставить робота на узел — `POST /fms/robots/:id/position` (раздел 5.2);
- `MISSING_ACTIONS`;
- `LOW_BATTERY`;
- `EMERGENCY_STOP`;
- `FATAL_ERROR`.

Жёлтый тег «not calibrated» из версии 1 заменяется на `reasons`.

**`GraphPosition`** — где робот на графе карты. Считает fleet_control.

```jsonc
{ "kind": "ON_NODE", "nodeId": "n014", "edgeId": null }   // ON_NODE | ON_EDGE | OFF_GRAPH
```

**`RobotInfo`** — выжимка из factsheet для карточки робота.

```jsonc
{
  "seriesName": "MecanumBot",
  "robotClass": "CARRIER",               // VDA mobileRobotClass: FORKLIFT | CONVEYOR | TUGGER | CARRIER | ...
  "maximumSpeed": 1.0,
  "length": 0.8, "width": 0.6,
  "supportedActions": ["pick", "drop", "startCharging", "stopCharging"],
  "supportedZones": ["BLOCKED", "SPEED_LIMIT"],
  "batteryCharging": { "criticalLowChargingLevel": 10, "minimumDesiredChargingLevel": 30, "maximumDesiredChargingLevel": 90 },
  "softwareVersion": "0.1.0"
}
```

### 5.2. Пути

| Метод | Путь | Сервис | Тело → ответ |
|---|---|---|---|
| GET | `/fms/robots` | database | → `Robot[]` |
| GET | `/fms/robots/:id` | database | → `Robot` |
| GET | `/fms/robots/:id/factsheet` | database | → factsheet целиком, как прислал робот (VDA 5050 v3 JSON) |
| POST | `/fms/robots` | control | `RegisterRobot` → 201 `Robot` |
| PATCH | `/fms/robots/:id` | control | `{name?, labels?}` → `Robot` |
| DELETE | `/fms/robots/:id` | control | → 202 `Robot` (`lifecycle: PENDING_DELETE`) |
| POST | `/fms/robots/:id/pause` | control | → 202 |
| POST | `/fms/robots/:id/resume` | control | → 202 |
| POST | `/fms/robots/:id/position` | control | `{mapId, nodeId, theta?}` → 202 |
| POST | `/fms/robots/:id/park` | control | → 202 `Mission` (служебная миссия на парковку) |

**Регистрация:**

```json
POST /fms/robots
{ "id": "amr-01", "name": "AMR 01", "manufacturer": "ktc", "serialNumber": "amr1", "labels": {} }
```

- `id`, `manufacturer`, `serialNumber` обязательны.
- `id` — латиница, цифры, `-` и `_`, до 64 символов.
- 409 `ALREADY_EXISTS`, если занят `id` или пара `manufacturer + serialNumber`.
- `manufacturer` и `serialNumber` после регистрации не меняются. Если нужны другие — удалить робота
  и зарегистрировать заново.
- Класс робота в форме не задаётся: он приходит из factsheet (`info.robotClass`).

**Удаление** — мягкое:
1. Ответ 202, робот получает `lifecycle: PENDING_DELETE` и `availability.state: DELETING`.
2. fms отменяет миссию, отписывается от робота, чистит его retained-сообщения.
3. Робот пропадает из `GET /fms/robots`.

Если у робота активная миссия — 409 `ROBOT_BUSY`. Удалить всё равно: `DELETE /fms/robots/:id?force=true`
(миссия отменяется).

**Пауза.** `pause` / `resume` действуют на робота (VDA `startPause` / `stopPause`), а не на миссию.
Ответ 202 значит «команда отправлена». Факт — `status.paused` в статусе робота (виден при следующем опросе).

**Робот на узле.** Оператор говорит fms, на каком узле стоит робот. fms берёт координаты узла из графа карты
и шлёт роботу VDA `initializePosition`:

```json
POST /fms/robots/amr-01/position
{ "mapId": "map_1", "nodeId": "n1", "theta": 1.57 }
```

- `mapId`, `nodeId` обязательны. Узел — waypoint или станция карты.
- `theta` (рад) необязательна: нет — `theta` узла, у узла нет — прежняя ориентация робота.
- Ответ 202 значит «команда отправлена». Факт — `status.lastNodeId`, `status.pose` и `availability`
  при следующем опросе.
- Ошибки:
  - 400 `INVALID_INPUT` с `details.mapId` / `details.nodeId` / `details.theta` (в том числе узла нет на карте);
  - 404 `NOT_FOUND` — нет карты или робота;
  - 409 `ROBOT_BUSY` — у робота миссия (по VDA робот с заказом позицию не меняет);
  - 409 `INVALID_STATE` — робот не на связи;
  - 503 `UNAVAILABLE` — fms ещё загружает карты.

---

## 6. Карты

### 6.1. Объект `Map`

Формат версии 1 сохраняется: `waypoints`, `edges`, `stations`, `zones`, `meta`, `pgmDataUrl`.
Изменения:

```jsonc
{
  "id": "map-a1",
  "name": "Warehouse F1",
  "version": 7,                 // НОВОЕ: растёт на 1 при каждом сохранении
  "width": 500, "height": 400,  // px
  "meta": { "resolution": 0.05, "origin": [0, 0, 0], ... },
  "pgmDataUrl": "data:image/png;base64,...",   // только в GET /fms/maps/:id
  "waypoints": [Waypoint], "edges": [Edge], "stations": [Station], "zones": [Zone],
  "zoneSet": ZoneSet | null,    // ИЗМЕНЕНО: собирает сервер из zones, только чтение
  "assignedRobots": ["amr-01"],
  "createdAt": "...", "updatedAt": "...", "updatedBy": "u-1"
}
```

**`Waypoint`** — как в версии 1, плюс:

```jsonc
{
  "stopAllowed": true    // НОВОЕ, необязательное. Можно ли роботу остановиться и ждать на узле.
                         // false — проходной узел (центр перекрёстка, середина узкого прохода).
                         // Нет поля — правило сервера: узел с > 2 соседями = false, остальные = true.
}
```

**`Edge`** — как в версии 1. Уточнения:
- Направление: ребро `from → to`. Двусторонняя дорога — два ребра (`doubleWay` в редакторе). Сервер
  считает их одной физической полосой.
- `cost` — **дополнительный штраф в секундах** к времени проезда (не длина). По умолчанию 0.
- `maxSpeed` → `maximumSpeed` ребра в VDA order. Если задан — число больше 0 (м/с), иначе 400
  `INVALID_MAP`. Не задан — скорость по умолчанию fms (пока одна на всех, 1 м/с).
- Время проезда ребра для выбора робота и маршрута = длина / скорость + `cost`.

**`Zone`** — как в версии 1, все 10 типов VDA v3. Для fms:
- `RELEASE` — зона взаимного исключения: в зоне один робот (позже — вместимость);
- `BLOCKED` — не планировать маршрут через зону;
- `DIRECTED` / `BIDIRECTED` — ограничения направления;
- `SPEED_LIMIT`, `PENALTY`, `PRIORITY` — стоимость маршрута.

Роботам, которые поддерживают зоны, сервер отправляет zoneSet.

**`ZoneSet`** собирает сервер из `zones` при сохранении. Формат и правило
`zoneSetId = <mapId>-zs-<хеш зон>` — как в версии 1. Фронт может собирать его локально для
предпросмотра. Поле `zoneSet` в PATCH принимается, но игнорируется.

**`Station`** — без изменений.

### 6.2. Пути

| Метод | Путь | Сервис | Тело → ответ |
|---|---|---|---|
| GET | `/fms/maps` | database | → `Map[]` без `pgmDataUrl`, `waypoints`, `edges`, `zones` (только метаданные) |
| GET | `/fms/maps/:id` | database | → `Map` целиком |
| POST | `/fms/maps` | control | `Map` без `id/version/...` → 201 `Map` |
| PATCH | `/fms/maps/:id` | control | `{version, ...изменённые поля}` → `Map` |
| DELETE | `/fms/maps/:id` | control | → 204; 409 `INVALID_STATE`, если на карте есть роботы |
| POST | `/fms/maps/:id/assign-robots` | control | `{robotIds: [...]}` → `Map` |

### 6.3. Сохранение и проверка

- **Источник истины — сервер.** `localStorage` в real-режиме — только черновик несохранённых правок.
  Список карт и сама карта читаются с сервера.
- **PATCH обязательно содержит `version`,** которую фронт получил при загрузке. Если на сервере уже
  другая версия — 409 `VERSION_CONFLICT`, `details: { currentVersion }`. Фронт предлагает
  перезагрузить карту.
- **Сервер проверяет карту так же, как `validateMap` во фронте,** плюс проверки для трафика:
  - у станции есть подъезд;
  - из каждого узла достижима парковка;
  - у зоны `RELEASE` есть узел выхода, где можно стоять;
  - и т.п.

  Ошибки → 400 `INVALID_MAP` со списками `errors` и `warnings`. Предупреждения не блокируют
  сохранение: при успехе они приходят в заголовке ответа `X-Map-Warnings` (JSON-массив строк).
- **Последствия сохранения — с подтверждением.** Карта без ошибок, но с последствиями сохраняется, только
  если оператор подтвердил. Без `?force=true` — 409 `CONFIRMATION_REQUIRED`, ничего не сохранено,
  `details.warnings` — список по-английски для показа как есть:
  - часть графа отрезана: в неё можно заехать, но нельзя выехать (тупик на односторонних рёбрах), или
    она не связана с остальным графом;
  - до станции нельзя доехать из основной части карты;
  - удаляется узел, на котором стоит робот (только `PATCH`): его придётся заново ставить на узел.

  Фронт показывает список и при согласии повторяет тот же `POST` / `PATCH` с `?force=true`. Настройка
  оператора «Ask before risky actions» выключена — фронт сразу шлёт `?force=true` и показывает
  предупреждения уведомлением.
- Изменение карты, на которой ездят роботы, вступает в силу для **новых** маршрутов. Уже выданные
  роботам маршруты не меняются.

---

## 7. Миссии

### 7.1. Объект `Mission`

```jsonc
{
  "id": "m-3f9a1c2e",                 // свой id клиента (7.2) или выданный сервером m-xxxxxxxx
  "name": "Pallet A3 → Dock 2",
  "mapId": "map-a1",
  "priority": "NORMAL",               // LOW | NORMAL | HIGH | CRITICAL
  "requestedRobotId": null,           // если оператор выбрал робота сам; null — выбирает fms
  "robotId": "amr-01" | null,         // назначенный робот
  "steps": [MissionStep],
  "state": "RUNNING",
  "currentStep": 1 | null,            // индекс в steps
  "stepStates": [StepState],          // в том же порядке, что steps
  "error": { "code": "ACTION_FAILED", "message": "pick failed at n014" } | null,
  "createdAt": "...", "assignedAt": "..." | null, "startedAt": "..." | null,
  "finishedAt": "..." | null, "updatedAt": "...",
  "createdBy": null                   // id пользователя; пока null — авторизации ещё нет
}
```

**`MissionStep`** — доехать до узла и выполнить на нём действия:

```jsonc
{
  "nodeId": "n014",                   // waypoint или station на карте mapId
  "actions": [                        // необязательно; выполняются по порядку по прибытии
    { "actionType": "pick", "blockingType": "HARD",
      "actionParameters": [ { "key": "loadId", "value": "PALLET-1" } ] }
  ]
}
```

- Маршрут между шагами строит fms. В шагах — только точки назначения, промежуточные узлы указывать
  не нужно.
- **Станция** с рёбрами — обычный узел графа. Станция без рёбер — робот едет к ближайшему из её узлов
  взаимодействия (`interactionNodes`) и выполняет действия там.
- `actionId` задаёт сервер.
- `blockingType` необязателен: `NONE` | `SOFT` | `SINGLE` | `HARD`, по умолчанию `HARD`. Позже — из
  factsheet робота.
- **Action'ы узла на карте (`Waypoint.actions`) сами не выполняются.** Мастер миссий может
  подставлять их в шаг как значение по умолчанию. Выполняется только то, что пришло в `steps`.
- Предопределённые действия: `pick`, `drop`, `startCharging`, `stopCharging` и другие из VDA
  (`lib/vda5050.js`). Робот, которому назначат миссию, должен уметь их все. **Пока fms этого не
  проверяет** (factsheet не сверяется): неизвестное действие отклонит сам робот — миссия `FAILED`
  `ORDER_REJECTED`.

**`state`:**

| Значение | Смысл |
|---|---|
| `QUEUED` | Принята, робот ещё не назначен |
| `ASSIGNED` | Робот назначен. Либо миссия уходит роботу, либо это **следующая миссия** робота: он заканчивает текущую и возьмёт эту сразу после неё |
| `RUNNING` | Выполняется |
| `PAUSED` | Робот на паузе |
| `CANCELING` | Отмена отправлена, ждём подтверждения от робота |
| `COMPLETED` | Финальное: выполнена |
| `FAILED` | Финальное: не удалась (`error`) |
| `CANCELED` | Финальное: отменена |

**Как fms выбирает робота.** Сразу после создания миссия `QUEUED`; назначение — через доли секунды,
когда есть подходящий робот:

- Очередь — по `priority` (сначала `CRITICAL`), при равном — кто раньше создан.
- Кандидаты — роботы на той же карте с `availability.state = IDLE` (5.1). `requestedRobotId` — только
  этот робот, миссия ждёт именно его.
- Выигрывает тот, кто **быстрее доедет до первого шага** по графу (время рёбер, 6.1), а не ближе по
  прямой.
- Кандидат и робот, которому до конца текущей миссии осталось **только ехать** (действий впереди нет):
  его время — остаток пути плюс дорога от конца. Если он успевает раньше свободных — миссия становится
  его следующей (`ASSIGNED`) и начинается, когда текущая `COMPLETED`.
- Следующая миссия возвращается в очередь (`QUEUED`), если текущая не выполнена (отменена, `FAILED`)
  или затянулась (дольше двух оценок плюс минута). Причина — в истории (7.3).
- Робот отказал в миссии (уже занят, удалён, dispatch недоступен) — миссия тоже возвращается в
  очередь и ждёт следующей попытки.

**`StepState`:**

```jsonc
{
  "state": "RUNNING",                 // PENDING | RUNNING | COMPLETED | FAILED | SKIPPED | CANCELED
  "startedAt": "..." | null, "finishedAt": "..." | null,
  "waitingForTraffic": false,         // стоит и ждёт, когда освободится проезд; пока всегда false (трафика нет)
  "actions": [ { "actionId": "a-1", "actionType": "pick", "status": "RUNNING" } ]
  // status: WAITING | INITIALIZING | RUNNING | PAUSED | RETRIABLE | FINISHED | FAILED
}
```

**`error.code`:**

| Код | Кто | Когда |
|---|---|---|
| `ORDER_REJECTED` | робот | Отклонил задание (ошибка проверки на роботе) |
| `ACTION_FAILED` | робот | Действие не удалось |
| `NODE_UNREACHABLE` | робот | Не может доехать до узла: препятствие на линии и т.п. |
| `ROBOT_OFFLINE` | fms | Робот потерял связь посреди миссии |
| `ROBOT_ERROR` | робот | Критическая ошибка робота |
| `TIMEOUT` | fms | Робот не уложился в срок: не подтвердил задание или отмену (10 с), шаг или миссия дольше своего срока |
| `ROBOT_REMOVED` | fms | Робота удалили из fms с `?force=true` |
| `NO_ROUTE` | fms | Маршрут не построить, когда миссия уже назначена: карту изменили после создания |
| `INTERNAL` | fms | Ошибка fms, например миссия потерялась при перезапуске |

### 7.2. Пути

| Метод | Путь | Сервис | Тело → ответ |
|---|---|---|---|
| GET | `/fms/missions?state=&robotId=&mapId=&from=&to=&limit=&before=` | database | → `{items: Mission[], nextCursor}` |
| GET | `/fms/missions/:id` | database | → `Mission` |
| GET | `/fms/missions/:id/events` | database | → `{items: MissionEvent[]}` (7.3) |
| POST | `/fms/missions` | control | `CreateMission` → 201 `Mission` в `QUEUED`; повтор — 200 (ниже) |
| POST | `/fms/missions/:id/cancel` | control | → 202 `Mission` (ниже) |
| GET | `/fms/routes?mapId=` | control | → `{items: RobotRoute[]}` (7.4) |

Список:
- новые сверху (`createdAt` ↓), страницы — 2.3;
- `state` — через запятую: `?state=QUEUED,ASSIGNED,RUNNING,PAUSED,CANCELING` — все активные;
- `from` / `to` — период по `createdAt` (2.3), для истории.

**Создание:**

```json
POST /fms/missions
{
  "id": "wms-order-4711",
  "name": "Pallet A3 → Dock 2",
  "mapId": "map-a1",
  "priority": "NORMAL",
  "requestedRobotId": null,
  "steps": [
    { "nodeId": "st-a3", "actions": [ { "actionType": "pick", "actionParameters": [ { "key": "loadId", "value": "PALLET-1" } ] } ] },
    { "nodeId": "st-dock2", "actions": [ { "actionType": "drop" } ] }
  ]
}
```

- Нужен хотя бы один шаг. Шаг без действий допустим: «доехать сюда». Миссия из одного шага — «поехать
  в точку».
- `priority` необязателен, по умолчанию `NORMAL`. `requestedRobotId` — необязателен.
- **`id` необязателен** — 1..64 символа: буквы, цифры, `-`, `_`. Нет — сервер выдаёт `m-xxxxxxxx`.
  Свой `id` делает повтор безопасным: оборвалась связь — отправьте тот же запрос ещё раз.
  - тот же `id` и тот же запрос — 200 и та же миссия, как она есть сейчас (и завершённая тоже);
  - тот же `id`, но другой запрос — 409 `ALREADY_EXISTS`.

Проверки — по порядку; на первой не прошедшей группе ответ, ничего не сохранено:

| Проверка | Ответ |
|---|---|
| Поля: типы, обязательные, `priority`, `blockingType`, … — все ошибки сразу | 400 `INVALID_INPUT`, `details` — путь до поля: `"steps[1].actions[0].actionType": "required: a non-empty string"` |
| Карта есть | 400 `INVALID_INPUT`, `details.mapId` |
| Узел каждого шага есть на карте; до станции можно доехать (есть рёбра или узлы взаимодействия) | 400 `INVALID_INPUT`, `details["steps[i].nodeId"]` |
| Между соседними шагами есть путь по графу | 400 `INVALID_MISSION` |
| `requestedRobotId` зарегистрирован | 400 `INVALID_INPUT`, `details.requestedRobotId` |
| `id` свободен (выше) | 200 или 409 `ALREADY_EXISTS` |

Пока control загружает карты и миссии после старта — 503 `UNAVAILABLE`, повторить.

**Отмена** — ответ сразу, по состоянию миссии:

| Миссия | Ответ |
|---|---|
| `QUEUED` или следующая миссия робота (`ASSIGNED`, ещё не начата) | 202, сразу `CANCELED` |
| `ASSIGNED`, `RUNNING`, `PAUSED` | 202, `CANCELING`; `CANCELED` — когда робот подтвердит (опрос 9.1) |
| `CANCELING` | 202, как есть |
| Завершена | 409 `INVALID_STATE` |
| Нет такой | 404 `NOT_FOUND` |
| Связи с роботами нет | 503 `UNAVAILABLE` |

### 7.3. История миссии

Что с миссией было и когда — для карточки миссии и вкладки History. События пишет fleet_control вместе с
миссией (одной транзакцией), они только дописываются.

```
GET /fms/missions/:id/events
→ 200 { "items": [MissionEvent] }   // по порядку, до 1000; нет миссии — 404
```

**`MissionEvent`** — общие поля и поля своего `type`:

```jsonc
{
  "id": 4182,                         // число, порядок событий
  "missionId": "m-3f9a1c2e",
  "at": "2026-11-14T14:02:10.123Z",
  "robotId": "amr-01" | null,         // робот миссии в этот момент; вернулась в очередь — тот, от кого ушла
  "type": "STATE",                    // STATE | STEP | ACTION

  // STATE — миссия перешла в состояние
  "state": "QUEUED",
  "reason": "robot amr-01 went offline",              // ? почему; текст для оператора, показать как есть
  "error": { "code": "ACTION_FAILED", "message": "..." },   // ? только у FAILED

  // STEP — шаг начался или закончился
  "stepIndex": 0, "state": "COMPLETED",

  // ACTION — у действия новый статус
  "stepIndex": 0, "actionId": "a-17", "actionType": "pick", "status": "FAILED"
}
```

Пример — миссия с одним шагом и действием:

| `type` | Что | `reason` |
|---|---|---|
| `STATE` | `QUEUED` | — |
| `STATE` | `ASSIGNED`, `robotId: amr-01` | `12.3 s to the first step` |
| `STATE` | `RUNNING` | — |
| `STEP` | `0 RUNNING` | — |
| `ACTION` | `pick RUNNING` | — |
| `ACTION` | `pick FINISHED` | — |
| `STEP` | `0 COMPLETED` | — |
| `STATE` | `COMPLETED` | — |

- **Порядок — как было:** началось — миссия, шаг, действия; закончилось — действия, шаг, миссия.
  Финальное `STATE` — последнее событие миссии.
- **`reason`** есть, когда причина известна fms: почему этот робот (`… s to the first step`,
  `after its current mission, … s to the first step`), почему вернулась в очередь, `canceled by
  operator`. У `FAILED` причина — в `error`.
- Шаги, которые не начинались и отменены вместе с миссией, событий не дают — это видно по `STATE
  CANCELED`. Статус действия `WAITING` — не событие.
- Сколько промежуточных статусов действия попадёт в историю (`INITIALIZING`, `RUNNING`), зависит от
  того, как часто робот присылает state. Последний статус — всегда.
- Время `at` — когда fms увидел изменение.

### 7.4. Маршруты роботов

Для Live Map: куда поедет каждый робот с миссией. Маршруты живут в памяти fleet_control, поэтому этот
`GET` отвечает он, а не база.

```
GET /fms/routes?mapId=map-a1      // mapId необязателен: без него — все карты; неизвестная карта — пустой список
→ 200 { "items": [RobotRoute] }
```

**`RobotRoute`:**

```jsonc
{
  "robotId": "amr-01",
  "mapId": "map-a1",
  "missionId": "m-3f9a1c2e",
  "stepIndex": 0,                     // текущий шаг миссии
  "released": { "nodes": ["n3", "n4", "n7"], "edges": ["e34", "e47"] },
  "planned":  { "nodes": [], "edges": [] },
  "goals": ["n7", "st-dock2"],        // узлы текущего и следующих шагов
  "nextMissionId": "m-77b0d1aa" | null   // следующая миссия робота (7.1)
}
```

- **`released`** — что роботу осталось проехать по текущему шагу и что ему уже разрешено: от узла,
  который он прошёл последним, до узла шага. Пройденное отрезается. Робот стоит на узле шага и выполняет
  действия — один узел, рёбер нет.
- **`planned`** — дальше по маршруту, но ещё не разрешено (ждёт трафика). Пока трафика нет, всегда
  пусто: весь путь шага разрешён сразу.
- Рёбра `edges[k]` соединяют `nodes[k]` и `nodes[k+1]`. Координаты — из карты (`GET /fms/maps/:id`).
- Робота без миссии в списке нет. Нет и миссий `QUEUED` и следующих миссий: у них ещё нет маршрута.
- Пока известное ограничение: после перезапуска fleet_control у уже идущих миссий маршрута нет до их
  конца.

Как рисовать — `released` сплошной линией цвета робота, `planned` — пунктиром, `goals` — маркерами;
выбранный робот выделен.

---

## 8. Тревоги (alarms)

### 8.1. Объект `Alarm`

```jsonc
{
  "id": "al-5512",
  "severity": "WARNING",              // INFO | WARNING | ERROR | CRITICAL
  "source": "ROBOT",                  // ROBOT | MISSION | TRAFFIC | SYSTEM
  "code": "batteryLow",               // для ROBOT — errorType из VDA; иначе код fms
  "title": "Battery low",
  "detail": "amr-01: state of charge 9 %",
  "robotId": "amr-01" | null,
  "missionId": null,
  "active": true,                     // причина ещё есть
  "createdAt": "...",
  "clearedAt": null,                  // когда причина ушла
  "acknowledgedAt": null, "acknowledgedBy": null
}
```

Уровень ошибки робота VDA → `severity`:

| VDA | `severity` |
|---|---|
| `WARNING` | `WARNING` |
| `URGENT` | `ERROR` |
| `CRITICAL` | `CRITICAL` |
| `FATAL` | `CRITICAL` |

Тревоги fms (примеры `code`):
- `ROBOT_OFFLINE`;
- `MISSION_FAILED`;
- `TRAFFIC_DEADLOCK`;
- `NO_ROUTE`;
- `SERVICE_DOWN`.

Тревога сама становится неактивной, когда причина ушла (`clearedAt`). Подтверждение (`ack`) от этого
не зависит.

### 8.2. Пути

| Метод | Путь | Сервис | Тело → ответ |
|---|---|---|---|
| GET | `/fms/alarms?active=true&acknowledged=false&robotId=&limit=&before=` | database | → `{items: Alarm[], nextCursor}` |
| POST | `/fms/alarms/:id/ack` | control | → `Alarm` |

В коде фронта модуль и путь `alerts` переименовать в `alarms`.

---

## 9. Обновления в реальном времени

Поза роботов приходит из MQTT-брокера напрямую (раздел 10). Всё, что считает fms (статус и
готовность роботов, миссии, тревоги, карты), фронт получает так:

### 9.1. Сейчас — опрос REST

| Что | Запрос | Интервал |
|---|---|---|
| Роботы | `GET /fms/robots` | 5 с |
| Активные миссии | `GET /fms/missions?state=QUEUED,ASSIGNED,RUNNING,PAUSED,CANCELING` | 3 с |
| Активные тревоги | `GET /fms/alarms?active=true` | 5 с |
| Открытая карта (редактор) | `GET /fms/maps/:id` — только сравнить `version` | 10 с |
| Маршруты, пока открыта Live Map | `GET /fms/routes?mapId=` (7.4) | 1–2 с |
| История открытой карточки миссии, пока миссия активна | `GET /fms/missions/:id/events` (7.3) | 3 с |

- Ответ — **всегда полный список**: фронт заменяет свои данные целиком, по `id`.
- Вкладка скрыта (`document.visibilityState === 'hidden'`) — опрос приостановить, при возврате
  сразу опросить.
- Миссия, которая пропала из списка активных, завершилась. Финальное состояние — `GET /fms/missions/:id`.
- Новый `version` у открытой в редакторе карты — карту сохранил кто-то другой, предупредить.
- Сервер может вернуть `ETag`; фронт повторяет его в `If-None-Match` и получает `304` без тела, если
  ничего не изменилось. Необязательно: без `ETag` всё работает так же.

### 9.2. Позже — события fms в MQTT

Когда понадобятся мгновенные обновления (тревоги, «миссия завершена»), fleet_control начнёт
публиковать свои объекты в тот же брокер, к которому фронт уже подключён. Отдельного WebSocket-сервера
не будет. Опрос из 9.1 при этом остаётся запасным путём (брокер недоступен, mock-режим).

| Топик | Сообщение | Retained | Когда |
|---|---|---|---|
| `fms/v1/robots/<robotId>` | `Robot` (5.1) | да | Изменился статус, availability, позиция на графе, spec. Не чаще 1 Гц на робота; важное (связь, ошибки, режим) — сразу |
| `fms/v1/robots/<robotId>` | пустое | да | Робот удалён (пустое retained-сообщение удаляет топик) |
| `fms/v1/missions/<missionId>` | `Mission` (7.1) | да, пока активна | Создана, изменилось состояние или шаг |
| `fms/v1/missions/<missionId>` | пустое | да | Через 60 с после финального состояния (финальное сообщение до этого успевают получить все) |
| `fms/v1/alarms/<alarmId>` | `Alarm` (8.1) | да | Новая, ушла причина, подтверждена |
| `fms/v1/alarms/<alarmId>` | пустое | да | Тревога неактивна и подтверждена |
| `fms/v1/maps/<mapId>` | `{ "id", "version", "updatedBy" }` | нет | Карту сохранили |

- **Снимок даёт брокер:** при подписке на `fms/v1/robots/+`, `fms/v1/missions/+`,
  `fms/v1/alarms/+` сразу приходят все retained-сообщения — текущие роботы, активные миссии и
  тревоги. Отдельного запроса снимка не нужно.
- **Каждое сообщение — объект целиком.** Фронт заменяет запись по `id`; пустое сообщение — удалить.
  Брокер не меняет порядок сообщений внутри одного топика.
- QoS 1. Публикует только fleet_control, фронт — только читает (ACL в разделе 10).

---

## 10. MQTT напрямую от брокера

Для плавного движения на Live Map фронт читает топики роботов сам. Только чтение.

| Настройка `config.js` | Пример | |
|---|---|---|
| `mqttUrl` | `ws://host:8080/mqtt` | MQTT over WebSocket через шлюз fms |
| `mqttUser` / `mqttPassword` | `fleet-ui` / ... | пользователь с правом только на чтение |
| `mqttInterface` | `amr` | НОВОЕ: первая часть топика |
| `mqttVersion` | `v3` | НОВОЕ: версия в топике |

**Топики** — на каждого робота из `GET /fms/robots`, по его `manufacturer` и `serialNumber`:

```
{mqttInterface}/{mqttVersion}/{manufacturer}/{serialNumber}/visualization
{mqttInterface}/{mqttVersion}/{manufacturer}/{serialNumber}/connection
```

Подписка — по списку роботов из `GET /fms/robots`: после каждого опроса подписаться на новых,
отписаться от удалённых. Позже — по `fms/v1/robots/+` (9.2).

**`visualization`** (VDA 5050 v3):

```jsonc
{
  "headerId": 1, "timestamp": "...", "version": "3.0.0", "manufacturer": "ktc", "serialNumber": "amr1",
  "mobileRobotPosition": { "x": 1.2, "y": 3.4, "theta": 0.5, "mapId": "map-a1", "localized": true },
  "velocity": { "vx": 0.8, "vy": 0.0, "omega": 0.1 }
}
```

В v2 это поле называлось `agvPosition`.

**`connection`:**
- `connectionState`: `ONLINE` | `OFFLINE` | `HIBERNATING` | `CONNECTION_BROKEN` (в v2 —
  `CONNECTIONBROKEN`);
- retained: при подписке сразу приходит последнее значение;
- не `ONLINE` → сразу показывать робота offline, не дожидаясь fms. Возврат в online — только по
  данным fms (следующий опрос `GET /fms/robots`).

ACL пользователя `fleet-ui`:

```
user fleet-ui
topic read amr/v3/+/+/visualization
topic read amr/v3/+/+/connection
topic read fms/v1/#            # позже, события fms (9.2)
```

Публиковать фронт ничего не должен: order'а и instant actions отправляет только fms.

---

## 11. Переход с версии 1

| Версия 1 | Версия 2 |
|---|---|
| `GET /fms/robots` → `{name, spec, status{online, state, battery_level, pose, position_initialized}}` | `Robot` (5.1): `status.connection`, `status.power.stateOfCharge`, `status.pose`, `availability.state` |
| `status.state` IDLE / ON_TASK / CHARGING / ERROR / MAP_DEPLOYMENT / TELEOP | `availability.state` (5.1) |
| `position_initialized=false` → «not calibrated» | `availability.reasons` (`NOT_LOCALIZED`, `NOT_ON_GRAPH`, …) |
| `POST /fms/robots {name, manufacturer, amr_class}` → `{status:"success", robot_id}` | `POST /fms/robots {id, name, manufacturer, serialNumber}` → 201 `Robot` |
| `DELETE /fms/robots` с телом `{name}` | `DELETE /fms/robots/:id` → 202 |
| `POST /robots/:id/command {action}` | `POST /fms/robots/:id/pause` / `resume` / `park`; stop = отмена миссии |
| `POST /robots/:id/teleop` | убрано из fms (раздел 12) |
| Карты в `localStorage`, PATCH при Save | Карты на сервере, PATCH с `version` |
| `Map.zoneSet` отправляет фронт | Собирает сервер, фронт — только предпросмотр |
| `POST /fms/missions {name, mapId, nodeIds, priority:"normal"}` | `{name, mapId, priority:"NORMAL", steps:[{nodeId, actions}]}` |
| Mission `pending / running / succeeded / failed / cancelled` | `QUEUED / ASSIGNED / RUNNING / PAUSED / CANCELING / COMPLETED / FAILED / CANCELED` + `stepStates` |
| `/fms/alerts`, формат не утверждён | `/fms/alarms`, `Alarm` (8.1) |
| WS `{type:"state", robot_id, data:{x,y,theta,battery,status}}` | Убран. Поза — MQTT `visualization`, остальное — опрос REST (9.1), позже события fms в MQTT (9.2). `wsUrl` из `config.js` и `useTelemetryWs` удалить |
| MQTT `uagv/v2/<manufacturer>/<name>/...`, `agvPosition` | `amr/v3/<manufacturer>/<serialNumber>/...`, `mobileRobotPosition` |

---

## 12. Не входит в fms

Эти функции требуют прямой связи с роботом и в VDA 5050 их нет. Они делаются отдельно, в обход fms:

- **Teleop** (Twist, 10 Гц);
- **режим построения карты** (SLAM);
- **reboot / shutdown** — через интерфейс производителя.

Перед ними оператор ставит робота на паузу или в ручной режим. fms видит это по `operatingMode`
(`MANUAL` / `SERVICE`) и не назначает роботу миссии. Протокол прямой связи — отдельный документ.

---

## 13. Открытые вопросы

1. **`stopAllowed`.** Явный флаг в панели узла (как в 6.1) или только правило сервера?
2. **Шаблоны миссий** («транспорт из A в B», «на зарядку»). Отдельный ресурс `/fms/mission-templates`
   или пока только мастер с шагами?
3. ~~**`requestedRobotId`:** нужен ли оператору выбор робота вручную?~~ Решено: да, поддержан (7.1).
4. **Аутентификация.** Кто выдаёт JWT — fleet_control или отдельный сервис; где хранятся пользователи.
5. **Шлюз.** nginx или Envoy, один хост с фронтом (same-origin, без CORS) или разные.
