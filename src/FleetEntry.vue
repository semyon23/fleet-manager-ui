<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue'
import App from './App.vue'
import warehouseSvg from './assets/entry/warehouse.svg?raw'
import { playWarehouseTraffic, SPLASH_DURATION_MS } from './assets/entry/traffic'

const sessionKey = 'fm.demo.signedIn'

function initialPhase() {
  try {
    if (sessionStorage.getItem(sessionKey) === '1') return 'workspace'
  } catch { /* The demo also works when browser storage is unavailable. */ }
  return 'login'
}

const phase = ref(initialPhase())
const username = ref('admin')
const password = ref('admin')
const invalid = ref(false)
const passwordInput = ref(null)
const warehouse = ref(null)
let splashTimer
let stopTraffic

async function signIn() {
  if (phase.value !== 'login') return
  if (username.value.trim() !== 'admin' || password.value !== 'admin') {
    invalid.value = true
    passwordInput.value.focus()
    passwordInput.value.select()
    return
  }

  password.value = ''
  phase.value = 'splash'
  await nextTick()
  if (!warehouse.value) return
  stopTraffic = playWarehouseTraffic(warehouse.value.querySelector('svg'))
  splashTimer = window.setTimeout(() => {
    stopTraffic()
    try {
      sessionStorage.setItem(sessionKey, '1')
    } catch { /* Keep this document signed in without persisting the demo flag. */ }
    phase.value = 'workspace'
  }, SPLASH_DURATION_MS)
}

onBeforeUnmount(() => {
  window.clearTimeout(splashTimer)
  stopTraffic?.()
})
</script>

