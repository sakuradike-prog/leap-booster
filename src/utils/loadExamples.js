import { db } from '../db/database'

// ────────────────────────────────────────────
// RFC4180準拠の簡易CSVパーサー（クォート対応）
// ────────────────────────────────────────────
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'; i++ // エスケープされたクォート
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''))
  if (lines.length < 2) return []

  const header = parseCSVLine(lines[0])
  const idx = (name) => header.indexOf(name)
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cols = parseCSVLine(lines[i])
    const row = {}
    header.forEach((h, j) => { row[h] = (cols[j] ?? '').trim() })
    rows.push(row)
  }
  return rows
}

// ────────────────────────────────────────────
// ①②③... で分割して個別問題を生成
// ────────────────────────────────────────────
function parseExamples(word, leapNumber, leapPart, exampleEn, exampleJa) {
  if (!exampleEn || !exampleJa) return []

  // ② 以降の番号を境界として分割（①は先頭に残る）
  const enParts = exampleEn.split(/(?=[②③④⑤⑥])/)
  const jaParts = exampleJa.split(/(?=[②③④⑤⑥])/)
  const total = enParts.length

  return enParts.map((en, i) => ({
    word,
    leapNumber: parseInt(leapNumber, 10) || 0,
    leapPart,
    answerEn:   en.replace(/^[①②③④⑤⑥]/, '').trim(),
    questionJa: (jaParts[i] ?? '').replace(/^[①②③④⑤⑥]/, '').trim(),
    exampleIndex: i + 1,
    exampleTotal: total,
  }))
}

// ────────────────────────────────────────────
// メイン関数: leap_words_with_examples.csv を
// warmupSentences テーブルに差し替え読み込み
// ────────────────────────────────────────────
export async function loadExamples() {
  // 既存データが新フォーマット（answerEn フィールド）なら再読み込み不要
  const count = await db.warmupSentences.count()
  if (count > 500) return // 既に読み込み済み（旧warmupHistoryは数件しかない）

  // クリアして再インポート
  await db.warmupSentences.clear()

  const res = await fetch('/data/leap_words_with_examples.csv')
  if (!res.ok) throw new Error(`leap_words_with_examples.csv の取得に失敗 (${res.status})`)

  const text = await res.text()
  const rows = parseCSV(text)

  const entries = []
  for (const row of rows) {
    const { word, example, example_ja, leapPart, leapNumber } = row
    if (!word || !example || !example_ja) continue

    const questions = parseExamples(word, leapNumber, leapPart, example, example_ja)
    entries.push(...questions)
  }

  if (entries.length === 0) throw new Error('例文データが空です')
  await db.warmupSentences.bulkAdd(entries)
  console.log(`[loadExamples] ${entries.length}件の例文データを読み込みました`)
}
