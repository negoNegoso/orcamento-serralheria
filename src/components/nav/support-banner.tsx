import { exitSupport } from '@/app/(app)/support-actions'

export function SupportBanner({ companyName }: { companyName: string }) {
  return (
    <div className="no-print sticky top-0 z-50 flex items-center justify-between gap-2 bg-amber-500 px-4 py-1.5 text-sm font-medium text-black">
      <span>🔧 Suporte: {companyName}</span>
      <form action={exitSupport}>
        <button type="submit" className="rounded bg-black/10 px-2 py-0.5 underline">Sair</button>
      </form>
    </div>
  )
}
