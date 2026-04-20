<script setup lang="ts">
import type { IconName } from '~/types'

withDefaults(
  defineProps<{
    name: IconName
    strokeWidth?: number | string
  }>(),
  { strokeWidth: 2 },
)
</script>

<template>
  <svg
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    :stroke-width="strokeWidth"
  >
    <path v-if="name === 'plus'" stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
    <path v-else-if="name === 'close'" stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    <path v-else-if="name === 'arrow-left'" stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
    <path v-else-if="name === 'arrow-right'" stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    <path v-else-if="name === 'chevron-right'" stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
    <path v-else-if="name === 'check'" stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
    <path v-else-if="name === 'check-circle'" stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    <template v-else-if="name === 'sun'">
      <circle cx="12" cy="12" r="5" />
      <path stroke-linecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </template>
    <path v-else-if="name === 'moon'" stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    <path v-else-if="name === 'menu'" stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    <path v-else-if="name === 'home'" stroke-linecap="round" stroke-linejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <template v-else-if="name === 'grid'">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </template>
    <path v-else-if="name === 'doc'" stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    <path v-else-if="name === 'users'" stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
</template>
