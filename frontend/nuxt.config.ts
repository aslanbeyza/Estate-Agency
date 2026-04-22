import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  srcDir: 'app/',
  dir: { pages: 'pages' },
  devtools: { enabled: true },
  devServer: { port: 3000 },
  modules: ['@pinia/nuxt'],
  vite: {
    plugins: [tailwindcss()],
  },
  // Common typo: /islemeler → correct route is /islemler
  routeRules: {
    '/islemeler': { redirect: { to: '/islemler', statusCode: 301 } },
    '/islemeler/**': { redirect: { to: '/islemler/**', statusCode: 301 } },
  },
  runtimeConfig: {
    public: {
      // Trim: dashboard copy/paste often adds trailing newline — breaks fetch URLs.
      apiBase: (process.env.NUXT_PUBLIC_API_BASE ?? 'http://localhost:3001').trim(),
    },
  },
});
