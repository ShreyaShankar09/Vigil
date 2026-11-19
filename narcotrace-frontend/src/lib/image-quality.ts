export type QuickImageWarning = 'dark' | 'blurry' | 'darkAndBlurry' | null

export function assessImagePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): QuickImageWarning {
  if (width < 3 || height < 3 || pixels.length < width * height * 4) return null

  const gray = new Float32Array(width * height)
  let brightness = 0
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    const luminance = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114
    gray[index] = luminance
    brightness += luminance
  }
  brightness /= width * height

  let laplacianSum = 0
  let laplacianSquaredSum = 0
  let samples = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x
      const value = gray[index - width] + gray[index + width]
        + gray[index - 1] + gray[index + 1] - 4 * gray[index]
      laplacianSum += value
      laplacianSquaredSum += value * value
      samples += 1
    }
  }
  const laplacianVariance = laplacianSquaredSum / samples - (laplacianSum / samples) ** 2
  const dark = brightness < 42
  const blurry = laplacianVariance < 18
  if (dark && blurry) return 'darkAndBlurry'
  if (dark) return 'dark'
  if (blurry) return 'blurry'
  return null
}

export function assessCanvas(canvas: HTMLCanvasElement): QuickImageWarning {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  return assessImagePixels(data, canvas.width, canvas.height)
}
