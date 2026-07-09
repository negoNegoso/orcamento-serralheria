import { getProfile } from '@/lib/auth'
import { calendarDays, type CalView } from '@/lib/production/calendar'
import { fetchCalendarQuotes, type CalendarQuote } from '@/lib/production/queries'
import { ProductionNav } from '../producao-nav'
import { CalendarView } from '@/components/production/calendar-view'

export default async function CalendarioPage({ searchParams }: {
  searchParams: Promise<{ view?: string; date?: string }>
}) {
  const { view: rawView, date: rawDate } = await searchParams
  const view: CalView = rawView === 'dia' || rawView === 'semana' ? rawView : 'mes'
  const todayISO = new Date().toISOString().slice(0, 10)
  const dateISO = /^\d{4}-\d{2}-\d{2}$/.test(rawDate ?? '') ? rawDate! : todayISO

  const days = calendarDays(view, dateISO)
  const { supabase } = await getProfile()
  const quotes = await fetchCalendarQuotes(supabase, days[0], days[days.length - 1])

  const quotesByDate: Record<string, CalendarQuote[]> = {}
  for (const q of quotes) (quotesByDate[q.delivery_date] ??= []).push(q)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Produção</h1>
      <ProductionNav />
      <CalendarView view={view} dateISO={dateISO} days={days}
        quotesByDate={quotesByDate} todayISO={todayISO} />
    </div>
  )
}
