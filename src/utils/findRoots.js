/**
 * findRoots(word, rootsData)
 *
 * 単語と語源データを照合し、マッチした語源を最大3件返す。
 * rootsData: { root: string, meaning: string }[]
 *   - "im-"  → 接頭辞（語の先頭にマッチ）
 *   - "-able"→ 接尾辞（語の末尾にマッチ）
 *   - "port" → 語根（語の中間にマッチ）
 */
export function findRoots(word, rootsData) {
  if (!word || !rootsData || rootsData.length === 0) return []

  const lower = word.toLowerCase()
  const matches = []

  for (const entry of rootsData) {
    const { root, meaning } = entry
    if (!root || !meaning) continue

    const isPrefix = root.endsWith('-') && !root.startsWith('-')
    const isSuffix = root.startsWith('-') && !root.endsWith('-')

    if (isPrefix) {
      const prefix = root.slice(0, -1).toLowerCase()
      if (prefix.length >= 2 && lower.startsWith(prefix)) {
        matches.push({ ...entry, _matchLen: prefix.length, _type: 0 })
      }
    } else if (isSuffix) {
      const suffix = root.slice(1).toLowerCase()
      if (suffix.length >= 3 && lower.endsWith(suffix)) {
        matches.push({ ...entry, _matchLen: suffix.length, _type: 2 })
      }
    } else if (!root.includes('-')) {
      const stem = root.toLowerCase()
      if (stem.length >= 3 && lower.includes(stem)) {
        matches.push({ ...entry, _matchLen: stem.length, _type: 1 })
      }
    }
  }

  // マッチ長が長い順 → タイプ順（接頭辞 → 語根 → 接尾辞）で並べる
  matches.sort((a, b) =>
    b._matchLen - a._matchLen || a._type - b._type
  )

  // 重複するrootを除いて最大3件
  const seen = new Set()
  const result = []
  for (const m of matches) {
    if (!seen.has(m.root)) {
      seen.add(m.root)
      result.push({ root: m.root, meaning: m.meaning })
    }
    if (result.length >= 3) break
  }
  return result
}
