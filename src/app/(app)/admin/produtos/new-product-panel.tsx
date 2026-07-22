'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

export function NewProductPanel({ heading, children }: {
  heading?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">{heading}</div>
        <Button variant={open ? 'outline' : 'default'} onClick={() => setOpen(o => !o)}>
          {open ? 'Cancelar' : (<><Icon name="add" /> Novo produto</>)}
        </Button>
      </div>
      {open && children}
    </div>
  )
}
