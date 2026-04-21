<script setup lang="ts">
import { useTransactionsStore } from '~/stores/transactions'

const route = useRoute()
const txStore = useTransactionsStore()
await txStore.fetchOne(route.params.id as string)
const tx = computed(() => txStore.current)

const { metaOf, nextStage: nextOf } = useStageMeta()

const stageMeta = computed(() => (tx.value ? metaOf(tx.value.stage) : null))
const nextStage = computed(() => (tx.value ? nextOf(tx.value.stage) : null))

const advancing = ref(false)
const stageError = ref('')
const showConfirm = ref(false)
const toast = useToast()

async function advanceStage() {
  if (!nextStage.value || !tx.value) return
  advancing.value = true; stageError.value = ''; showConfirm.value = false
  try {
    const target = nextStage.value
    await txStore.updateStage(tx.value._id, target)
    toast.success(
      target === 'completed'
        ? 'İşlem tamamlandı. Komisyon dağıtıldı.'
        : `Aşama güncellendi: ${target}.`
    )
  } catch (e: any) {
    const msg = e.message ?? 'Bir hata oluştu.'
    stageError.value = msg
    toast.error(msg)
  } finally { advancing.value = false }
}

const sameAgent = computed(() => tx.value?.isSameAgent ?? false)

// Stage advancement is admin-only on the backend. Mirror that check on
// the client so agents don't see a button that would just 403 — less
// confusing UX and it hides the affordance altogether.
const auth = useAuthStore()
const canAdvanceStage = computed(() => auth.isAdmin)
</script>

