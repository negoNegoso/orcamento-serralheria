'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { shiftPeriod, type CalView } from '@/lib/production/calendar'
import { urgencyFor } from '@/lib/production/urgency'
import { STAGE_LABELS } from '@/lib/production/stages'
import type { CalendarQuote } from '@/lib/production/queries'

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function CalendarView({ view, dateISO, days, quotesByDate, todayISO }: {
  view: CalView
  dateISO: string
  days: string[]
  quotesByDate: Record<string, CalendarQuote[]>
  todayISO: string
}) {
  const router = useRouter()
  const go = (v: CalView, d: string) => router.push(`/producao/calendario?view=${v}&date=${d}`)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {(['dia', 'semana', 'mes'] as CalView[]).map(v => (
            <button key={v} onClick={() => go(v, dateISO)}
              className={`rounded border px-2 py-1 text-sm capitalize ${v === view ? 'bg-primary text-primary-foreground' : ''}`}>
              {v === 'mes' ? 'mês' : v}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button className="rounded border px-2 py-1" onClick={() => go(view, shiftPeriod(view, dateISO, -1))}>‹</button>
          <button className="rounded border px-2 py-1 text-sm" onClick={() => go(view, todayISO)}>Hoje</button>
          <button className="rounded border px-2 py-1" onClick={() => go(view, shiftPeriod(view, dateISO, 1))}>›</button>
          <input type="date" value={dateISO} aria-label="Escolher data"
            onChange={e => { if (e.target.value) go(view, e.target.value) }}
            className="rounded border bg-background px-2 py-1 text-sm" />
        </div>
      </div>

      <div className={view === 'mes' || view === 'semana' ? 'grid grid-cols-7 gap-1' : 'space-y-2'}>
        {(view === 'mes' || view === 'semana') && DOW.map(d => (
          <div key={d} className="p-1 text-center text-xs font-semibold text-muted-foreground">{d}</div>
        ))}
        {days.map(day => {
          const list = quotesByDate[day] ?? []
          return (
            <div key={day} className={`min-h-16 rounded border p-1 ${day === todayISO ? 'ring-2 ring-primary' : ''}`}>
              <div className="text-xs text-muted-foreground">
                {view === 'dia'
                  ? `${Number(day.slice(8, 10))} — ${new Date(day + 'T12:00:00').toLocaleDateString('pt-BR')}`
                  : <button className="rounded px-1 hover:bg-muted hover:text-foreground"
                      title="Ver este dia" onClick={() => go('dia', day)}>
                      {Number(day.slice(8, 10))}
                    </button>}
              </div>
              <div className="space-y-1">
                {list.map(q => (
                  <Link key={q.id} href={`/orcamentos/${q.id}`}
                    className={`block truncate rounded border bg-background px-1 py-0.5 text-xs shadow-sm hover:bg-muted ${q.archived ? 'opacity-40 line-through' : ''} ${
                      urgencyFor(q.delivery_date, todayISO) === 'atrasado' ? 'text-red-600'
                      : urgencyFor(q.delivery_date, todayISO) === 'urgente' ? 'text-amber-600' : ''}`}
                    title={`${q.customer_name} · ${q.production_stage ? STAGE_LABELS[q.production_stage] : ''}`}>
                    {q.customer_name}
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
