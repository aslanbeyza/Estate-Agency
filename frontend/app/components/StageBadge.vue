<script setup lang="ts">
import type { Stage } from '~/types'

const { STAGE_META } = useStageMeta()

const props = defineProps<{
  stage: Stage
  size?: 'sm' | 'md'
}>()

const m = computed(() => STAGE_META[props.stage])
const sizeClass = computed(() => props.size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs')
</script>

<template>
  <span :class="['inline-flex items-center gap-1.5 rounded-full font-semibold border', sizeClass, m.surface, m.textOn]">
    {{ m.icon }} {{ m.label }}
  </span>
</template>