<template>
  <App v-if="phase === 'workspace'" />
  <div v-else class="entry" :class="{ 'is-splash': phase === 'splash' }">
    <header class="entry-header">
      <svg width="24" height="24" viewBox="43 29 28 27" aria-hidden="true">
        <path d="M45 43h9l6-12h9L57 54h-9Z" fill="#b4ed72" />
      </svg>
      <span>FLEET MANAGER</span>
    </header>
    <main class="entry-layout">
      <section class="entry-brand" aria-labelledby="entry-title">
        <div class="entry-identity">
          <h1 id="entry-title" class="entry-title" aria-label="COMPASS Fleet Control">
            <span class="wordmark">COMPASS</span>
            <span class="entry-divider" aria-hidden="true"></span>
            <span class="entry-product">Fleet<br />Control</span>
          </h1>
          <p class="entry-subtitle">Manage your robot fleet</p>
        </div>
        <!-- Inline the bundled artwork so its three robots can move independently. -->
        <div ref="warehouse" class="entry-warehouse" aria-hidden="true" v-html="warehouseSvg"></div>
      </section>
      <section v-if="phase === 'login'" class="entry-login" aria-labelledby="entry-login-title">
        <h2 id="entry-login-title">Sign in</h2>
        <form @submit.prevent="signIn" @input="invalid = false">
          <label for="entry-user">Username</label>
          <input id="entry-user" v-model="username" autocomplete="username" autocapitalize="none"
                 spellcheck="false" required :aria-invalid="invalid" :aria-describedby="invalid ? 'entry-error' : null" />
          <label for="entry-pass">Password</label>
          <input id="entry-pass" ref="passwordInput" v-model="password" type="password" autocomplete="current-password"
                 required :aria-invalid="invalid" :aria-describedby="invalid ? 'entry-error' : null" />
          <p v-if="invalid" id="entry-error" class="entry-error" role="alert">Incorrect username or password.</p>
          <button type="submit">
            Sign in
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12h14m-7-7 7 7-7 7" />
            </svg>
          </button>
        </form>
      </section>
      <div v-else class="entry-status" role="status">
        FMS traffic control
        <span class="sr-only">Opening fleet workspace. A robot carrying a carton crosses first, followed by two more robots.</span>
        <div class="entry-track" aria-hidden="true">
          <div :style="{ animationDuration: SPLASH_DURATION_MS + 'ms' }"></div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.entry {
  --ui-wordmark-start: #bfdbfe;
  --ui-wordmark-end: #60a5fa;
  display: flex;
  min-height: 100%;
  min-height: 100dvh;
  flex-direction: column;
  color-scheme: dark;
  color: #eaf2f4;
  background: radial-gradient(ellipse at 36% 62%, #233b49, #172831 42%, #10171f 92%);
}
.entry-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 21px clamp(18px, 4vw, 46px);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: .065em;
}
.entry-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(244px, .85fr);
  align-items: center;
  gap: clamp(14px, 3vw, 42px);
  width: min(100%, 1080px);
  margin: auto;
  padding: 24px clamp(20px, 5vw, 58px) 72px;
}
.entry-brand { min-width: 0; container-type: inline-size; }
.entry-identity { width: fit-content; text-align: left; }
.entry-title {
  display: flex;
  align-items: center;
  gap: .65em;
  font-size: clamp(18px, 7.2cqi, 34px);
  line-height: 1;
}
.entry-title .wordmark {
  font-weight: 400;
}
.entry-divider {
  width: .13em;
  height: 1.2em;
  border-radius: 99px;
  background: var(--color-accent);
}
.entry-product {
  color: #b3c8cf;
  font-size: .55em;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: .18em;
  text-transform: uppercase;
}
.entry-subtitle { margin-top: 6px; color: #b3c8cf; font-size: clamp(13px, 4cqi, 18px); }
.entry-warehouse { margin-top: 14px; }
.entry-warehouse :deep(svg) { display: block; width: 100%; height: auto; max-height: 250px; }
.entry-login { padding: 9px 0 9px clamp(16px, 3.4vw, 40px); border-left: 1px solid #344a56; }
.entry-login h2 { margin-bottom: 20px; font-size: 24px; font-weight: 600; line-height: 1.2; letter-spacing: -.025em; }
.entry-login form { display: flex; flex-direction: column; }
.entry-login label { margin-bottom: 6px; color: #d6e2e6; font-size: 13px; font-weight: 500; }
.entry-login input {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid #526d79;
  border-radius: 6px;
  background: #12212b;
  font-size: 14px;
}
.entry-login input + label { margin-top: 16px; }
.entry-login :focus-visible { outline: 2px solid #abd8ef; outline-offset: 3px; }
.entry-login input[aria-invalid="true"] { border-color: #ffc38e; }
.entry-error { margin-top: 9px; color: #ffc38e; font-size: 13px; }
.entry-login button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 23px;
  padding: 12px 16px;
  border-radius: 6px;
  background: #b4ed72;
  color: #101c20;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
}
.entry-login button:hover { background: #c9f09d; }
.is-splash .entry-layout { display: flex; flex-direction: column; gap: 10px; text-align: center; }
.is-splash .entry-brand { width: min(580px, 100%); }
.is-splash .entry-identity { margin-inline: auto; }
.is-splash .entry-warehouse { margin-top: 4px; }
.is-splash .entry-warehouse :deep(svg) { height: clamp(160px, 26vw, 245px); }
.entry-status { width: min(240px, 82%); color: #c5d6dc; font-size: 13px; }
.entry-track { height: 3px; margin-top: 9px; overflow: hidden; border-radius: 4px; background: #364c58; }
.entry-track > div { height: 100%; background: #b4ed72; transform-origin: left; animation: fill-track linear both; }
@keyframes fill-track { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@media (prefers-reduced-motion: reduce) {
  .entry-track > div { animation: none; }
}
@media (max-width: 570px) {
  .entry-header { padding: 15px 20px; }
  .entry-layout { grid-template-columns: minmax(0, 1fr); gap: 15px; padding: 12px 20px 32px; }
  .entry:not(.is-splash) .entry-warehouse { margin-top: 8px; }
  .entry:not(.is-splash) .entry-warehouse :deep(svg) { max-height: 120px; }
  .entry-login { padding: 17px 0 0; border-top: 1px solid #344a56; border-left: 0; }
  .entry-login h2 { margin-bottom: 14px; font-size: 21px; }
  .entry-login input { font-size: 16px; }
  .is-splash .entry-layout { padding-inline: 6px; }
  .is-splash .entry-warehouse { margin-top: 14px; }
}
</style>
