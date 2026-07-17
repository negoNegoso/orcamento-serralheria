// Cor de texto legível sobre uma cor de fundo, por luminância relativa (WCAG).
const HEX_RE = /^#[0-9a-f]{6}$/

export function isValidHexColor(v: string): boolean {
  return HEX_RE.test(v)
}

export function readableTextColor(hex: string): '#ffffff' | '#111111' {
  if (!HEX_RE.test(hex)) return '#ffffff'
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return luminance > 0.4 ? '#111111' : '#ffffff'
}
