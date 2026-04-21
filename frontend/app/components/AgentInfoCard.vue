<script setup lang="ts">
import type { Agent } from '~/types'

const props = defineProps<{
  agent: Agent
  label: string
  color?: 'indigo' | 'emerald'
  isSame?: boolean
}>()

const avatarClass = computed(() =>
  props.color === 'emerald'
    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
    : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400'
)

const descText = computed(() =>
  props.label === 'Portföy Danışmanı' ? 'Mülkü portföye alan danışman' : 'Satışı kapatan danışman'
)
</script>

<template>
  <div class="card p-4 md:p-5">
    <h3 class="section-label mb-3">{{ label }}</h3>
    <div class="flex items-center gap-3 mb-2">
      <AgentAvatar :name="agent.name" :color-class="avatarClass" />
      <div>
        <p class="font-semibold text-slate-800 dark:text-slate-100 text-sm">
          {{ agent.name }}
          <span v-if="agent.deletedAt" class="ml-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">(silindi)</span>
        </p>
        <p class="text-xs text-slate-400 dark:text-slate-500">{{ agent.email }}</p>
      </div>
    </div>
    <p v-if="agent.deletedAt" class="alert alert-warning text-xs">
      Bu danışman sistemden kaldırılmış. İşlemin tarihî kaydı değişmez;
      yeni bir işlem bu danışmana atanamaz.
    </p>
    <p v-else-if="isSame" class="alert alert-warning text-xs">
      ⚡ Portföy danışmanıyla aynı kişi
    </p>
    <p v-else class="text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-lg px-2.5 py-2">
      {{ descText }}
    </p>
  </div>
</template>
