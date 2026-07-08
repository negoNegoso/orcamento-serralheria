/** Valida uma data de entrega no formato ISO YYYY-MM-DD (usada no <input type="date">). */
export function isValidDeliveryDate(s: string): boolean {
  const t = String(s).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false
  const d = new Date(t + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return false
  // rejeita normalização silenciosa (ex.: 2026-13-40 vira outra data)
  return d.toISOString().slice(0, 10) === t
}
