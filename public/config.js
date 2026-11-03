/**
 * Runtime-конфиг Fleet UI.
 * Этот файл лежит рядом с index.html после сборки (в папке dist/).
 * Правь его в любом деплое БЕЗ пересборки — редактор, сохранить, F5 в браузере.
 * Локальные адреса в git не коммитим: в репозитории поля пустые.
 *
 * Приоритет: переключатель в Settings → этот файл (непустое значение) → .env.local (при сборке) → дефолты кода.
 *
 *   - apiBaseUrl:    шлюз fms, один адрес для всего API. Пример: "http://192.168.0.105:8080/api".
 *                    Пустая строка = значение из сборки.
 *   - useMocks:      true  = mock-данные, браузер не ходит на сервер;
 *                    false = боевой режим, запросы на apiBaseUrl;
 *                    null  = как в сборке / в переключателе Settings.
 *   - mqttUrl:       WebSocket-listener MQTT-брокера. Пример: "ws://192.168.0.105:9001".
 *                    Пустая строка = MQTT выключен: поза роботов только из опроса fms (раз в 5 с).
 *   - mqttUser / mqttPassword: пользователь брокера только на чтение (fleet-ui,
 *                    deploy/mosquitto в репозитории fms).
 *   - mqttInterface / mqttVersion: начало топиков роботов, по умолчанию "amr" / "v3"
 *                    (amr/v3/<manufacturer>/<serialNumber>/visualization).
 */
window.__FLEET_CONFIG__ = {
  apiBaseUrl: '',
  useMocks: null,
  mqttUrl: '',
  mqttUser: '',
  mqttPassword: '',
  mqttInterface: '',
  mqttVersion: '',
};
