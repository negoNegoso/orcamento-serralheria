'use client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { setStatus } from '@/app/(app)/orcamentos/actions'
import { formatBRL } from '@/lib/format'

export function ShareBar({ quoteId, token, customerName, total, markSent, fullMessage }: {
  quoteId: string; token: string; customerName: string; total: number; markSent: boolean; fullMessage: string
}) {
  const [copied, setCopied] = useState(false)
  const [waOpen, setWaOpen] = useState(false)
  const waRef = useRef<HTMLDivElement>(null)
  const publicUrl = () => `${window.location.origin}/o/${token}`

  async function sent() { if (markSent) await setStatus(quoteId, 'enviado') }

  useEffect(() => {
    if (!waOpen) return
    function handleMouseDown(e: MouseEvent) {
      if (waRef.current && !waRef.current.contains(e.target as Node)) setWaOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setWaOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [waOpen])

  async function sendLink() {
    const msg = `Olá, ${customerName}! Segue seu orçamento (total ${formatBRL(total)}): ${publicUrl()}`
    setWaOpen(false)
    await sent()
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  async function sendFullMessage() {
    setWaOpen(false)
    await sent()
    window.open(`https://wa.me/?text=${encodeURIComponent(fullMessage)}`, '_blank')
  }

  return (
    <div className="no-print flex flex-wrap gap-2">
      <div ref={waRef} className="relative">
        <Button onClick={() => setWaOpen(o => !o)} aria-haspopup="menu" aria-expanded={waOpen}>WhatsApp</Button>
        {waOpen && (
          <div role="menu" className="absolute left-0 top-full z-10 mt-1 flex min-w-max flex-col rounded-md border bg-card shadow">
            <button
              role="menuitem"
              className="px-4 py-2 text-left text-sm hover:bg-muted"
              onClick={sendLink}
            >Enviar link</button>
            <button
              role="menuitem"
              className="px-4 py-2 text-left text-sm hover:bg-muted"
              onClick={sendFullMessage}
            >Enviar mensagem completa</button>
          </div>
        )}
      </div>
      <Button variant="outline" onClick={async () => {
        await navigator.clipboard.writeText(publicUrl())
        await sent()
        setCopied(true); setTimeout(() => setCopied(false), 2000)
      }}>{copied ? 'Copiado!' : 'Copiar link'}</Button>
      <Button variant="outline" onClick={() => window.print()}>Baixar PDF</Button>
    </div>
  )
}
