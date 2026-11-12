import { DEFAULT_ITEM_TYPE_IDS } from '../src/core/itemTypes'
import type { ItemType } from '../src/core/types'

const TIMESTAMP = '2026-11-11T10:00:00.000Z'

export function makeItemType(overrides: Partial<ItemType> = {}): ItemType {
  return {
    id: DEFAULT_ITEM_TYPE_IDS.task,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    name: 'Tâche',
    order: 0,
    archivedAt: null,
    style: 'category',
    color: null,
    isTask: true,
    countdown: false,
    placement: 'grid',
    ...overrides
  }
}

export const TASK_TYPE = makeItemType()

export const FIXED_TYPE = makeItemType({
  id: DEFAULT_ITEM_TYPE_IDS.fixed,
  name: 'Fixe',
  style: 'neutral',
  isTask: false,
  placement: 'grid'
})

export const EXAM_TYPE = makeItemType({
  id: DEFAULT_ITEM_TYPE_IDS.exam,
  name: 'Épreuve',
  style: 'alert',
  isTask: false,
  countdown: true,
  placement: 'topLine'
})

export const FREE_TYPE = makeItemType({
  id: DEFAULT_ITEM_TYPE_IDS.free,
  name: 'Libre',
  style: 'free',
  isTask: false,
  placement: 'grid'
})

export const EVENT_TYPE = makeItemType({
  id: DEFAULT_ITEM_TYPE_IDS.event,
  name: 'Événement',
  style: 'neutral',
  color: '#6E56CF',
  isTask: false,
  countdown: false,
  placement: 'topLine'
})
