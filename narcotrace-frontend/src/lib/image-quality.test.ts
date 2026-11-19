import { describe, expect, it } from 'vitest'
import { assessImagePixels } from '@/lib/image-quality'

function pixels(width: number, height: number, color: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    data.set([...color, 255], index * 4)
  }
  return data
}

describe('quick image quality assessment', () => {
  it('warns when the preview is dark', () => {
    expect(assessImagePixels(pixels(32, 32, [10, 10, 10]), 32, 32)).toBe('darkAndBlurry')
  })

  it('warns when the preview has little high-frequency detail', () => {
    const data = pixels(32, 32, [180, 180, 180])
    expect(assessImagePixels(data, 32, 32)).toBe('blurry')
  })

  it('does not warn on a bright, detailed image', () => {
    const width = 32
    const height = 32
    const data = pixels(width, height, [40, 40, 40])
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = (x + y) % 2 === 0 ? 240 : 80
        data.set([value, value, value, 255], (y * width + x) * 4)
      }
    }
    expect(assessImagePixels(data, width, height)).toBeNull()
  })
})
