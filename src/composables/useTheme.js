import { ref, computed, watch } from 'vue'

const LS_KEY = 'fm.theme'
const media = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

function systemPrefersDark() {
  return media ? media.matches : false
}

// mode: 'light' | 'dark' | 'system' — что явно выбрал пользователь.
// effective: 'light' | 'dark' — что реально применяется (system разворачивается).
function loadMode() {
  try {
    const saved = localStorage.getItem(LS_KEY)
    if (saved === 'light' || saved === 'system') return saved
  } catch { /* Private sessions may disable storage. */ }
  return 'dark'
}

const mode = ref(loadMode())
const effective = ref(mode.value === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode.value)

function apply(m) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', m === 'dark')
  document.documentElement.setAttribute('data-theme', m)
}
apply(effective.value)

watch(mode, (m) => {
  effective.value = m === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : m
  apply(effective.value)
  try {
    localStorage.setItem(LS_KEY, m)
  } catch (_) {}
})

if (media && media.addEventListener) {
  media.addEventListener('change', (e) => {
    if (mode.value === 'system') {
      effective.value = e.matches ? 'dark' : 'light'
      apply(effective.value)
    }
  })
}

// Canvas and Naive UI mix colors in JS and need resolved CSS values.
const palette = computed(() => {
  const dark = effective.value === 'dark'
  const styles = getComputedStyle(document.documentElement)
  const color = (name) => styles.getPropertyValue(`--ui-${name}`).trim()
  return {
    dark, canvas: color('canvas'), surface: color('surface'), raised: color('raised'),
    hover: color('hover'), border: color('border'), text: color('text'), muted: color('muted'),
    primary: color('primary'), primaryHover: color('primary-hover'), primaryPressed: color('primary-pressed'),
    onPrimary: color('on-primary'), link: color('link'),
  }
})

export function useTheme() {
  const theme = computed(() => effective.value)
  const isDark = computed(() => effective.value === 'dark')
  const currentMode = computed(() => mode.value)

  function setMode(m) {
    if (m === 'light' || m === 'dark' || m === 'system') mode.value = m
  }
  function toggle() {
    // Тумблер солнце/луна — всегда фиксирует явный выбор (light↔dark), выходит из system.
    mode.value = effective.value === 'dark' ? 'light' : 'dark'
  }
  return { theme, isDark, mode: currentMode, palette, setMode, toggle }
}
