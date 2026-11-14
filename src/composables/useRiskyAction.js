/**
 * Рискованные действия (контракт 2.1, 6.3): сервер отвечает 409 CONFIRMATION_REQUIRED или ROBOT_BUSY
 * со списком последствий, и действие повторяют с ?force=true, если оператор согласен.
 *
 * Настройка оператора «Ask before risky actions» (Settings → General, в этом браузере):
 * - включена (по умолчанию) — показать последствия и спросить;
 * - выключена — сразу повторить с force и показать последствия уведомлением.
 */
import { h } from 'vue'
import { useDialog, useMessage } from 'naive-ui'

const LS_KEY = 'fm.askBeforeRisky'

export function askBeforeRisky() {
  try { return localStorage.getItem(LS_KEY) !== '0' } catch { return true }
}
export function setAskBeforeRisky(ask) {
  try { localStorage.setItem(LS_KEY, ask ? '1' : '0') } catch { /* приватный режим — останется по умолчанию */ }
}

export const RISKY_CODES = ['CONFIRMATION_REQUIRED', 'ROBOT_BUSY']

// Последствия — details.warnings (CONFIRMATION_REQUIRED), иначе текст ошибки (ROBOT_BUSY)
export function consequencesOf(error) {
  const warnings = error?.details?.warnings
  return Array.isArray(warnings) && warnings.length ? warnings : [error?.message].filter(Boolean)
}

/**
 * run(force) — само действие. Без force сервер может ответить кодом из RISKY_CODES.
 * confirm(consequences) → Promise<boolean>, notify(consequences) — как спросить и как сообщить.
 * Результат — что вернул run; null — оператор отказался. Остальные ошибки — дальше, как есть.
 */
export async function runRisky(run, { ask, confirm, notify }) {
  try {
    return await run(false)
  } catch (e) {
    if (!RISKY_CODES.includes(e?.code)) throw e
    const consequences = consequencesOf(e)
    if (ask && !(await confirm(consequences))) return null
    const result = await run(true)
    if (!ask) notify(consequences)
    return result
  }
}

// В компоненте: const risky = useRiskyAction(); await risky((force) => ..., { title, positiveText, note })
export function useRiskyAction() {
  const dialog = useDialog()
  const msg = useMessage()
  return (run, { title, positiveText, note }) => runRisky(run, {
    ask: askBeforeRisky(),
    confirm: (consequences) => new Promise((resolve) => {
      dialog.warning({
        title,
        content: () => h('div', { class: 'flex flex-col gap-2 text-sm' }, [
          h('ul', { class: 'list-disc pl-5' }, consequences.map((text) => h('li', text))),
          note ? h('div', { class: 'text-xs text-slate-500' }, note) : null,
        ]),
        positiveText,
        negativeText: 'Cancel',
        onPositiveClick: () => resolve(true),
        onNegativeClick: () => resolve(false),
        onClose: () => resolve(false),
        onMaskClick: () => resolve(false),
      })
    }),
    notify: (consequences) => msg.warning(`${title}: ${consequences.join('; ')}`, { duration: 10000 }),
  })
}
