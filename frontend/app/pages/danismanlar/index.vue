<script setup lang="ts">
import { useAgentsStore } from '~/stores/agents'

const agentStore = useAgentsStore()

// The page is purely presentational now: all aggregates come from
// `GET /agents/stats` and the selected-agent feed from
// `GET /agents/:id/transactions`. No business rule runs in this file.
await agentStore.fetchStats()

const palette = [
  'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400',
  'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400',
  'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400',
  'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400',
  'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-400',
  'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400',
]

const agentStats = computed(() => agentStore.stats)

const selectedId = ref<string | null>(null)
const selectedStats = computed(() =>
  agentStats.value.find(a => a._id === selectedId.value) ?? null,
)
const selectedIdx = computed(() =>
  agentStats.value.findIndex(a => a._id === selectedId.value),
)

const agentTx = computed(() =>
  selectedId.value ? (agentStore.transactions[selectedId.value] ?? []) : [],
)

// Lazy-load the per-agent transaction feed the first time the user opens
// their detail panel; subsequent clicks use the cached value in the store.
watch(selectedId, async (id) => {
  if (!id) return
  if (agentStore.transactions[id]) return
  await agentStore.fetchTransactions(id)
})

const { showForm, form, submitting, formError, submit, toggle } = useCrudForm({
  initial: { name: '', email: '', phone: '' },
  validate: (f) => (!f.name || !f.email ? 'Ad ve e-posta zorunludur.' : null),
  submit: (f) => agentStore.create({ name: f.name, email: f.email, phone: f.phone || undefined }),
  successMessage: 'Danışman eklendi.',
})

// Agent CRUD is admin-only on the backend; hide the affordance to avoid
// surfacing a button that would come back with 403.
const auth = useAuthStore()
const canManageAgents = computed(() => auth.isAdmin)
</script>

