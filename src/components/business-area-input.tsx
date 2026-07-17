'use client'

export function BusinessAreaInput({
  areas,
  defaultValue,
  required,
  className,
}: {
  areas: string[]
  defaultValue?: string
  required?: boolean
  className?: string
}) {
  const listId = 'business-areas-list'
  return (
    <>
      <input
        name="business_area"
        list={listId}
        defaultValue={defaultValue ?? ''}
        required={required}
        placeholder="Pesquise ou digite uma área"
        className={className ?? 'w-full rounded border px-3 py-2'}
        autoComplete="off"
      />
      <datalist id={listId}>
        {areas.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
    </>
  )
}
