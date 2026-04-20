export type Stage =
  | 'agreement'
  | 'earnest_money'
  | 'title_deed'
  | 'completed'

export interface StageMeta {
  label: string
  desc: string
  bg: string
  dBg: string
  border: string
  dBorder: string
  text: string
  dText: string
  icon: string
  /** bg + dark bg + border + dark border birleşik sınıf dizgisi */
  surface: string
  /** text + dark text birleşik sınıf dizgisi */
  textOn: string
}
