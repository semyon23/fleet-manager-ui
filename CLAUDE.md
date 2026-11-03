# CLAUDE.md — Fleet Manager

Этот файл Claude Code подхватывает автоматически при открытии папки репо. Актуально на 2026-09-25.

---

## 1. Что за проект

Веб-панель управления парком промышленных AMR/AGV роботов.

- **Фронт** (этот репо): Vue 3. Ведёт Семён Булгаков.
- **Бэк** (отдельный репо/машина): C++ на Boost.Beast, ведёт Семён Булгаков. Порт `5000` (сейчас `192.168.0.105:5000`). Роботы говорят по VDA5050 через MQTT.
- **Репо:** `semyon23/fleet_manager_ui`, remote **`semyon`** (SSH, ключ `~/.ssh/id_ed25519_github` через `core.sshCommand`). Пушить только туда.
- Remote `origin` = старый `DDmsngr/fleet-manager`. История `main` переписана (автор — Семён), поэтому в `origin` **не пушить**.
- **GitHub Pages:** `.github/workflows/deploy.yml` деплоит при push в `main`, но Vite `base` = `/fleet-manager/`, а репо называется `fleet_manager_ui`. Если включать Pages — поменять `base` на `/fleet_manager_ui/`.
- Экраны: `/dashboard`, `/live`, `/maps`, `/maps/:id` (редактор), `/robots`, `/missions`, `/alarms` (старый `/alerts` редиректит), `/settings`. Teleop убран полностью (2026-11-03): ручное управление — напрямую с роботом, не через fms (контракт, раздел 12).

**Пользователь — Семён**, C++-разработчик (бэк). Фронтовые вещи объяснять простым языком, коротко. Ответы бывают в два слова («да», «пока не будем») — это нормально, решение принято.

## 2. Правила работы (важно, накоплены из фидбека)

**Язык**
- UI — **только английский**. Внутренние документы, README, docs/, общение с Семёном — **русский**.
- Комментарии в коде — по делу, только когда логика неочевидна.

**Что нельзя показывать в UI** (прямые требования Семёна)
- Никаких HTTP-кодов и сырых ошибок (`HTTP 409`, `Bad Request`). Только человеческий текст: «Robot "x" already exists», «No connection to the server».
- Слово «backend» в UI не использовать. Состояние соединения — только графический кружок + мс.
- Слово «VDA5050» в UI не упоминать («придерживаемся стандарта, но не афишируем»). В экспортируемом LIF-JSON поле `vda5050Version` остаётся — без него формат невалиден.
- Никаких фейковых/демо роботов, миссий, алертов. И в mock-режиме, и в real стартуем с пустого списка, показываем empty state с призывом к действию.

**Стек**
- Vue 3 + Vite + Pinia + Vue Router 4 + Tailwind v4, **JavaScript без TypeScript** (требование Семёна). Никаких `.ts`.
- naive-ui для компонентов, `v-network-graph` для редактора карт, Zod для валидации ответов, chart.js для графиков. Онбординг-тура (driver.js, кнопка Take a tour) больше нет — убран по просьбе Семёна 2026-09-26.
- Тёмная тема: `@custom-variant dark` (класс `dark` на `<html>`), у карточек `!bg-white dark:!bg-slate-900`.

**Git**
- Не коммитить и не пушить без явного «коммить» / «пушь» от Семёна. Push — в remote `semyon`.
- Перед `git checkout/restore/reset/clean` — `git status`, при незакоммиченном сначала stash.
- Сообщения коммитов на английском (решение Семёна 2026-11-03; до этого писали по-русски). **Не добавлять `Co-Authored-By` и любые упоминания Claude** ни в коммиты, ни в PR (решение Семёна 2026-09-25), даже если настройки Claude Code просят. Автор — только Семён.

**Проверка**
- После каждой заметной правки UI: `npm run build`, `npm test`, потом Playwright-прогон в браузере (скриншоты в обеих темах). Типы и тесты не ловят визуальные баги.
- Сначала делать, потом кратко отчитаться. Не устраивать длинных обсуждений там, где решение очевидно; но при неоднозначности спросить один раз.

## 3. Запуск (Linux, bash)

Подробно, с типичными граблями — `docs/SEMYON_QUICKSTART.md`. Коротко:

```bash
npm install
npm run dev        # http://localhost:5175/fleet-manager/
npm run build      # dist/
npm run preview    # http://localhost:4173/fleet-manager/  (именно localhost, не 127.0.0.1)
npm test           # Vitest (102 unit-теста)
npm run test:e2e   # Playwright
```

