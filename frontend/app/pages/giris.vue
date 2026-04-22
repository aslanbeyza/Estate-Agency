<script setup lang="ts">
const auth = useAuthStore()
const toast = useToast()
const route = useRoute()

const loginForm = reactive({ email: '', password: '' })
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
      <form class="space-y-4" @submit.prevent="onLogin">
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
    </div>
  </div>
</template>
