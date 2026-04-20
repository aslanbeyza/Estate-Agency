<script setup lang="ts">
const { toasts, dismiss } = useToast()

const kindStyle: Record<string, string> = {
  success: 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200',
  error:   'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
  info:    'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200',
}
const kindIcon: Record<string, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
}
</script>

<template>
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] sm:w-96">
    <TransitionGroup name="toast" tag="div" class="flex flex-col gap-2">
      <div
        v-for="t in toasts"
        :key="t.id"
        :class="['flex items-start gap-2 border rounded-xl px-4 py-3 shadow-sm', kindStyle[t.kind]]"
        role="status"
      >
        <span class="text-lg leading-5 shrink-0">{{ kindIcon[t.kind] }}</span>
        <p class="text-sm flex-1 leading-5">{{ t.message }}</p>
        <button
          @click="dismiss(t.id)"
          class="opacity-60 hover:opacity-100 transition text-sm"
          aria-label="Kapat"
        >✕</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from   { transform: translateX(20px); opacity: 0; }
.toast-leave-to     { transform: translateX(20px); opacity: 0; }
</style>
