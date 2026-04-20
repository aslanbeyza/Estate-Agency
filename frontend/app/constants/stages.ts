import type { Stage, StageMeta } from '~/types'

export const STAGE_ORDER: readonly Stage[] = [
  'agreement',
  'earnest_money',
  'title_deed',
  'completed',
] as const

type StageMetaInput = Omit<StageMeta, 'surface' | 'textOn'>

function withSurface(meta: StageMetaInput): StageMeta {
  return {
    ...meta,
    surface: `${meta.bg} ${meta.dBg} ${meta.border} ${meta.dBorder}`,
    textOn: `${meta.text} ${meta.dText}`,
  }
}

export const STAGE_META: Record<Stage, StageMeta> = {
  agreement: withSurface({
    label: 'Anlaşma',
    desc: 'Satıcı ve alıcı anlaşma sağladı',
    bg: 'bg-amber-50',
    dBg: 'dark:bg-amber-950/40',
    border: 'border-amber-200',
    dBorder: 'dark:border-amber-800',
    text: 'text-amber-700',
    dText: 'dark:text-amber-400',
    icon: '🤝',
  }),
  earnest_money: withSurface({
    label: 'Kapora',
    desc: 'Kapora bedeli alıcıdan teslim alındı',
    bg: 'bg-blue-50',
    dBg: 'dark:bg-blue-950/40',
    border: 'border-blue-200',
    dBorder: 'dark:border-blue-800',
    text: 'text-blue-700',
    dText: 'dark:text-blue-400',
    icon: '💰',
  }),
  title_deed: withSurface({
    label: 'Tapu',
    desc: 'Tapu devir işlemleri başlatıldı',
    bg: 'bg-violet-50',
    dBg: 'dark:bg-violet-950/40',
    border: 'border-violet-200',
    dBorder: 'dark:border-violet-800',
    text: 'text-violet-700',
    dText: 'dark:text-violet-400',
    icon: '📋',
  }),
  completed: withSurface({
    label: 'Tamamlandı',
    desc: 'İşlem başarıyla tamamlandı',
    bg: 'bg-emerald-50',
    dBg: 'dark:bg-emerald-950/40',
    border: 'border-emerald-200',
    dBorder: 'dark:border-emerald-800',
    text: 'text-emerald-700',
    dText: 'dark:text-emerald-400',
    icon: '✅',
  }),
}
