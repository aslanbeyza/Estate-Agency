import { STAGE_META, STAGE_ORDER } from '~/constants/stages'
import type { Stage } from '~/types'

export function useStageMeta() {
  function metaOf(stage: Stage) {
    return STAGE_META[stage]
  }

  function indexOf(stage: Stage) {
    return STAGE_ORDER.indexOf(stage)
  }

  function nextStage(stage: Stage): Stage | null {
    const i = indexOf(stage)
    return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1]! : null
  }

  return { STAGE_META, STAGE_ORDER, metaOf, indexOf, nextStage }
}
