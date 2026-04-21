<script setup lang="ts">
import { useTransactionsStore } from '~/stores/transactions'
import { useAgentsStore } from '~/stores/agents'

const txStore = useTransactionsStore()
const agentStore = useAgentsStore()

// Dashboard loads server-computed stats + only the 10 most recent rows.
// Any KPI below reads from `stats` so the numbers stay correct even
// though `transactions` is now a *windowed* slice of the collection.
await Promise.all([
  txStore.fetchStats(),
  txStore.fetchPage({ limit: 10, offset: 0, append: false }),
  agentStore.fetchAll(),
])

const { STAGE_META } = useStageMeta()

const totalFee = computed(() => txStore.stats.totalCompletedServiceFee)
const activeCount = computed(
  () => txStore.stats.total - txStore.stats.counts.completed,
)
</script>

<template>
  <div>
    <PageHeader title="Dashboard" subtitle="Tüm işlemlerin genel özeti" />

    <!-- KPI — 1 col mobile, 2 col sm, 4 col lg -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <div class="card p-4 md:p-5">
        <p class="section-label mb-2">Toplam İşlem</p>
        <p class="text-3xl font-bold text-slate-800 dark:text-slate-100">{{ txStore.stats.total }}</p>
        <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">{{ activeCount }} aktif devam ediyor</p>
      </div>
      <div class="card p-4 md:p-5">
        <p class="section-label mb-2">Hizmet Bedeli</p>
        <p class="text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">{{ formatTRY(totalFee) }}</p>
        <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">tamamlanan işlemler</p>
      </div>
      <div class="bg-linear-to-br from-indigo-600 to-indigo-700 dark:from-indigo-700 dark:to-indigo-900 rounded-2xl p-4 md:p-5 shadow-sm">
        <p class="text-xs font-semibold text-indigo-200 uppercase tracking-wide mb-2">Ajans Geliri</p>
        <p class="text-xl font-bold text-white leading-tight">{{ formatTRY(txStore.totalAgencyRevenue) }}</p>
        <p class="text-xs text-indigo-300 mt-1">%50 komisyon payı</p>
      </div>
      <div class="card p-4 md:p-5">
        <p class="section-label mb-2">Danışman Sayısı</p>
        <p class="text-3xl font-bold text-slate-800 dark:text-slate-100">{{ agentStore.agents.length }}</p>
        <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">kayıtlı danışman</p>
      </div>
    </div>

    <!-- Stage Kartları — 2 col mobile, 4 col lg -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <div v-for="(m, key) in STAGE_META" :key="key"
        :class="['rounded-2xl border p-3 md:p-4 flex items-center gap-2 md:gap-3', m.surface]">
        <span class="text-xl md:text-2xl">{{ m.icon }}</span>
        <div>
          <p :class="['text-xs font-semibold uppercase tracking-wide', m.textOn]">{{ m.label }}</p>
          <p :class="['text-2xl font-bold', m.textOn]">{{ txStore.counts[key as keyof typeof txStore.counts] }}</p>
        </div>
      </div>
    </div>

    <!-- Son İşlemler -->
    <div class="card overflow-hidden">
      <div class="px-4 md:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <h2 class="font-semibold text-slate-800 dark:text-slate-100">Son İşlemler</h2>
        <NuxtLink to="/islemler" class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium">Tümünü gör →</NuxtLink>
      </div>

      <EmptyState v-if="txStore.transactions.length === 0"
        icon="🏠"
        title="Henüz işlem yok"
        link-to="/islemler"
        link-text="İlk işlemi oluştur →"
      />

      <template v-else>
        <!-- Mobile: card list -->
        <div class="divide-y divide-slate-50 dark:divide-slate-800 md:hidden">
          <div v-for="tx in txStore.transactions.slice(0, 8)" :key="tx._id" class="px-4 py-3">
            <div class="flex items-start justify-between gap-2 mb-1">
              <NuxtLink :to="`/islemler/${tx._id}`" class="link-primary text-sm leading-tight">
                {{ tx.propertyAddress }}
              </NuxtLink>
              <StageBadge :stage="tx.stage" class="shrink-0" />
            </div>
            <div class="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
              <span>{{ agentLabel(tx.listingAgent) }}</span>
              <span class="font-semibold text-slate-700 dark:text-slate-200">{{ formatTRY(tx.totalServiceFee) }}</span>
            </div>
          </div>
        </div>

        <!-- Desktop: table -->
        <div class="hidden md:block overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th class="th">Mülk Adresi</th>
                <th class="th">Hizmet Bedeli</th>
                <th class="th">Aşama</th>
                <th class="th">Portföy Danışmanı</th>
                <th class="th">Satış Danışmanı</th>
                <th class="th">Tarih</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in txStore.transactions.slice(0, 10)" :key="tx._id">
                <td class="td"><NuxtLink :to="`/islemler/${tx._id}`" class="link-primary">{{ tx.propertyAddress }}</NuxtLink></td>
                <td class="td font-semibold text-slate-700 dark:text-slate-200">{{ formatTRY(tx.totalServiceFee) }}</td>
                <td class="td"><StageBadge :stage="tx.stage" /></td>
                <td class="td">{{ agentLabel(tx.listingAgent) }}</td>
                <td class="td">{{ agentLabel(tx.sellingAgent) }}</td>
                <td class="td text-xs text-slate-400 dark:text-slate-500">{{ formatDate(tx.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>
