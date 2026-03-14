import { db } from '../db/database'

/**
 * leap_roots.csv を IndexedDB の roots テーブルに読み込む。
 * すでにデータがある場合はスキップ（初回のみ）。
 * フォーマット: root,meaning
 */
export async function loadRoots() {
  const count = await db.roots.count()
  if (count > 0) return // 読み込み済み

  const res = await fetch('/data/leap_roots.csv')
  if (!res.ok) throw new Error(`leap_roots.csv の取得に失敗 (${res.status})`)

  const text = await res.text()
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''))

  // ヘッダー行をスキップ
  const entries = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const commaIdx = line.indexOf(',')
    if (commaIdx < 0) continue
    const root = line.slice(0, commaIdx).trim()
    // 意味フィールドのダブルクォートを除去
    const meaning = line.slice(commaIdx + 1).trim().replace(/^"|"$/g, '').trim()
    if (root && meaning) {
      entries.push({ root, meaning })
    }
  }

  if (entries.length === 0) throw new Error('語源データが空です')
  await db.roots.bulkAdd(entries)
  console.log(`[loadRoots] ${entries.length}件の語源データを読み込みました`)
}
