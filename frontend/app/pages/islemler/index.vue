<script setup lang="ts">
import type { TransactionStage } from '~/types'
import { useAgentsStore } from '~/stores/agents'
import { useTransactionsStore } from '~/stores/transactions'

const txStore = useTransactionsStore()
const agentStore = useAgentsStore()
const route = useRoute()
const router = useRouter()
const { STAGE_META } = useStageMeta()

const STAGE_KEYS = Object.keys(STAGE_META) as TransactionStage[]
const PAGE_LIMIT = 20

/**
 * Parse the `?stage=` query param defensively. Unknown values fall back
 * to "all" so a malformed URL never produces an empty screen.
 */
const parseStageQuery = (raw: unknown): TransactionStage | undefined => {
  const s = Array.isArray(raw) ? raw[0] : raw
  return typeof s === 'string' && (STAGE_KEYS as string[]).includes(s)
    ? (s as TransactionStage)
    : undefined
}

const parsePageQuery = (raw: unknown): number => {
  const p = Array.isArray(raw) ? raw[0] : raw
  const n = typeof p === 'string' ? parseInt(p, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : 1
}

const filterStage = ref<TransactionStage | 'all'>(
  parseStageQuery(route.query.stage) ?? 'all',
)

/**
 * Initial load respects the URL for deep-linking:
 *   /islemler?stage=completed&page=3
 * ...loads completed transactions, pages 1..3 pre-rendered, so the user
 * lands at the same scroll depth they shared.
 */
const initialStage = parseStageQuery(route.query.stage)
const initialPage = parsePageQuery(route.query.page)
await Promise.all([
  txStore.fetchStats(),
  txStore.fetchThroughPage(initialPage, {
    limit: PAGE_LIMIT,
    stage: initialStage,
  }),
  agentStore.fetchAll(),
])

/**
 * Derived "current page number" for the URL. Infinite scroll doesn't
 * have a single "current page", but the URL needs one — we expose the
 * *deepest* page loaded so a shared link reproduces the same view.
 */
const deepestPage = computed(() => {
  const p = txStore.pagination
  if (!p.total) return 1
  return Math.max(1, Math.ceil((p.offset + txStore.transactions.length) / p.limit))
})

/** Keep the URL in lockstep with the store's filter + loaded depth. */
const syncUrl = () => {
  const query: Record<string, string> = {}
  if (filterStage.value !== 'all') query.stage = filterStage.value
  if (deepestPage.value > 1) query.page = String(deepestPage.value)
  // Use `replace` (not `push`) so back-button doesn't walk through every
  // scroll event — users expect infinite scroll to feel like one page.
  void router.replace({ query })
}

/** Switching the stage filter resets pagination via the store. */
const selectStage = async (stage: TransactionStage | 'all') => {
  filterStage.value = stage
  await txStore.fetchPage({
    limit: PAGE_LIMIT,
    offset: 0,
    stage: stage === 'all' ? undefined : stage,
    append: false,
  })
  syncUrl()
}

/** Sentinel hit: ask the store for the next window. */
const loadMore = async () => {
  if (!txStore.pagination.hasMore || txStore.loadingMore) return
  await txStore.fetchPage({ append: true })
  syncUrl()
}

/**
 * IntersectionObserver sentinel. We only create it on the client — SSR
 * has no layout so the sentinel is meaningless there, and `IntersectionObserver`
 * isn't defined in the Node runtime.
 */
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (!sentinel.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore()
    },
    // `rootMargin: 200px` lets us kick off the next fetch *before* the
    // user hits the very bottom, which feels substantially smoother.
    { rootMargin: '200px 0px' },
  )
  observer.observe(sentinel.value)
})

onBeforeUnmount(() => observer?.disconnect())

