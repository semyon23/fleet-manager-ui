<script setup>
// Events (контракт 8): вкладка Alarms — только то, что требует человека; Journal — всё, что произошло.
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NTabs, NTabPane, NTag, NButton, NEmpty, NPopconfirm, useMessage } from 'naive-ui'
import { useAlarmsStore } from '../stores/alarms'
import { severityOf, statusOf } from '../lib/alarms'
import JournalList from '../components/JournalList.vue'
import MissionDrawer from '../components/MissionDrawer.vue'

const route = useRoute()
const router = useRouter()
const alarms = useAlarmsStore()
const msg = useMessage()

const tab = ref(route.query.tab === 'journal' ? 'journal' : 'alarms')
watch(tab, (t) => router.replace({ query: { ...route.query, tab: t } }))

// === Alarms ===
const show = ref('open')   // open | active | unacked
const visible = computed(() => alarms.sorted.filter((a) =>
  show.value === 'active' ? a.active : show.value === 'unacked' ? !a.acknowledgedAt : true))
const counts = computed(() => ({
  open: alarms.sorted.length,
  active: alarms.sorted.filter((a) => a.active).length,
  unacked: alarms.sorted.filter((a) => !a.acknowledgedAt).length,
}))
const unackedVisible = computed(() => visible.value.filter((a) => !a.acknowledgedAt))
const historyOf = ref(null)   // id тревоги, у которой раскрыта история

async function ack(alarm) {
  try {
    await alarms.ack(alarm.id)
  } catch (e) {
    if (e?.status === 404) msg.info(`Alarm ${alarm.id} is already closed`)
    else msg.error(e?.message || `Failed to acknowledge ${alarm.id}`)
    alarms.refresh()
  }
}

async function ackAll() {
  const list = unackedVisible.value
  const results = await Promise.allSettled(list.map((a) => alarms.ack(a.id)))
  const failed = results.filter((r) => r.status === 'rejected').length
  if (failed) msg.warning(`${list.length - failed} acknowledged, ${failed} failed`)
  else msg.success(`${list.length} acknowledged`)
  alarms.refresh()
}

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')

// === Карточка миссии из журнала ===
const missionId = ref(null)
const showMission = ref(false)
function openMission(id) {
  missionId.value = id
  showMission.value = true
}
</script>

<template>
  <NCard size="small" class="!bg-white dark:!bg-slate-900">
    <NTabs v-model:value="tab" type="line" animated>
      <NTabPane name="alarms">
        <template #tab>
          Alarms
          <span v-if="alarms.badge" class="ml-1.5 rounded px-1.5 font-mono text-[11px] text-white"
                :style="{ background: alarms.badge.color }">{{ alarms.badge.count }}</span>
        </template>

        <div class="mb-3 flex flex-wrap items-center gap-1.5">
          <NButton v-for="b in [['open', 'Open'], ['active', 'Active'], ['unacked', 'Not acknowledged']]" :key="b[0]"
                   size="tiny" :type="show === b[0] ? 'primary' : 'default'" :tertiary="show !== b[0]" @click="show = b[0]">
            {{ b[1] }} <span class="ml-1 font-mono text-[10px]">{{ counts[b[0]] }}</span>
          </NButton>
          <div class="flex-1" />
          <NPopconfirm v-if="unackedVisible.length > 1" positive-text="Acknowledge all" negative-text="Cancel" @positive-click="ackAll">
            <template #trigger>
              <NButton size="tiny" tertiary>Acknowledge all ({{ unackedVisible.length }})</NButton>
            </template>
            Acknowledge {{ unackedVisible.length }} alarms shown?
          </NPopconfirm>
        </div>

        <div v-if="alarms.error" class="mb-3 rounded bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {{ alarms.error }}
        </div>

        <NEmpty v-if="!visible.length" class="py-10"
                :description="alarms.sorted.length ? 'Nothing matches this filter' : 'No alarms — everything is quiet'" />

        <div v-else class="flex flex-col gap-2">
          <div v-for="a in visible" :key="a.id" class="rounded border p-3"
               :class="a.active ? 'border-slate-300 dark:border-slate-600' : 'border-slate-200 opacity-75 dark:border-slate-800'"
               :style="{ borderLeft: `4px solid ${severityOf(a).color}`, borderRadius: 0 }">
            <div class="flex items-start gap-3">
              <NTag size="small" :bordered="false" :color="{ color: severityOf(a).color, textColor: 'white' }">{{ severityOf(a).label }}</NTag>
              <div class="min-w-0 flex-1">
                <div class="font-medium">{{ a.title }}</div>
                <div class="text-sm text-slate-600 dark:text-slate-300">{{ a.detail }}</div>
                <div class="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-slate-500">
                  <span>{{ statusOf(a) }}</span>
                  <span v-if="a.robotId" class="text-brand-800 dark:text-brand-300">{{ a.robotId }}</span>
                  <span>since {{ when(a.createdAt) }}</span>
                  <span v-if="a.clearedAt">cleared {{ when(a.clearedAt) }}</span>
                  <span>{{ a.code }}</span>
                </div>
              </div>
              <div class="flex shrink-0 gap-1">
                <NButton size="tiny" tertiary @click="historyOf = historyOf === a.id ? null : a.id">History</NButton>
                <NButton v-if="!a.acknowledgedAt" size="tiny" type="primary" @click="ack(a)">Acknowledge</NButton>
              </div>
            </div>
            <div v-if="historyOf === a.id" class="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
              <JournalList :alarm-id="a.id" :limit="20" :more="false" />
            </div>
          </div>
        </div>
      </NTabPane>

      <NTabPane name="journal" tab="Journal" display-directive="show:lazy">
        <JournalList with-filters @open-mission="openMission" />
      </NTabPane>
    </NTabs>
    <MissionDrawer v-model:show="showMission" :mission-id="missionId" />
  </NCard>
</template>
