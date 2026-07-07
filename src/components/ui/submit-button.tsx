'use client'
import type { ComponentProps } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from './button'
import { Spinner } from './spinner'

export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending && <Spinner className="size-4" />}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  )
}
