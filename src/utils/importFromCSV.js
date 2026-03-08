import { db } from '../db/database'

const VALID_PARTS = ['Part1', 'Part2', 'Part3', 'Part4', 'α']

function parseCSV(text) {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''))
  if (lines.length < 2) throw new Error('データが空です')

  const header = lines[0].split(',')
  const required = ['word', 'meaning', 'partOfSpeech', 'leapPart', 'leapNumber']
  for (const col of required) {
    if (!header.includes(col)) throw new Error(`ヘッダーに "${col}" がありません`)
  }

  const idx = (name) => header.indexOf(name)
  const words = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cols = lines[i].split(',')

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
export async function importCSVFromUrl(csvUrl, clearAll = false) {
  const res = await fetch(csvUrl)
  if (!res.ok) throw new Error(`CSVの取得に失敗しました (${res.status})`)
  const text = await res.text()
  const words = parseCSV(text)
  if (words.length === 0) throw new Error('インポートできる単語がありませんでした')

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
