<script setup lang="ts">
// `auth.global.ts` already bounces logged-in users away from this page,
// but this page still drives the "bootstrap first admin" flow so we need
// to know whether we're in a fresh install. We detect that by trying
// `auth/me` anonymously — if the backend answers 401 we're fine; if
// `auth/bootstrap-admin` succeeds, there were no users before. A simpler
// heuristic: surface both a login form and a collapsible bootstrap form
// and let the backend tell us which one is disabled.
const auth = useAuthStore()
const toast = useToast()
const route = useRoute()

const mode = ref<'login' | 'bootstrap'>('login')

const loginForm = reactive({ email: '', password: '' })
const bootstrapForm = reactive({ email: '', password: '', name: '' })

const submitting = ref(false)

async function onLogin() {
  submitting.value = true
  try {
    await auth.login({ email: loginForm.email.trim(), password: loginForm.password })
    toast.success('Giriş başarılı')
    const redirect = (route.query.redirect as string | undefined) ?? '/'
    await navigateTo(redirect)
  } catch (err: any) {
    toast.error(err?.message ?? 'Giriş başarısız')
  } finally {
    submitting.value = false
  }
}

async function onBootstrap() {
  submitting.value = true
  try {
    await auth.bootstrapAdmin({
      email: bootstrapForm.email.trim(),
      password: bootstrapForm.password,
      name: bootstrapForm.name.trim(),
    })
    toast.success('Yönetici hesabı oluşturuldu, hoş geldiniz')
    await navigateTo('/')
  } catch (err: any) {
    toast.error(err?.message ?? 'Kurulum başarısız')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-md">
    <div class="flex items-center justify-center gap-3 mb-8">
      <div class="w-12 h-12 rounded-2xl bg-linear-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-md">
        <AppIcon name="home" class="w-6 h-6 text-white" />
      </div>
      <div>
        <p class="text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">EstateFlow</p>
        <p class="text-xs text-slate-400 dark:text-slate-500">Emlak Yönetim Paneli</p>
      </div>
    </div>

    <div class="card p-6">
      <div class="flex gap-1 mb-6 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
        <button
          type="button"
          @click="mode = 'login'"
          :class="[
            'flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
            mode === 'login'
              ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 dark:text-slate-400'
          ]"
        >Giriş</button>
        <button
          type="button"
          @click="mode = 'bootstrap'"
          :class="[
            'flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
            mode === 'bootstrap'
              ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 dark:text-slate-400'
          ]"
        >İlk Kurulum</button>
      </div>

      <form v-if="mode === 'login'" class="space-y-4" @submit.prevent="onLogin">
        <div>
          <label class="text-sm font-medium text-slate-600 dark:text-slate-300">E-posta</label>
          <input
            v-model="loginForm.email"
            type="email"
            required
            autocomplete="email"
            class="input-field mt-1"
            placeholder="ornek@estate.com"
          />
        </div>
        <div>
          <label class="text-sm font-medium text-slate-600 dark:text-slate-300">Şifre</label>
          <input
            v-model="loginForm.password"
            type="password"
            required
            autocomplete="current-password"
            minlength="8"
            class="input-field mt-1"
            placeholder="••••••••"
          />
        </div>
        <button type="submit" class="btn-primary w-full" :disabled="submitting">
          {{ submitting ? 'Giriş yapılıyor…' : 'Giriş Yap' }}
        </button>
      </form>

      <form v-else class="space-y-4" @submit.prevent="onBootstrap">
        <p class="text-xs text-slate-500 dark:text-slate-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3 rounded-xl">
          Sadece veritabanı boş olduğunda çalışır. İlk yönetici hesabı oluşturulduktan sonra bu form devre dışı kalır.
        </p>
        <div>
          <label class="text-sm font-medium text-slate-600 dark:text-slate-300">Ad</label>
          <input v-model="bootstrapForm.name" type="text" required class="input-field mt-1" placeholder="Yönetici" />
        </div>
        <div>
          <label class="text-sm font-medium text-slate-600 dark:text-slate-300">E-posta</label>
          <input
            v-model="bootstrapForm.email"
            type="email"
            required
            autocomplete="email"
            class="input-field mt-1"
            placeholder="admin@estate.com"
          />
        </div>
        <div>
          <label class="text-sm font-medium text-slate-600 dark:text-slate-300">Şifre (en az 8 karakter)</label>
          <input
            v-model="bootstrapForm.password"
            type="password"
            required
            minlength="8"
            autocomplete="new-password"
            class="input-field mt-1"
            placeholder="••••••••"
          />
        </div>
        <button type="submit" class="btn-primary w-full" :disabled="submitting">
          {{ submitting ? 'Hesap oluşturuluyor…' : 'Yönetici Hesabı Oluştur' }}
        </button>
      </form>
    </div>
  </div>
</template>