<template>
  <div v-if="tx">
    <!-- Başlık -->
    <div class="mb-5">
      <NuxtLink to="/islemler" class="inline-flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 mb-3 transition-colors">
        <AppIcon name="arrow-left" class="w-4 h-4" />
        İşlemlere Dön
      </NuxtLink>
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="flex-1 min-w-0">
          <h1 class="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 leading-tight">{{ tx.propertyAddress }}</h1>
          <p class="text-slate-400 dark:text-slate-500 text-xs mt-1 font-mono truncate">{{ tx._id }}</p>
        </div>
        <StageBadge :stage="tx.stage" size="md" class="shrink-0" />
      </div>
    </div>

    <!-- İçerik: mobile stack, desktop side-by-side -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <!-- Sol: Timeline + Komisyon -->
      <div class="lg:col-span-2 space-y-5">

        <!-- Stage Timeline -->
        <div class="card p-4 md:p-6">
          <h2 class="font-semibold text-slate-800 dark:text-slate-100 mb-5">İşlem Süreci</h2>

          <StageTimeline :current-stage="tx.stage" />

          <!-- Açıklama -->
          <div v-if="stageMeta" :class="['rounded-xl p-3 md:p-4 border mb-4', stageMeta.surface]">
            <p :class="['text-sm font-semibold', stageMeta.textOn]">{{ stageMeta.label }}</p>
            <p :class="['text-sm mt-0.5 opacity-80', stageMeta.textOn]">{{ stageMeta.desc }}</p>
          </div>

          <!-- İlerlet — sadece yönetici -->
          <div v-if="nextStage && canAdvanceStage">
            <p v-if="stageError" class="alert alert-danger text-sm mb-3">{{ stageError }}</p>
            <div v-if="!showConfirm" class="flex flex-col sm:flex-row sm:items-center gap-2">
              <button @click="showConfirm = true" class="btn-primary w-full sm:w-auto justify-center">
                <AppIcon name="arrow-right" class="w-4 h-4" />
                {{ metaOf(nextStage).icon }} {{ metaOf(nextStage).label }} Aşamasına Geç
              </button>
              <p v-if="nextStage === 'completed'" class="text-xs text-slate-400 dark:text-slate-500">⚠️ Komisyon otomatik hesaplanacak</p>
            </div>
            <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0 translate-y-1" enter-to-class="opacity-100 translate-y-0">
            <div v-if="showConfirm" class="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
              <p class="text-amber-800 dark:text-amber-300 font-semibold text-sm mb-1">Aşama Değişikliğini Onayla</p>
              <p class="text-amber-700 dark:text-amber-400 text-sm mb-3">
                <strong>{{ stageMeta?.label }}</strong> → <strong>{{ metaOf(nextStage).label }}</strong>
                <span v-if="nextStage === 'completed'" class="block mt-1 font-medium">Bu işlem geri alınamaz. Komisyon dağılımı hesaplanacak.</span>
              </p>
              <div class="flex gap-2">
                <button @click="advanceStage" :disabled="advancing" class="btn-primary disabled:opacity-50 flex-1 sm:flex-none justify-center">{{ advancing ? 'İşleniyor...' : 'Evet, Geç' }}</button>
                <button @click="showConfirm = false" class="btn-ghost">İptal</button>
              </div>
            </div>
            </Transition>
          </div>

          <!-- Danışman: yalnızca bilgi mesajı -->
          <div
            v-else-if="nextStage && !canAdvanceStage"
            class="flex items-center gap-2.5 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm"
          >
            <AppIcon name="check" class="w-5 h-5 shrink-0 text-slate-400" />
            <span>Aşama geçişlerini yalnızca yönetici yapabilir.</span>
          </div>

          <div v-else class="flex items-center gap-2.5 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
            <AppIcon name="check-circle" class="w-5 h-5 shrink-0" />
            <span class="text-sm font-semibold">İşlem tamamlandı. Komisyon dağıtıldı.</span>
          </div>
        </div>

        <!-- Komisyon -->
        <CommissionCard
          v-if="tx.commissionBreakdown"
          :breakdown="tx.commissionBreakdown"
          :listing-agent="tx.listingAgent"
          :selling-agent="tx.sellingAgent"
          :total-service-fee="tx.totalServiceFee"
        />

        <div v-else-if="tx.stage !== 'completed'" class="card p-6 text-center">
          <p class="text-3xl mb-2">💡</p>
          <p class="font-medium text-slate-600 dark:text-slate-300">Komisyon dağılımı</p>
          <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">İşlem tamamlandığında otomatik hesaplanacak.</p>
        </div>
      </div>

      <!-- Sağ: Detay kartları — mobile'da altta -->
      <div class="space-y-4">
        <!-- Mülk -->
        <div class="card p-4 md:p-5">
          <h3 class="section-label mb-3">Mülk Bilgileri</h3>
          <div class="space-y-3">
            <div><p class="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Adres</p><p class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ tx.propertyAddress }}</p></div>
            <div><p class="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Hizmet Bedeli</p><p class="text-xl font-bold text-slate-800 dark:text-slate-100">{{ formatTRY(tx.totalServiceFee) }}</p></div>
            <div><p class="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Tarih</p><p class="text-sm text-slate-600 dark:text-slate-300">{{ formatDateTime(tx.createdAt) }}</p></div>
          </div>
        </div>

        <!-- Danışmanlar -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          <AgentInfoCard
            :agent="tx.listingAgent"
            label="Portföy Danışmanı"
            color="indigo"
          />
          <AgentInfoCard
            :agent="tx.sellingAgent"
            label="Satış Danışmanı"
            color="emerald"
            :is-same="sameAgent"
          />
        </div>

        <!-- Denetim izi -->
        <div class="card p-4 md:p-5">
          <h3 class="section-label mb-3">Denetim İzi</h3>
          <div class="space-y-3 text-sm">
            <div v-if="tx.createdBy">
              <p class="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Oluşturan</p>
              <p class="font-medium text-slate-700 dark:text-slate-200">{{ tx.createdBy.name }}</p>
              <p class="text-xs text-slate-400 dark:text-slate-500">{{ tx.createdBy.email }}</p>
            </div>
            <div v-if="tx.stageHistory?.length">
              <p class="text-xs text-slate-400 dark:text-slate-500 mb-2">Aşama Geçmişi</p>
              <ul class="space-y-2">
                <li
                  v-for="(entry, i) in tx.stageHistory"
                  :key="i"
                  class="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60"
                >
                  <StageBadge :stage="entry.stage" size="sm" class="shrink-0 mt-0.5" />
                  <div class="min-w-0 flex-1">
                    <p class="text-xs text-slate-500 dark:text-slate-400">{{ formatDateTime(entry.at) }}</p>
                    <p class="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{{ entry.by?.name ?? '—' }}</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="text-center py-16 text-slate-400 dark:text-slate-600">
    <EmptyState icon="🔍" title="İşlem bulunamadı" link-to="/islemler" link-text="← Geri Dön" />
  </div>
</template>
