import { buildCalendarIcs } from '../core/ics'
import { formatLocalDate } from '../core/time'
import { repositories } from '../db/repositories'
import { platform } from '../platform'

/** Prépare le calendrier ICS complet puis le remet à la plateforme d'export. */
export async function exportCalendarIcs(): Promise<boolean> {
  const [items, blocks, templates, overrides, categories] = await Promise.all([
    repositories.items.list(),
    repositories.blocks.list(),
    repositories.templates.list(),
    repositories.overrides.list(),
    repositories.categories.list()
  ])
  const content = buildCalendarIcs({ items, blocks, templates, overrides, categories })

  const result = await platform.saveTextFile({
    fileName: `planner-calendrier-${formatLocalDate(new Date())}.ics`,
    content,
    mimeType: 'text/calendar',
    filters: [{ name: 'Calendrier iCalendar', extensions: ['ics'] }]
  })

  return result.saved
}
