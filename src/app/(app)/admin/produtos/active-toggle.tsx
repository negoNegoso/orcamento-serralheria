'use client'
import { useState, useTransition } from 'react'
import { Switch } from '@base-ui/react/switch'
import { cn } from '@/lib/utils'
import { toggleProductActive } from './actions'

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [checked, setChecked] = useState(active)
  const [pending, startTransition] = useTransition()

  function onCheckedChange(next: boolean) {
    setChecked(next) // otimista
    startTransition(async () => {
      try {
        await toggleProductActive(id, next)
      } catch {
        setChecked(!next) // reverte em erro
      }
    })
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={pending}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
          'border border-transparent transition-colors outline-none',
          'focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50',
          'bg-input data-[checked]:bg-primary',
        )}
      >
        <Switch.Thumb
          className={cn(
            'block size-5 rounded-full bg-background shadow transition-transform',
            'translate-x-0.5 data-[checked]:translate-x-[22px]',
          )}
        />
      </Switch.Root>
      <span className="text-muted-foreground">{checked ? 'Ativo' : 'Inativo'}</span>
    </label>
  )
}
