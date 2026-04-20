<script setup lang="ts">
type Size = 'sm' | 'md' | 'lg'
type Shape = 'circle' | 'rounded'

const props = withDefaults(
  defineProps<{
    name: string
    colorClass?: string
    size?: Size
    shape?: Shape
  }>(),
  {
    colorClass: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400',
    size: 'md',
    shape: 'circle',
  },
)

const sizeClass = computed(() => {
  if (props.size === 'sm') return 'w-8 h-8 md:w-9 md:h-9 text-sm'
  if (props.size === 'lg') return 'w-14 h-14 md:w-16 md:h-16 text-xl md:text-2xl'
  return 'w-10 h-10'
})

const shapeClass = computed(() => {
  if (props.shape === 'rounded') return props.size === 'lg' ? 'rounded-2xl' : 'rounded-xl'
  return 'rounded-full'
})
</script>

<template>
  <div
    :class="[
      'flex items-center justify-center font-bold shrink-0',
      sizeClass,
      shapeClass,
      colorClass,
    ]"
  >
    {{ initialOf(name) }}
  </div>
</template>
