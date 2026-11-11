import { CalendarView } from './CalendarView'

/** Vue Semaine : sept colonnes, une par jour. */
export function WeekView(): React.JSX.Element {
  return <CalendarView mode="week" />
}
