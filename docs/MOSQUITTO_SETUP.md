# MQTT-брокер для UI

Актуально на 2026-11-03. Mosquitto 2.x, VDA 5050 v3.

Брокер — часть fms: конфиг, права и установка — в репозитории fms, `deploy/mosquitto/` и раздел «MQTT-брокер»
в `deploy/README.md`. Здесь — только то, что нужно знать про брокер со стороны UI.

## Что UI берёт из брокера

Живую позу роботов и потерю связи — напрямую, не через fms (контракт, раздел 10). Только чтение.

| Топик | Что берём | Как применяем |
|---|---|---|
| `amr/v3/<manufacturer>/<serialNumber>/visualization` | `mobileRobotPosition {x, y, theta, mapId}` | последнее значение раз в кадр, Live Map |
| `amr/v3/<manufacturer>/<serialNumber>/connection` | `connectionState` (retained) | не `ONLINE` → робот сразу offline; обратно в online — только по опросу fms |

Подписки следуют за списком роботов из `GET /fms/robots`: новых подписываем, удалённых отписываем.
Робот в топике — `manufacturer` и `serialNumber` из его регистрации.

## Что нужно от брокера

- **WebSocket-listener**, обычно порт `9001`. Если UI открыт по `https`, браузер не пустит на `ws://` — нужен
  TLS на listener и `wss://`.
- **Пользователь `fleet-ui` только на чтение:** `amr/v3/+/+/visualization`, `amr/v3/+/+/connection`, позже `fms/v1/#`.
  Пароль этого пользователя виден в браузере — поэтому у него нет ни одного права на запись: отправить роботу
  команду с ним нельзя.

## Настройка UI (`public/config.js`)

| Поле | Пример |
|---|---|
| `mqttUrl` | `ws://192.168.0.105:9001` |
| `mqttUser` / `mqttPassword` | `fleet-ui` / пароль, заданный при создании пользователя |
| `mqttInterface` / `mqttVersion` | пусто = `amr` / `v3` |

Пустой `mqttUrl` — MQTT выключен: поза роботов обновляется раз в 5 с из опроса fms.

## Проверка

Слушать то же, что UI (подставьте свой пароль):

```bash
mosquitto_sub -h 192.168.0.105 -p 1883 -u fleet-ui -P '<пароль>' -t 'amr/v3/+/+/visualization' -v -W 5
```

Робот симулятора публикует `visualization` при движении — в выводе должны идти сообщения с `mobileRobotPosition`.