const { showForm, form, submitting, formError, submit, toggle } = useCrudForm({
  initial: { propertyAddress: '', totalServiceFee: null as number | null, listingAgent: '', sellingAgent: '' },
  validate: (f) =>
    !f.propertyAddress || !f.totalServiceFee || !f.listingAgent || !f.sellingAgent
      ? 'Lütfen tüm alanları doldurun.'
      : null,
  submit: (f) => txStore.create({
    propertyAddress: f.propertyAddress,
    totalServiceFee: toKurus(f.totalServiceFee!),
    listingAgent: f.listingAgent,
    sellingAgent: f.sellingAgent,
  }),
  successMessage: 'İşlem oluşturuldu.',
  fallbackErrorMessage: 'İşlem oluşturulamadı.',
  onSuccess: (tx) => navigateTo(`/islemler/${tx._id}`),
})
</script>

<template>
  <div>
    <PageHeader title="İşlemler" subtitle="Satış ve kiralama işlemlerini yönetin">
      <template #action>
        <button @click="toggle" class="btn-primary">
          <AppIcon name="plus" :stroke-width="2.5" class="w-4 h-4" />
          <span class="hidden sm:inline">Yeni İşlem</span>
          <span class="sm:hidden">Ekle</span>
        </button>
      </template>
    </PageHeader>

    <SlideDownTransition>
    <div v-if="showForm" class="card p-4 md:p-6 mb-5">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h2 class="font-semibold text-slate-800 dark:text-slate-100">Yeni İşlem Oluştur</h2>
          <p class="text-slate-400 dark:text-slate-500 text-xs mt-0.5">Anlaşma aşamasından başlar.</p>
        </div>
        <button @click="showForm = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg">
          <AppIcon name="close" class="w-5 h-5" />
        </button>
      </div>

      <div class="space-y-3">
        <div>
          <label class="form-label">Mülk Adresi</label>
          <input v-model="form.propertyAddress" placeholder="Örn: Bağdat Caddesi No:42, Kadıköy" class="input-field" />
        </div>
        <div>
          <label class="form-label">Hizmet Bedeli (₺)</label>
          <input v-model.number="form.totalServiceFee" type="number" placeholder="Örn: 150000" class="input-field" />
          <p v-if="form.totalServiceFee" class="text-xs text-indigo-500 dark:text-indigo-400 mt-1.5 font-medium">
            Ajans payı: {{ formatTRY(Math.floor(toKurus(form.totalServiceFee) / 2)) }} · Danışman havuzu: {{ formatTRY(Math.floor(toKurus(form.totalServiceFee) / 2)) }}
          </p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="form-label">
              Portföy Danışmanı
              <span class="text-slate-400 font-normal text-xs"> — mülkü listeleyen</span>
            </label>
            <select v-model="form.listingAgent" class="select-field">
              <option value="">Seçin</option>
              <option v-for="a in agentStore.agents" :key="a._id" :value="a._id">{{ a.name }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">
              Satış Danışmanı
              <span class="text-slate-400 font-normal text-xs"> — satışı kapatan</span>
            </label>
            <select v-model="form.sellingAgent" class="select-field">
              <option value="">Seçin</option>
              <option v-for="a in agentStore.agents" :key="a._id" :value="a._id">{{ a.name }}</option>
            </select>
          </div>
        </div>

        <div v-if="form.listingAgent && form.sellingAgent">
          <p v-if="form.listingAgent === form.sellingAgent" class="alert alert-warning text-xs font-medium">
            ⚡ Aynı danışman — ajan havuzunun tamamı (%50) bu kişiye gidecek
          </p>
          <p v-else class="alert alert-info text-xs font-medium">
            ℹ️ Farklı danışmanlar — ajan havuzu eşit bölüşülecek (%25 + %25)
          </p>
        </div>
      </div>

      <p v-if="formError" class="alert alert-danger text-sm mt-3">{{ formError }}</p>

      <div class="flex gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
        <button @click="submit" :disabled="submitting" class="btn-primary disabled:opacity-50 flex-1 sm:flex-none justify-center">
          {{ submitting ? 'Kaydediliyor...' : 'İşlemi Oluştur' }}
        </button>
        <button @click="showForm = false" class="btn-ghost">İptal</button>
      </div>
    </div>
    </SlideDownTransition>

    <div class="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
      <button @click="selectStage('all')" :class="['px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-all shrink-0', filterStage === 'all' ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-800 dark:border-slate-200' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700']">
        Tümü ({{ txStore.stats.total }})
      </button>
      <button v-for="(m, key) in STAGE_META" :key="key" @click="selectStage(key as TransactionStage)"
        :class="['px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-all shrink-0',
          filterStage === key ? [m.surface, m.textOn] : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700']">
        {{ m.icon }} {{ m.label }} ({{ txStore.counts[key as keyof typeof txStore.counts] }})
      </button>
    </div>

    <div class="card overflow-hidden">
      <EmptyState v-if="txStore.transactions.length === 0 && !txStore.loading" icon="📂" title="Bu aşamada işlem yok" />

      <template v-else>
        <div class="divide-y divide-slate-50 dark:divide-slate-800 md:hidden">
          <div v-for="tx in txStore.transactions" :key="tx._id" class="px-4 py-3.5">
            <div class="flex items-start justify-between gap-2 mb-2">
              <NuxtLink :to="`/islemler/${tx._id}`" class="link-primary text-sm leading-tight flex-1">
                {{ tx.propertyAddress }}
              </NuxtLink>
              <StageBadge :stage="tx.stage" class="shrink-0" />
            </div>
            <div class="flex items-center justify-between text-xs">
              <div class="text-slate-400 dark:text-slate-500 space-y-0.5">
                <p>Portföy: <span class="text-slate-600 dark:text-slate-300 font-medium">{{ agentLabel(tx.listingAgent) }}</span></p>
                <p>Satış:
                  <span class="font-medium" :class="tx.isSameAgent ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'">
                    {{ agentLabel(tx.sellingAgent) }}{{ tx.isSameAgent ? ' (aynı)' : '' }}
                  </span>
                </p>
              </div>
              <div class="text-right">
                <p class="font-bold text-slate-800 dark:text-slate-100 text-sm">{{ formatTRY(tx.totalServiceFee) }}</p>
                <p class="text-slate-400 dark:text-slate-500 text-xs">{{ formatDate(tx.createdAt) }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="hidden md:block overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th class="th">Mülk</th>
                <th class="th">Hizmet Bedeli</th>
                <th class="th">Aşama</th>
                <th class="th">Portföy Danışmanı</th>
                <th class="th">Satış Danışmanı</th>
                <th class="th">Tarih</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in txStore.transactions" :key="tx._id">
                <td class="td"><NuxtLink :to="`/islemler/${tx._id}`" class="link-primary">{{ tx.propertyAddress }}</NuxtLink></td>
                <td class="td font-semibold text-slate-800 dark:text-slate-100">{{ formatTRY(tx.totalServiceFee) }}</td>
                <td class="td"><StageBadge :stage="tx.stage" /></td>
                <td class="td text-slate-600 dark:text-slate-300">{{ agentLabel(tx.listingAgent) }}</td>
                <td class="td">
                  <span v-if="tx.isSameAgent" class="text-amber-600 dark:text-amber-400 font-medium text-xs">{{ agentLabel(tx.sellingAgent) }} <span class="opacity-60">(aynı)</span></span>
                  <span v-else class="text-slate-600 dark:text-slate-300">{{ agentLabel(tx.sellingAgent) }}</span>
                </td>
                <td class="td text-xs text-slate-400 dark:text-slate-500">{{ formatDate(tx.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!--
          Infinite-scroll sentinel. Rendered only when there's more to
          load; once `hasMore` flips false the element is removed, so
          the observer never fires again.
        -->
        <div
          v-if="txStore.pagination.hasMore"
          ref="sentinel"
          class="flex items-center justify-center py-6 text-xs text-slate-400 dark:text-slate-500"
        >
          <span v-if="txStore.loadingMore">Daha fazla yükleniyor…</span>
          <span v-else>Aşağı kaydırın — {{ txStore.pagination.total - txStore.transactions.length }} işlem daha var</span>
        </div>
        <div
          v-else-if="txStore.transactions.length > 0"
          class="flex items-center justify-center py-4 text-xs text-slate-400 dark:text-slate-500"
        >
          Tüm işlemler yüklendi ({{ txStore.transactions.length }} / {{ txStore.pagination.total }})
        </div>
      </template>
    </div>
  </div>
</template>
