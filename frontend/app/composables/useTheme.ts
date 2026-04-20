export const useTheme = () => {
  const isDark = useState('isDark', () => false)

  function apply(dark: boolean) {
    isDark.value = dark
    if (import.meta.client) {
      document.documentElement.classList.toggle('dark', dark)
      localStorage.setItem('theme', dark ? 'dark' : 'light')
    }
  }

  function toggle() {
    apply(!isDark.value)
  }

  function init() {
    if (!import.meta.client) return
    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    apply(saved === 'dark' || (!saved && prefersDark))
  }

  return { isDark, toggle, init }
}
