/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * Génère les icônes PNG de la PWA sans dépendance externe. Le dessin est un
 * calendrier blanc sur fond graphite, aux couleurs de la charte.
 */

const GRAPHITE = [31, 35, 40, 255]
const WHITE = [255, 255, 255, 255]
const SUBTLE = [236, 236, 232, 255]
const SUPERSAMPLE = 3
const OUTPUT_DIRECTORY = resolve('public-phone/icons')

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }

  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function fillRect(pixels, size, x, y, width, height, color) {
  const startX = Math.max(0, Math.round(x * size))
  const endX = Math.min(size, Math.round((x + width) * size))
  const startY = Math.max(0, Math.round(y * size))
  const endY = Math.min(size, Math.round((y + height) * size))

  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      const offset = (py * size + px) * 4
      pixels[offset] = color[0]
      pixels[offset + 1] = color[1]
      pixels[offset + 2] = color[2]
      pixels[offset + 3] = color[3]
    }
  }
}

function fillRoundRect(pixels, size, x, y, width, height, radius, color) {
  const x0 = x * size
  const y0 = y * size
  const x1 = (x + width) * size
  const y1 = (y + height) * size
  const r = radius * size
  const left = Math.max(0, Math.floor(x0))
  const right = Math.min(size, Math.ceil(x1))
  const top = Math.max(0, Math.floor(y0))
  const bottom = Math.min(size, Math.ceil(y1))

  for (let py = top; py < bottom; py += 1) {
    const centerY = py + 0.5
    const dy = centerY < y0 + r ? y0 + r - centerY : centerY > y1 - r ? centerY - (y1 - r) : 0

    for (let px = left; px < right; px += 1) {
      const centerX = px + 0.5
      const dx = centerX < x0 + r ? x0 + r - centerX : centerX > x1 - r ? centerX - (x1 - r) : 0

      if (dx * dx + dy * dy > r * r) continue

      const offset = (py * size + px) * 4
      pixels[offset] = color[0]
      pixels[offset + 1] = color[1]
      pixels[offset + 2] = color[2]
      pixels[offset + 3] = color[3]
    }
  }
}

function scaledArtRect(rect, scale) {
  return {
    x: (rect.x - 0.5) * scale + 0.5,
    y: (rect.y - 0.5) * scale + 0.5,
    width: rect.width * scale,
    height: rect.height * scale,
    radius: rect.radius * scale
  }
}

function renderIcon(size, artScale = 1) {
  const canvasSize = size * SUPERSAMPLE
  const pixels = Buffer.alloc(canvasSize * canvasSize * 4)
  fillRect(pixels, canvasSize, 0, 0, 1, 1, GRAPHITE)

  const drawRoundRect = (rect, color) => {
    const scaled = scaledArtRect(rect, artScale)
    fillRoundRect(
      pixels,
      canvasSize,
      scaled.x,
      scaled.y,
      scaled.width,
      scaled.height,
      scaled.radius,
      color
    )
  }

  const drawRect = (rect, color) => {
    const scaled = scaledArtRect(rect, artScale)
    fillRect(pixels, canvasSize, scaled.x, scaled.y, scaled.width, scaled.height, color)
  }

  // Deux anneaux de reliure dépassent au-dessus de la page.
  drawRoundRect({ x: 0.305, y: 0.155, width: 0.058, height: 0.16, radius: 0.029 }, WHITE)
  drawRoundRect({ x: 0.637, y: 0.155, width: 0.058, height: 0.16, radius: 0.029 }, WHITE)

  // Page du calendrier.
  drawRoundRect({ x: 0.19, y: 0.25, width: 0.62, height: 0.56, radius: 0.085 }, WHITE)

  // Bandeau supérieur et séparateur.
  drawRoundRect({ x: 0.19, y: 0.25, width: 0.62, height: 0.115, radius: 0.085 }, SUBTLE)
  drawRect({ x: 0.19, y: 0.355, width: 0.62, height: 0.012 }, GRAPHITE)

  // Quatre cases de dates.
  drawRoundRect({ x: 0.285, y: 0.47, width: 0.12, height: 0.095, radius: 0.014 }, GRAPHITE)
  drawRoundRect({ x: 0.505, y: 0.47, width: 0.12, height: 0.095, radius: 0.014 }, GRAPHITE)
  drawRoundRect({ x: 0.285, y: 0.635, width: 0.12, height: 0.095, radius: 0.014 }, GRAPHITE)
  drawRoundRect({ x: 0.505, y: 0.635, width: 0.12, height: 0.095, radius: 0.014 }, SUBTLE)

  const output = Buffer.alloc(size * size * 4)
  const sampleCount = SUPERSAMPLE * SUPERSAMPLE

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0

      for (let sampleY = 0; sampleY < SUPERSAMPLE; sampleY += 1) {
        for (let sampleX = 0; sampleX < SUPERSAMPLE; sampleX += 1) {
          const sourceX = x * SUPERSAMPLE + sampleX
          const sourceY = y * SUPERSAMPLE + sampleY
          const offset = (sourceY * canvasSize + sourceX) * 4
          red += pixels[offset]
          green += pixels[offset + 1]
          blue += pixels[offset + 2]
          alpha += pixels[offset + 3]
        }
      }

      const offset = (y * size + x) * 4
      output[offset] = Math.round(red / sampleCount)
      output[offset + 1] = Math.round(green / sampleCount)
      output[offset + 2] = Math.round(blue / sampleCount)
      output[offset + 3] = Math.round(alpha / sampleCount)
    }
  }

  return encodePng(size, size, output)
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true })

const icons = [
  { file: 'icon-180.png', size: 180, scale: 1 },
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.78 }
]

for (const icon of icons) {
  await writeFile(resolve(OUTPUT_DIRECTORY, icon.file), renderIcon(icon.size, icon.scale))
  console.log(`${icon.file} généré.`)
}
