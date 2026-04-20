<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()

const slots = useSlots()
const hasAction = computed(() => !!slots.action)
</script>

<template>
  <div :class="['mb-6', hasAction && 'flex items-center justify-between gap-3']">
    <div>
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
    </div>
    <slot name="action" />
  </div>
</template>
