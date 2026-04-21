<script setup lang="ts">
import type { Agent, CommissionBreakdown } from '~/types'

const props = defineProps<{
  breakdown: CommissionBreakdown
  listingAgent: Agent
  sellingAgent: Agent
  totalServiceFee: number
}>()

const isSameAgent = computed(() => props.breakdown.scenario === 'same_agent')

/**
 * Percentage labels are derived from the actual amounts rather than hardcoded
 * (`%50` / `%25`). This way:
 *  - the UI automatically reflects whatever commission policy was active
 *    when *this* transaction was paid out — historical records stay honest
 *    even after the live rates change;
 *  - the component stops being a second source of truth for the split.
 */
function pct(amount: number): string {
  if (!props.totalServiceFee) return '—'
  return `%${Math.round((amount / props.totalServiceFee) * 100)}`
}

const agencyPct = computed(() => pct(props.breakdown.agencyAmount))
const listingPct = computed(() => pct(props.breakdown.listingAgentAmount))
const sellingPct = computed(() => pct(props.breakdown.sellingAgentAmount))
const poolPct = computed(() =>
  pct(props.totalServiceFee - props.breakdown.agencyAmount),
)
</script>

<template>
  <div class="card p-4 md:p-6">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
      <h2 class="font-semibold text-slate-800 dark:text-slate-100">Komisyon Dağılımı</h2>
      <span :class="['text-xs px-3 py-1 rounded-full font-semibold border',
        isSameAgent
          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
          : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800']">
        {{ isSameAgent ? '⚡ Senaryo 1' : 'ℹ️ Senaryo 2' }}
      </span>
    </div>

    <div class="space-y-2.5">
      <div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 md:p-4 flex items-center justify-between">
        <div>
          <p class="section-label mb-0.5">Toplam Hizmet Bedeli</p>
          <p class="text-xs text-slate-400 dark:text-slate-500">%100</p>
        </div>
        <p class="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100">{{ formatTRY(totalServiceFee) }}</p>
      </div>

      <div class="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-xl p-3 md:p-4 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-base">🏢</div>
          <div>
            <p class="font-semibold text-indigo-800 dark:text-indigo-200 text-sm">Ajans</p>
            <p class="text-xs text-indigo-500 dark:text-indigo-400">{{ agencyPct }}</p>
          </div>
        </div>
        <p class="text-lg md:text-xl font-bold text-indigo-700 dark:text-indigo-300">{{ formatTRY(breakdown.agencyAmount) }}</p>
      </div>

      <div class="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 rounded-xl p-3 md:p-4 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <AgentAvatar
            :name="listingAgent.name"
            size="sm"
            shape="rounded"
            color-class="bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300"
          />
          <div>
            <p class="font-semibold text-emerald-800 dark:text-emerald-200 text-sm">
              {{ listingAgent.name }}
              <span v-if="listingAgent.deletedAt" class="ml-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">(silindi)</span>
            </p>
            <p class="text-xs text-emerald-600 dark:text-emerald-400">Portföy Danışmanı{{ isSameAgent ? ' + Satış' : '' }}</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-lg md:text-xl font-bold text-emerald-700 dark:text-emerald-300">{{ formatTRY(breakdown.listingAgentAmount) }}</p>
          <p class="text-xs text-emerald-500">{{ listingPct }}</p>
        </div>
      </div>

      <div v-if="!isSameAgent && breakdown.sellingAgentAmount > 0"
        class="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 rounded-xl p-3 md:p-4 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <AgentAvatar
            :name="sellingAgent.name"
            size="sm"
            shape="rounded"
            color-class="bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300"
          />
          <div>
            <p class="font-semibold text-emerald-800 dark:text-emerald-200 text-sm">
              {{ sellingAgent.name }}
              <span v-if="sellingAgent.deletedAt" class="ml-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">(silindi)</span>
            </p>
            <p class="text-xs text-emerald-600 dark:text-emerald-400">Satış Danışmanı</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-lg md:text-xl font-bold text-emerald-700 dark:text-emerald-300">{{ formatTRY(breakdown.sellingAgentAmount) }}</p>
          <p class="text-xs text-emerald-500">{{ sellingPct }}</p>
        </div>
      </div>
    </div>
    <p class="text-xs text-slate-400 dark:text-slate-500 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
      {{ isSameAgent
        ? `Senaryo 1: Aynı danışman — ajan havuzunun tamamı (${poolPct}) tek kişiye gitti.`
        : `Senaryo 2: Farklı danışmanlar — ajan havuzu (${poolPct}) eşit paylaşıldı.` }}
    </p>
  </div>
</template>
