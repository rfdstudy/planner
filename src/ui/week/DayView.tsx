import { CalendarView } from './CalendarView'

/** Vue Jour : une seule colonne large, pour préparer la journée du soir. */
export function DayView(): React.JSX.Element {
  return <CalendarView mode="day" />
}
