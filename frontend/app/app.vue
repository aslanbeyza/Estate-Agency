<script setup lang="ts">
const { isDark, toggle, init } = useTheme()
onMounted(() => init())

const route = useRoute()
const sidebarOpen = ref(false)

watch(() => route.path, () => { sidebarOpen.value = false })

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'grid' },
  { to: '/islemler', label: 'İşlemler', icon: 'doc' },
  { to: '/danismanlar', label: 'Danışmanlar', icon: 'users' },
]

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950">

    <!-- Mobile Top Bar -->
    <header class="md:hidden fixed top-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 h-14 flex items-center px-4 gap-3">
      <button
        @click="sidebarOpen = true"
        class="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <AppIcon name="menu" class="w-5 h-5" />
      </button>
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center">
          <AppIcon name="home" class="w-4 h-4 text-white" />
        </div>
        <span class="font-bold text-slate-800 dark:text-slate-100 text-sm">EstateFlow</span>
      </div>
      <div class="ml-auto">
        <button @click="toggle" class="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <AppIcon v-if="isDark" name="sun" :stroke-width="1.8" class="w-5 h-5 text-amber-400" />
          <AppIcon v-else name="moon" :stroke-width="1.8" class="w-5 h-5" />
        </button>
      </div>
    </header>

    <!-- Overlay (mobile) -->
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="sidebarOpen"
        @click="sidebarOpen = false"
        class="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
      />
    </Transition>

    <!-- Sidebar -->
    <aside :class="[
      'fixed top-0 left-0 h-full w-64 z-50 flex flex-col',
      'bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800',
      'transition-transform duration-250',
      'md:translate-x-0',
      sidebarOpen ? 'translate-x-0' : '-translate-x-full'
    ]">
      <!-- Logo -->
      <div class="px-5 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-sm">
            <AppIcon name="home" class="w-5 h-5 text-white" />
          </div>
          <div>
            <p class="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight">EstateFlow</p>
            <p class="text-xs text-slate-400 dark:text-slate-500">Emlak Yönetimi</p>
          </div>
        </div>
        <!-- Mobile close -->
        <button @click="sidebarOpen = false" class="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <AppIcon name="close" class="w-4 h-4" />
        </button>
      </div>

      <!-- Nav -->
      <nav class="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p class="section-label px-3 mb-2">Menü</p>
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :class="['nav-link', isActive(item.to) ? 'nav-link-active' : '']"
        >
          <AppIcon :name="item.icon" :stroke-width="1.8" class="w-5 h-5 shrink-0" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <!-- Dark mode toggle -->
      <div class="px-4 py-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <button
          @click="toggle"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-all"
        >
          <AppIcon v-if="isDark" name="sun" :stroke-width="1.8" class="w-5 h-5 text-amber-400 shrink-0" />
          <AppIcon v-else name="moon" :stroke-width="1.8" class="w-5 h-5 text-slate-400 shrink-0" />
          <span>{{ isDark ? 'Açık Tema' : 'Koyu Tema' }}</span>
          <div class="ml-auto w-10 h-5 rounded-full relative transition-colors shrink-0" :class="isDark ? 'bg-indigo-500' : 'bg-slate-200'">
            <div class="w-4 h-4 bg-white rounded-full absolute top-0.5 shadow-sm transition-all" :class="isDark ? 'left-5' : 'left-0.5'"/>
          </div>
        </button>
        <p class="text-xs text-slate-300 dark:text-slate-700 text-center">EstateFlow v1.0</p>
      </div>
    </aside>

    <!-- Main -->
    <div class="md:ml-64 pt-14 md:pt-0 min-h-screen">
      <main class="p-4 md:p-8 max-w-7xl">
        <NuxtPage />
      </main>
    </div>
    <!-- Global toasts -->
    <ToastContainer />
  </div>
</template>

<style>
@import "~/assets/css/main.css";
</style>
