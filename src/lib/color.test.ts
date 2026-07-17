import { describe, expect, it } from 'vitest'
import { isValidHexColor, readableTextColor } from './color'

describe('readableTextColor', () => {
  it('fundo escuro pede texto branco', () => {
    expect(readableTextColor('#006688')).toBe('#ffffff')
    expect(readableTextColor('#000000')).toBe('#ffffff')
    expect(readableTextColor('#7f1d1d')).toBe('#ffffff')
  })
  it('fundo claro pede texto escuro', () => {
    expect(readableTextColor('#ffffff')).toBe('#111111')
    expect(readableTextColor('#fde047')).toBe('#111111')
    expect(readableTextColor('#a7f3d0')).toBe('#111111')
  })
  it('entrada inválida cai no branco (cor default é escura)', () => {
    expect(readableTextColor('banana')).toBe('#ffffff')
  })
})

describe('isValidHexColor', () => {
  it('aceita #rrggbb minúsculo', () => {
    expect(isValidHexColor('#006688')).toBe(true)
    expect(isValidHexColor('#abcdef')).toBe(true)
  })
  it('recusa formatos errados', () => {
    expect(isValidHexColor('006688')).toBe(false)
    expect(isValidHexColor('#FFF')).toBe(false)
    expect(isValidHexColor('#GGHHII')).toBe(false)
  })
})
