import { db } from '../db/database'

/**
 * word_families.json を読み込んで IndexedDB に保存する。
 * すでにロード済みの場合はスキップ。
 */
export async function loadWordFamilies() {
  const count = await db.wordFamilies.count()
  if (count > 0) return

  const res = await fetch('/data/word_families.json')
  if (!res.ok) {
    console.warn('word_families.json の取得に失敗しました')
    return
  }
  const data = await res.json()

  // wordFamilies テーブルに一括登録（重複キーは上書き）
  await db.wordFamilies.bulkPut(data.wordFamilies)

  // words テーブルの各単語に familyId をセット
  const wordMap = data.wordFamilyMap // { word: familyId }
  const wordKeys = Object.keys(wordMap)

  // 単語名でまとめて検索
  const wordRecords = await db.words.where('word').anyOf(wordKeys).toArray()

  // 同じ単語が複数レコードある場合は最初の1件だけ対象にする（重複防止）
  const seen = new Set()
  const uniqueRecords = wordRecords.filter(r => {
    const key = r.word.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  await db.transaction('rw', db.words, async () => {
    for (const record of uniqueRecords) {
      const familyId = wordMap[record.word.toLowerCase()]
      if (familyId != null) {
        await db.words.update(record.id, { familyId })
      }
    }
  })

  console.log(`語族データをロードしました: ${data.wordFamilies.length} グループ`)
}
