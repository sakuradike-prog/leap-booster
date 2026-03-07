// PWAアイコン生成スクリプト（初回のみ実行）
// node scripts/generate-icons.js

import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// SVGアイコンデザイン
// 背景: スレート (#0f172a)、メインカラー: ブルー (#3b82f6)、稲妻: アンバー (#f59e0b)
function makeSvg(size) {
  const pad = Math.round(size * 0.12)
  const r = Math.round(size * 0.22)  // 角丸半径
  const cx = size / 2
  const cy = size / 2

  // 稲妻ポリゴン（中央）
  const boltW = size * 0.38
  const boltH = size * 0.58
  const bx = cx - boltW / 2
  const by = cy - boltH / 2
  const points = [
    `${bx + boltW * 0.62},${by}`,
    `${bx + boltW * 0.28},${by + boltH * 0.46}`,
    `${bx + boltW * 0.54},${by + boltH * 0.46}`,
    `${bx + boltW * 0.18},${by + boltH}`,
    `${bx + boltW * 0.72},${by + boltH * 0.52}`,
    `${bx + boltW * 0.46},${by + boltH * 0.52}`,
  ].join(' ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- 背景 -->
  <rect width="${size}" height="${size}" rx="${r}" fill="#0f172a"/>
  <!-- ブルーのサークル -->
  <circle cx="${cx}" cy="${cy}" r="${size * 0.38}" fill="#1e3a5f" opacity="0.8"/>
  <!-- 稲妻 -->
  <polygon points="${points}" fill="#f59e0b"/>
  <!-- "L+" テキスト -->
  <text x="${cx}" y="${size * 0.88}" font-family="system-ui, Arial, sans-serif" font-size="${size * 0.14}" font-weight="900" fill="#3b82f6" text-anchor="middle" letter-spacing="1">LEAP+</text>
</svg>`
}

async function main() {
  const outDir = path.join(__dirname, '..', 'public', 'icons')
  fs.mkdirSync(outDir, { recursive: true })

  for (const size of [192, 512]) {
    const svg = makeSvg(size)
    const outPath = path.join(outDir, `icon-${size}.png`)
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(outPath)
    console.log(`✓ ${outPath}`)
  }
  console.log('アイコン生成完了')
}

main().catch(err => { console.error(err); process.exit(1) })
