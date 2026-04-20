<script setup lang="ts">
import type { Stage } from '~/types'

const { STAGE_META, STAGE_ORDER } = useStageMeta()

const props = defineProps<{ currentStage: Stage }>()
const currentIdx = computed(() => STAGE_ORDER.indexOf(props.currentStage))
</script>

<template>
  <div class="relative flex justify-between mb-6">
    <div class="absolute top-4 md:top-5 left-4 right-4 h-0.5 bg-slate-100 dark:bg-slate-800 rounded-full z-0" />
    <div
      class="absolute top-4 md:top-5 left-4 h-0.5 bg-indigo-500 z-0 rounded-full transition-all duration-700"
      :style="{ width: currentIdx === 0 ? '0px' : `calc(${(currentIdx / (STAGE_ORDER.length - 1)) * 100}% * ((100% - 32px) / 100%))` }"
    />
    <div
      v-for="(stage, idx) in STAGE_ORDER"
      :key="stage"
      class="relative z-10 flex flex-col items-center gap-1.5"
      :style="{ width: `${100 / STAGE_ORDER.length}%` }"
    >
      <div :class="['w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-sm md:text-base border-2 transition-all duration-300 shadow-sm',
        currentIdx > idx
          ? 'bg-indigo-600 dark:bg-indigo-500 border-indigo-600 dark:border-indigo-500'
          : currentIdx === idx
            ? STAGE_META[stage].surface
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700']">
        <AppIcon v-if="currentIdx > idx" name="check" :stroke-width="3" class="w-3.5 h-3.5 text-white" />
        <span v-else class="text-xs md:text-base">{{ STAGE_META[stage].icon }}</span>
      </div>
      <p :class="['text-xs font-semibold text-center leading-tight px-0.5',
        currentIdx >= idx ? STAGE_META[stage].textOn : 'text-slate-300 dark:text-slate-600']">
        {{ STAGE_META[stage].label }}
      </p>
    </div>
  </div>
</template>