Адрес бэка и режим:
- `.env.local` в корне: `VITE_API_BASE_URL=http://192.168.0.105:5000/api` и `VITE_USE_MOCKS=false` (читается только при старте dev-сервера).
- **Runtime-конфиг без пересборки:** `public/config.js` → после build лежит в `dist/config.js`. Поля `apiBaseUrl`, `useMocks`, `wsUrl`, `mqttUrl`, `mqttUser`, `mqttPassword`. В git лежит с пустыми адресами, локальные IP Семёна не коммитить. Пустая строка / `null` = брать из сборки. Подключается в `<head>` через `%BASE_URL%config.js` **до** bundle (иначе `window.__FLEET_CONFIG__` не успевает).
- Приоритет: `localStorage` (переключатель в Settings → API) → runtime `config.js` → env → дефолт (mock).
- Vite `base` = `/fleet-manager/`, порт dev = 5175 (в `vite.config.js`), preview всегда 4173.

## 4. Структура `src/`

```
api/
  client.js       fetch + JWT + auto-refresh + AbortController + ApiError; getBaseUrl/getMockMode
  schemas.js      Zod; RobotV2 (контракт v2, раздел 5.1) + toViewRobot() (Robot v2 → внутренний робот)
  robots.js maps.js missions.js alerts.js auth.js index.js
  mocks/          пустые списки; mock robots хранит зарегистрированных в памяти
stores/           robots.js (polling + applyTelemetry), maps.js (localStorage)
composables/      useBackendHealth, useTelemetryWs, useRobotMqtt, useTheme
views/            Dashboard, LiveMap, MapsList, MapEditor, Robots, Missions, Alarms, Settings
components/       AppSidebar, AppTopbar
lib/              exportLif*/importLif/exportGeoJson (LIF, Nav2 GeoJSON), graphConfig, robotSprite, theme
```

Внутренний формат робота (то, что ест UI, строит `toViewRobot`):
`{ id, name, manufacturer, serialNumber, labels, lifecycle, model, availability{state, reasons}, status, connection, battery, charging, x, y, theta, mapId, positionInitialized, lastNodeId, paused, errors, mission, uptime, sprites }`.
Состояние робота для UI — `availability.state` (подписи и цвета — `lib/availability.js`), так уже работает экран Robots. Старый `status` (`moving | charging | idle | error | offline`) пока выводится из `availability.state` переходной таблицей в `toViewRobot` — им ещё пользуются Dashboard, Live Map и тонировка спрайта; уберётся в U-5.

## 5. Как устроены ключевые вещи

**API-слой и mock.** Все запросы идут через `client.request()`. Каждая функция в `api/*.js` проверяет `getMockMode()` и вместо запроса возвращает мок. Переключение mock ↔ real не требует правок в компонентах.

**Данные роботов — два канала** (решение Семёна 2026-09-08/11):
- HTTP `GET /api/fms/robots` раз в **5 сек** (глобальный singleton polling в `stores/robots.js`) — снапшот для таблицы. Формат — `Robot` контракта v2 (`spec + status + availability`), мапится во внутреннего робота через `toViewRobot()`. GET отвечает база fms через шлюз.
- WebSocket `useTelemetryWs` — только **позиция** `agvPosition {mapId, positionInitialized, x, y, theta}` для Live Map. URL: `config.js.wsUrl`, иначе выводится из `apiBaseUrl` (`http://host:5000/api` → `ws://host:5000`). Нативный WebSocket (не socket.io), авто-reconnect с backoff 1→2→5→10→30 с. В mock-режиме не подключается. ID робота: `msg.robot_id`, иначе `manufacturer-serialNumber`.
- **MQTT напрямую от брокера** (`useRobotMqtt`, Mosquitto, MQTT over WS, пользователь `fleet-ui` только на чтение — `docs/MOSQUITTO_SETUP.md`). Топики `uagv/v2/<manufacturer>/<name>/visualization` (позиция, применяется раз в кадр) и `.../connection` (не `ONLINE` → offline). Подписка оформляется **после success на `POST /fms/robots`** (manufacturer из формы, пустой → `+`), отписка после удаления, после F5 — досподписка по `GET /fms/robots`. Пустой `mqttUrl` или mock → выключено.
- Live Map показывает робота только если его `mapId` совпадает с именем/id активной карты (или mapId ещё не пришёл).
- `positionInitialized === false` → жёлтый тег **not calibrated** в таблице и drawer (на карте не отмечаем).