<template>
  <div>
    <PageHeader title="Danışmanlar" subtitle="Performans ve işlem geçmişi">
      <template #action>
        <button v-if="canManageAgents" @click="toggle" class="btn-primary">
          <AppIcon name="plus" :stroke-width="2.5" class="w-4 h-4" />
          <span class="hidden sm:inline">Yeni Danışman</span>
          <span class="sm:hidden">Ekle</span>
        </button>
      </template>
    </PageHeader>

    <!-- Form -->
    <SlideDownTransition>
    <div v-if="showForm && canManageAgents" class="card p-4 md:p-6 mb-5">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h2 class="font-semibold text-slate-800 dark:text-slate-100">Yeni Danışman Ekle</h2>
          <p class="text-slate-400 dark:text-slate-500 text-xs mt-0.5">Eklendikten sonra işlemlerde seçilebilir.</p>
        </div>
        <button @click="showForm = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg">
          <AppIcon name="close" class="w-5 h-5" />
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label class="form-label">Ad Soyad</label>
          <input v-model="form.name" placeholder="Mehmet Yılmaz" class="input-field" />
        </div>
        <div>
          <label class="form-label">E-posta</label>
          <input v-model="form.email" type="email" placeholder="mehmet@firma.com" class="input-field" />
        </div>
        <div>
          <label class="form-label">Telefon <span class="text-slate-400 font-normal text-xs">(opsiyonel)</span></label>
          <input v-model="form.phone" placeholder="0555 123 45 67" class="input-field" />
        </div>
      </div>
      <p v-if="formError" class="alert alert-danger text-sm mt-3">{{ formError }}</p>
      <div class="flex gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
        <button @click="submit" :disabled="submitting" class="btn-primary disabled:opacity-50 flex-1 sm:flex-none justify-center">{{ submitting ? 'Kaydediliyor...' : 'Kaydet' }}</button>
        <button @click="showForm = false" class="btn-ghost">İptal</button>
      </div>
    </div>
    </SlideDownTransition>

    <!-- Layout: mobile=stack, lg=side-by-side -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">

      <!-- Danışman listesi -->
      <div class="lg:col-span-1 space-y-2.5">
        <EmptyState v-if="agentStats.length === 0" icon="👤" title="Henüz danışman yok" class="card" />

        <div v-for="(agent, idx) in agentStats" :key="agent._id"
          @click="selectedId = selectedId === agent._id ? null : agent._id"
          :class="['card p-4 cursor-pointer transition-all select-none',
            selectedId === agent._id ? 'ring-2 ring-indigo-400 dark:ring-indigo-500 border-indigo-200 dark:border-indigo-700' : 'hover:shadow-md active:scale-[0.99]']">
          <div class="flex items-center gap-3 mb-3">
            <AgentAvatar :name="agent.name" :color-class="palette[idx % palette.length]" />
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{{ agent.name }}</p>
              <p class="text-xs text-slate-400 dark:text-slate-500 truncate">{{ agent.email }}</p>
            </div>
            <AppIcon
              name="chevron-right"
              :class="['w-4 h-4 shrink-0 transition-transform', selectedId === agent._id ? 'text-indigo-500 rotate-90' : 'text-slate-300 dark:text-slate-600']"
            />
          </div>
          <div class="grid grid-cols-3 gap-1.5 text-center mb-3">
            <div class="bg-slate-50 dark:bg-slate-800 rounded-lg py-2">
              <p class="text-base font-bold text-slate-800 dark:text-slate-100">{{ agent.listingCount }}</p>
              <p class="text-xs text-slate-400 dark:text-slate-500">Portföy</p>
            </div>
            <div class="bg-slate-50 dark:bg-slate-800 rounded-lg py-2">
              <p class="text-base font-bold text-slate-800 dark:text-slate-100">{{ agent.sellingCount }}</p>
              <p class="text-xs text-slate-400 dark:text-slate-500">Satış</p>
            </div>
            <div class="bg-emerald-50 dark:bg-emerald-950/40 rounded-lg py-2">
              <p class="text-base font-bold text-emerald-700 dark:text-emerald-400">{{ agent.completedCount }}</p>
              <p class="text-xs text-emerald-500 dark:text-emerald-600">Kapandı</p>
            </div>
          </div>
          <div class="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <p class="text-xs text-slate-400 dark:text-slate-500">Toplam Kazanç</p>
            <p class="font-bold text-indigo-600 dark:text-indigo-400 text-sm">{{ formatTRY(agent.totalEarned) }}</p>
          </div>
        </div>
      </div>

      <!-- Detay paneli -->
      <div class="lg:col-span-2">
        <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0 translate-y-2" enter-to-class="opacity-100 translate-y-0" mode="out-in">
        <div v-if="selectedStats" :key="selectedStats._id" class="space-y-4">
          <!-- Profil -->
          <div class="card p-4 md:p-6">
            <div class="flex items-center gap-4 mb-5">
              <AgentAvatar
                :name="selectedStats.name"
                size="lg"
                shape="rounded"
                :color-class="palette[selectedIdx % palette.length]"
              />
              <div>
                <h2 class="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100">{{ selectedStats.name }}</h2>
                <p class="text-slate-400 dark:text-slate-500 text-sm">{{ selectedStats.email }}</p>
                <p v-if="selectedStats.phone" class="text-slate-400 dark:text-slate-500 text-sm">{{ selectedStats.phone }}</p>
              </div>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                <p class="text-2xl font-bold text-slate-800 dark:text-slate-100">{{ selectedStats.listingCount }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Portföy</p>
              </div>
              <div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                <p class="text-2xl font-bold text-slate-800 dark:text-slate-100">{{ selectedStats.sellingCount }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Satış</p>
              </div>
              <div class="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-3 text-center">
                <p class="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{{ selectedStats.completedCount }}</p>
                <p class="text-xs text-emerald-600 dark:text-emerald-500 mt-1">Tamamlanan</p>
              </div>
              <div class="bg-indigo-50 dark:bg-indigo-950/40 rounded-xl p-3 text-center">
                <p class="text-sm font-bold text-indigo-700 dark:text-indigo-400 leading-tight">{{ formatTRY(selectedStats.totalEarned) }}</p>
                <p class="text-xs text-indigo-500 dark:text-indigo-600 mt-1">Kazanç</p>
              </div>
            </div>
          </div>

          <!-- İşlem geçmişi -->
          <div class="card overflow-hidden">
            <div class="px-4 md:px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 class="font-semibold text-slate-800 dark:text-slate-100">İşlem Geçmişi</h3>
            </div>

            <EmptyState v-if="agentTx.length === 0" icon="📂" title="Bu danışmana ait işlem yok" />

            <template v-else>
              <!-- Mobile: card list -->
              <div class="divide-y divide-slate-50 dark:divide-slate-800 md:hidden">
                <div v-for="t in agentTx" :key="t._id" class="px-4 py-3">
                  <div class="flex items-start justify-between gap-2 mb-1">
                    <NuxtLink :to="`/islemler/${t._id}`" class="link-primary text-sm leading-tight flex-1">{{ t.propertyAddress }}</NuxtLink>
                    <StageBadge :stage="t.stage" class="shrink-0" />
                  </div>
                  <div class="flex justify-between text-xs">
                    <span class="text-slate-400 dark:text-slate-500">{{ ROLE_LABEL[t.role] }}</span>
                    <span v-if="t.amount !== null" class="font-semibold text-emerald-600 dark:text-emerald-400">
                      {{ formatTRY(t.amount) }}
                    </span>
                    <span v-else class="text-slate-300 dark:text-slate-700">—</span>
                  </div>
                </div>
              </div>

              <!-- Desktop: table -->
              <div class="hidden md:block overflow-x-auto">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th class="th">Mülk</th><th class="th">Rol</th><th class="th">Aşama</th><th class="th text-right">Kazanç</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in agentTx" :key="t._id">
                      <td class="td"><NuxtLink :to="`/islemler/${t._id}`" class="link-primary text-xs leading-tight">{{ t.propertyAddress }}</NuxtLink></td>
                      <td class="td text-xs">
                        <span v-if="t.role === 'both'" class="text-amber-600 dark:text-amber-400 font-semibold">{{ ROLE_LABEL.both }}</span>
                        <span v-else>{{ ROLE_LABEL[t.role] }}</span>
                      </td>
                      <td class="td"><StageBadge :stage="t.stage" /></td>
                      <td class="td text-right font-semibold">
                        <span v-if="t.amount !== null" class="text-emerald-600 dark:text-emerald-400">{{ formatTRY(t.amount) }}</span>
                        <span v-else class="text-slate-300 dark:text-slate-700">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
        </div>

        <div v-else class="card h-60 flex items-center justify-center">
          <div class="text-center">
            <div class="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
              <svg class="w-7 h-7 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            </div>
            <p class="font-medium text-slate-500 dark:text-slate-400 text-sm">Danışman seçin</p>
            <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">Detayları görmek için listeden tıklayın</p>
          </div>
        </div>
        </Transition>
      </div>
    </div>
  </div>
</template>
