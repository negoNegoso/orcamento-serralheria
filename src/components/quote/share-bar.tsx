'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { setStatus } from '@/app/(app)/orcamentos/actions'
import { formatBRL } from '@/lib/format'

export function ShareBar({ quoteId, token, customerName, total, markSent }: {
  quoteId: string; token: string; customerName: string; total: number; markSent: boolean
}) {
  const [copied, setCopied] = useState(false)
  const publicUrl = () => `${window.location.origin}/o/${token}`

  async function sent() { if (markSent) await setStatus(quoteId, 'enviado') }

  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button onClick={async () => {
        const msg = `Olá, ${customerName}! Segue seu orçamento (total ${formatBRL(total)}): ${publicUrl()}`
        await sent()
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
      }}>WhatsApp</Button>
      <Button variant="outline" onClick={async () => {
        await navigator.clipboard.writeText(publicUrl())
        await sent()
        setCopied(true); setTimeout(() => setCopied(false), 2000)
      }}>{copied ? 'Copiado!' : 'Copiar link'}</Button>
      <Button variant="outline" onClick={() => window.print()}>Baixar PDF</Button>
    </div>
  )
}