**Индикатор соединения** (`useBackendHealth`): ping `GET /api/health` каждые 3 с, таймаут 2 с. Зелёный (<2 с), жёлтый (медленно), красный (3 провала подряд), пульсирующий оранжевый (mock). Показан в топбаре (кружок + мс). Судя по скринам от 19.09 `/api/health` уже работает (14 ms).

**Оформление как в Compass** (`~/compass/compass-ui`, 2026-10-02): лого `COMPASS │ FLEET CONTROL` (шрифт Michroma, `.wordmark`, акцент `--color-accent`), часы `AppClock` справа в топбаре, сайдбар сворачивается до иконок (кнопка `«`/`»` внизу, уже 1280 px — свёрнут по умолчанию), Settings внизу сайдбара.

**Live Map.** SVG, не Konva. Координаты: `px = 60 + x*25`, отступ 60 px вокруг карты, `viewBox` = размер карты + 120, `preserveAspectRatio="xMidYMid meet"`, высота `calc(100vh - 11rem)`. Zoom 25–500% + pan мышью (drag), `1:1` сбрасывает и то и другое. Роботы `ROBOT_SIZE=32`, waypoints `r=2.5`.

**Map Editor.** `v-network-graph`, инструменты Select/Node/Batch points/Batch lines/Edge/Station/Set Origin/Calibrate, метровые линейки, actions на нодах, импорт/экспорт LIF (в т.ч. multi-layout) и Nav2 GeoJSON. Карты хранятся в `localStorage` (PGM + YAML Nav2). Станции — скруглённые квадраты с белой иконкой (зарядка/парковка/погрузка/звезда), не круги.

