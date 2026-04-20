/**
 * Generic "kart/form aç → doldur → kaydet → toast → kapat" akışı.
 *
 * Bütün sayfalardaki yineleyen state'i (showForm / submitting / formError / reset)
 * ve submit try/catch'i tek yerde toplar.
 */
export interface UseCrudFormOptions<TForm extends object, TResult> {
  /** Form'un başlangıç ve reset değeri. */
  initial: TForm
  /** Submit'i gerçekleştiren async fonksiyon — genelde store.create. */
  submit: (form: TForm) => Promise<TResult>
  /** Başarılı toast mesajı. */
  successMessage: string
  /** Senkron doğrulama — hata string'i döner, geçerse null. */
  validate?: (form: TForm) => string | null
  /** Hata mesajı default'u (`e.message` yoksa). */
  fallbackErrorMessage?: string
  /** Başarılı submit sonrası ek iş (navigation vb.). */
  onSuccess?: (result: TResult) => void
}

export function useCrudForm<TForm extends object, TResult>(
  options: UseCrudFormOptions<TForm, TResult>,
) {
  const toast = useToast()
  const showForm = ref(false)
  const form = reactive({ ...options.initial }) as TForm
  const submitting = ref(false)
  const formError = ref('')

  function reset() {
    Object.assign(form, options.initial)
    formError.value = ''
  }

  function close() {
    showForm.value = false
    formError.value = ''
  }

  function toggle() {
    showForm.value = !showForm.value
    if (!showForm.value) formError.value = ''
  }

  async function submit() {
    const validationError = options.validate?.(form)
    if (validationError) {
      formError.value = validationError
      return
    }
    submitting.value = true
    formError.value = ''
    try {
      const result = await options.submit(form)
      reset()
      showForm.value = false
      toast.success(options.successMessage)
      options.onSuccess?.(result)
    } catch (e: any) {
      const msg = e?.message ?? options.fallbackErrorMessage ?? 'Bir hata oluştu.'
      formError.value = msg
      toast.error(msg)
    } finally {
      submitting.value = false
    }
  }

  return { showForm, form, submitting, formError, submit, reset, close, toggle }
}
