'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

export function NewProductPanel({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant={open ? 'outline' : 'default'} onClick={() => setOpen(o => !o)}>
          {open ? 'Cancelar' : (<><Icon name="add" /> Novo produto</>)}
        </Button>
      </div>
      {open && children}
    </div>
  )
}
