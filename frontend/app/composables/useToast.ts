import type { Toast, ToastKind } from '~/types';

const toasts = ref<Toast[]>([]);
let seq = 0;

export function useToast() {
  function push(kind: ToastKind, message: string, ttl = 3500) {
    const id = ++seq;
    toasts.value.push({ id, kind, message });
    setTimeout(() => dismiss(id), ttl);
  }
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }
  return {
    toasts,
    success: (m: string) => push('success', m),
    error:   (m: string) => push('error', m, 5000),
    info:    (m: string) => push('info', m),
    dismiss,
  };
}
