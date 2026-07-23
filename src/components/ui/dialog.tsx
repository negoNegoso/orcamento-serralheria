'use client'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogClose = DialogPrimitive.Close

function DialogContent({
  title,
  className,
  children,
}: {
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Popup
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background shadow-lg max-h-[85vh] overflow-y-auto',
          className
        )}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogPrimitive.Title className="text-lg font-bold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Fechar"
          >
            <Icon name="close" className="text-xl" />
          </DialogPrimitive.Close>
        </div>
        <div className="p-6">{children}</div>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

export { Dialog, DialogClose, DialogContent }
