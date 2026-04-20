<script setup lang="ts">
defineProps<{
  icon: string
  title: string
  message?: string
  linkTo?: string
  linkText?: string
}>()
</script>

<template>
  <div class="py-12 text-center">
    <p class="text-4xl mb-3">{{ icon }}</p>
    <p class="font-medium text-slate-500 dark:text-slate-400">{{ title }}</p>
    <p v-if="message" class="text-sm text-slate-400 dark:text-slate-500 mt-1">{{ message }}</p>
    <NuxtLink
      v-if="linkTo"
      :to="linkTo"
      class="text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:underline mt-2 inline-block"
    >
      {{ linkText ?? 'Devam Et →' }}
    </NuxtLink>
  </div>
</template>