**Зоны и атрибуты VDA 5050 v3 в редакторе** (2026-09-26):
- Инструменты Zone (Z, полигон: клик по первой вершине / двойной клик в одной точке / Enter) и Rectangle zone (R). Все 10 типов зон v3, параметры по типу — `components/editor/ZonePanel.vue`. Вершины тянутся ручками, клик по середине стороны добавляет вершину, центр двигает всю зону.
- Справочники (типы зон, предопределённые action со scope, enum'ы) — `lib/vda5050.js`; геометрия — `lib/geometry.js`; перевод в структуры v3 (nodePosition, атрибуты ребра, action, `buildZoneSet`) и проверки — `lib/vdaLayout.js` (подключены в `validateMap`).
- Модель: зоны хранятся в пикселях (`map.zones`), углы (theta узла, orientation ребра, direction зоны) — в мировых радианах; в UI — градусы. Необязательные поля v3 пишутся только если заданы (theta=0 ≠ «любая ориентация»).
- Экспорт: LIF с полями v3 (`vda5050Version: 3.0.0`), отдельный zoneSet (File → Export zone set, вкладка в Preview JSON). `zoneSetId = <mapId>-zs-<хеш зон>` — меняется с содержимым. Save шлёт `zones` + готовый `zoneSet`.
- Слои графа: `zones` в `base` (под графом, клики не ловит — выбор hit-test'ом в onViewClick), `handles` в `nodes` (ручки поверх). Размеры подписей делить на `zoomLevel`, а не на `scale` из слота. Зум по двойному клику выключен (`doubleClickZoomEnabled: false`).
- Тёмная тема редактора (2026-09-26): классы `dark:` в шаблоне и панелях `components/editor/*`, цвета графа (узлы, подписи, сетка) — через `isDark` в `dynamicConfig`, SLAM-подложка в тёмной теме инвертируется CSS-фильтром.

**Дороги в редакторе** (2026-09-26):
- Road (W): кликаешь точки дороги, вершины строго на прямых, плотность — поле «Nodes … per m» (`nodesPerM`, узлов на метр, по умолчанию 1; 0.5 = узел каждые 2 м; шаг ≤ 1/nodesPerM, узлы равномерно). Поле R (м, по умолчанию 2) — каждый поворот сразу скругляется этим радиусом (`roundTurnAt` → `lib/roadEdit.js`), с превью; если прямые короче — радиус уменьшается с предупреждением. R пустое — острые углы. Почти-продолжение притягивается к прямой; Shift — шаг 15°. Участок + скругление — одна запись undo.
- В W/A клик ближе 12 экранных px к узлу считается кликом по узлу (узлы маленькие, иначе дорога не стыкуется).
- Arc / turn (A) — не больше 90° (`ARC_MAX_RAD`, в любом режиме), поле R (м, по умолчанию 2): поворот ровно этого радиуса, сторона — по курсору, угол кратен 15° (Shift — любой). С нуля: старт, потом клик-направление выезда. Поле R пустое — радиус задаёт клик (от конца дороги — по касательной, с нуля — три точки). Вершины по дуге: поле **Arc nodes** (по умолчанию 7, оба конца включены, мин. 3) — действует на все дуги: A, скругления в W и Round corner. Пусто — по плотности Nodes per m (поле тогда показывается и у A) и ≤ 15°.
- Цепочка продолжается: конец участка — начало следующего с тем же направлением, W↔A переключаются без разрыва. Esc/Enter — закончить.
- Round corner (панель узла, если у узла ровно 2 соседа): угол заменяется дугой радиуса R. Логика — `lib/roadEdit.js`: идёт вдоль прямых участков дороги в обе стороны (узлы с 2 соседями, без actions, не станции), вершины внутри поворота удаляет, точки касания совпадают с вершиной дороги или добавляются. Макс. радиус = длина более короткой прямой × tan(θ/2), а не расстояние до соседа (раньше из-за этого на дорогах с шагом 1 м скругление не работало). Узел угла переезжает в середину дуги (actions сохраняются), направления и атрибуты рёбер сохраняются. Тесты — `tests/unit/roads.test.js`.
- Тулбар переносится на вторую строку на узких экранах (`flex-wrap`).
- Рёбра сплошные (пунктир рвался на каждой вершине), узлы r=5 с обводкой.

**Missions.** Мастер создания: имя (необязательно), приоритет, карта, маршрут из шагов (селекты waypoints, ↑↓, ✕), теги actions, live-превью payload. Робота в форме **нет** — назначает диспетчер на бэке. Список поллится раз в 3 с. **Бэк-эндпоинты миссий ещё не готовы.**

**Alarms** (в UI «Alarms», переименовано из Alerts 2026-09-26; в коде API и эндпоинт остаются `alerts`, `/fms/alerts`). Поллинг раз в 5 с, фильтры All/Errors/Warnings/Info/Unack, группировка по severity, Ack. **Формат ответа на бэке ещё не утверждён** (см. §7).

**Ошибки.** Helper'ы `registerErrorText/deleteErrorText` в `RobotsView.vue` переводят `e.status`/`e.code` в английский текст. Новые экраны делать так же.

## 6. Контракт с C++ бэком (что реально работает)

Префикс всех путей — `/api/fms/*`. Полная спека: `docs/API_CONTRACT.md` (источник истины).

Протокол роботов: `docs/VDA5050_EN.md` — **VDA 5050 v3.0.0** (топики `vda5050/v3/...`, `mobileRobotPosition`, `CONNECTION_BROKEN`). Код MQTT и `docs/MOSQUITTO_SETUP.md` пока написаны под v2 (`uagv/v2`, `agvPosition`) — перед запуском на роботах сверить, какую версию они реально шлют. Картинки из спеки (`./assets/*.png`) в репо не положены.

| Метод | Путь | Заметки |
|---|---|---|
Бэк — fms (репо `fleet-manager`): шлюз nginx на порту **8080** разводит `GET /api/fms/*` в базу (fleet_database, :8002), остальное — в fleet_control (:8003). У UI один `apiBaseUrl` = `http://<машина>:8080/api` (`deploy/README.md` в репо fms).

| Метод | Путь | Заметки |
|---|---|---|
| GET | `/api/health` | `{status: OK\|DEGRADED, services: {control, database, dispatch}}`, всегда 200, пока жив control |
| GET | `/api/fms/robots`, `/api/fms/robots/:id` | `Robot` контракта v2 (список — массив без обёртки, вместе с `PENDING_DELETE`) |
| POST | `/api/fms/robots` | `{id, name?, manufacturer, serialNumber, labels?}` → 201 `Robot`; 409 `ALREADY_EXISTS` (занят id или пара manufacturer + serialNumber); 400 `INVALID_INPUT` с `details` по полям |
| PATCH | `/api/fms/robots/:id` | `{name?, labels?}` → `Robot`; id/manufacturer/serialNumber не меняются (400) |
| DELETE | `/api/fms/robots/:id[?force=true]` | 202 `Robot` (`PENDING_DELETE`); 409 `ROBOT_BUSY`, если у робота миссия и нет `force` |
| POST | `/api/fms/robots/:id/pause`, `/resume` | 202 — команда отправлена, факт — `status.paused` при следующем опросе |

Ошибки — `{code, message, details}` (контракт, раздел 2.1); в UI тексты выбираются по `code`, не по HTTP-коду. CORS и `OPTIONS` (204) сервер fms делает сам.

## 7. Открытые вопросы и очередь

**Решает Семён (бэк/протокол):**
1. **MQTT на фронте сделан** (2026-09-24, см. §5). Осталось: поднять Mosquitto по `docs/MOSQUITTO_SETUP.md`, вписать `mqttUrl`/`mqttUser`/`mqttPassword` в `config.js` и проверить на живом роботе.
2. **Сервисный режим / mapping** (идея Семёна): отдельным экраном (Teleop из UI убран) показывать SLAM-карту, которая строится пока катаешь робота, потом сохранить на сервер и нанести маршруты. Решение Семёна: **в обход FMS**, фронт напрямую подключается к локальному WS-серверу на роботе (IP робота в настройках фронта), перед входом отменяются все задачи робота. Не решено: откуда фронт берёт IP:порт, формат SLAM-сообщений (черновик — `slam_map` с base64+gzip occupancy grid, `resolution/origin/width/height`), CORS на роботе, отдельная страница `/mapping/:id`. Пока не начато.
3. **Формат Alerts** (`GET /api/fms/alerts`): предложен `{id, severity, source: robot|system, robot_id|null, title, detail, created_at, acknowledged}` + `POST /api/fms/alerts/:id/ack`. Через HTTP-запрос, не WS. Не утверждено; после утверждения делаем колокольчик со счётчиком непрочитанных в топбаре.
4. **Миссии**: `POST/GET /api/fms/missions`, `POST .../:id/cancel` — фронт (мастер + таблица + cancel) готов, ждёт бэк.
5. **Переход на контракт v2** (2026-11-03): U-1 API-слой роботов, U-2 стор (`byState`, опрос на паузе при скрытой вкладке), U-3 экран Robots на `availability` (причины в подсказке, Pause/Resume, удаление с `ROBOT_BUSY` → диалог «удалить и отменить миссию», карточка с ошибками робота) — сделаны; дальше U-4 MQTT `amr/v3` + `serialNumber` и без WebSocket, U-5 Dashboard / Live Map.

**Решено «нет» / отложено:** кнопка `initPosition` (обнуление позиции) — «пока не будем»; мобильная вёрстка — «пока нет»; e2e в CI — «не знаю» (не решено).

**Идеи, если будет время:** колокольчик алертов, Playwright e2e в GitHub Actions (сценарии сейчас лежат только в scratchpad прошлой сессии), i18n-переключатель, `wsUrl`/`mqttUrl` в Settings, разбить чанки `mqtt` (~370 кБ) и `naive-ui` (~650 кБ).

## 8. Ловушки окружения и кода

- Машина Семёна — Linux (Ubuntu), bash, Node 24. `npm`, `grep` и т.п. доступны напрямую.
- Preview: порт 4173, адрес `localhost` (на `127.0.0.1` может не отвечать).
- Playwright: у naive-ui табов нет `role=tab` → `.locator('.n-tabs-tab').filter({hasText})`; кнопки «Register» неоднозначны → `getByRole('button', {name:'Register', exact:true})`.
- `v-network-graph`: `type/radius` нужно дублировать во ВСЕХ состояниях ноды (normal/hover/selected), иначе `selected` без `hover` даёт NaN и нода пропадает. Для координат — `offsetX/Y`, не `clientX/Y`.
- `NDataTable` со `flex-height` без родителя с явной высотой схлопывает tbody в 0 — использовать только `:max-height`.
- Скролл держать внутри карточки/таблицы, а не всей страницы (замечание Семёна: sidebar и топбар не должны уезжать).
- Vite перемещает `<script type="module">` в `<head>`, поэтому обычный `<script>` для `config.js` нужно ставить в `<head>` тоже.

## 9. С чего начать новую сессию

1. `git log --oneline -20` и `git status` — понять текущее состояние.
2. Прочитать `docs/API_CONTRACT.md`, `docs/DECISIONS.md`, `docs/SEMYON_QUICKSTART.md`.
3. `npm install`, `npm test`, `npm run dev`, открыть `/live` и `/robots`.
4. Спросить Семёна, какой пункт из §7 берём первым.

Важные новые договорённости дописывать сюда, в этот файл: он в репо и переживает смену машины.
