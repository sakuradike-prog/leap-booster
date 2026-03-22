import { db } from '../db/database'

const VALID_PARTS = ['Part1', 'Part2', 'Part3', 'Part4', 'α']

// ダブルクォートで囲まれたフィールド内のカンマを正しく処理するCSVパーサー
function splitCSVRow(line) {
  const cols = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      cols.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  cols.push(cur)
  return cols
}

function parseCSV(text) {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''))
  if (lines.length < 2) throw new Error('データが空です')

  const header = splitCSVRow(lines[0])
  const required = ['word', 'meaning', 'partOfSpeech', 'leapPart', 'leapNumber']
  for (const col of required) {
    if (!header.includes(col)) throw new Error(`ヘッダーに "${col}" がありません`)
  }

  const idx = (name) => header.indexOf(name)
  const words = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cols = splitCSVRow(lines[i])

    const leapPart = cols[idx('leapPart')]?.trim()
    if (!VALID_PARTS.includes(leapPart)) continue

    const leapNumber = parseInt(cols[idx('leapNumber')]?.trim(), 10)
    if (isNaN(leapNumber)) continue

    const tagsRaw = cols[idx('tags')]?.trim() ?? ''
    const tags = tagsRaw ? tagsRaw.split('|').map(t => t.trim()).filter(Boolean) : []

    words.push({
      word: cols[idx('word')]?.trim() ?? '',
      meaning: cols[idx('meaning')]?.trim() ?? '',
      partOfSpeech: cols[idx('partOfSpeech')]?.trim() ?? '',
      example: cols[idx('example')]?.trim() ?? '',
      leapPart,
      leapNumber,
      tags,
    })
  }

  return words
}

// URLからCSVを取得してDBにインポートする
// clearAll=true の場合、インポート前に全テーブルをクリアする
// sourceBook: 'new'（改訂版）| 'old'（旧版）。各単語にスタンプして混在を防ぐ
export async function importCSVFromUrl(csvUrl, clearAll = false, sourceBook = 'new') {
  const res = await fetch(csvUrl)
  if (!res.ok) throw new Error(`CSVの取得に失敗しました (${res.status})`)
  const text = await res.text()
  const rawWords = parseCSV(text)
  if (rawWords.length === 0) throw new Error('インポートできる単語がありませんでした')
  // sourceBook フィールドを全単語に付与（旧版と改訂版の混在を防ぐ）
  const words = rawWords.map(w => ({ ...w, sourceBook }))

  if (clearAll) {
    await db.transaction('rw', [db.words, db.cards, db.challengeHistory, db.warmupHistory, db.userStats, db.warmupSentences], async () => {
      await Promise.all([
        db.words.clear(),
        db.cards.clear(),
        db.challengeHistory.clear(),
        db.warmupHistory.clear(),
        db.userStats.clear(),
        db.warmupSentences.clear(),
      ])
    })
  }

  await db.words.bulkAdd(words)
  return words.length
}
