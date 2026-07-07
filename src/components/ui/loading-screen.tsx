import { Spinner } from './spinner'

export function LoadingScreen({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Spinner className="size-8" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
