import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import WordDetailScreen from '../components/WordDetailScreen'
import WordBadges from '../components/WordBadges'

function fmtDate(date) {
  const d = new Date(date)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function dayKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function StudyHistory() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [wordContext, setWordContext] = useState(null) // { word, sessionWords, sessionIndex }

  useEffect(() => {
    async function load() {
      const [allCards, capturedList] = await Promise.all([
        db.cards.filter(c => !!c.lastReviewed).toArray(),
        db.captured_words.toArray(),
      ])

      // 全wordIdを集める（cards + captured_words の leapNumber で lookup）
      const cardWordIds = allCards.map(c => c.wordId)
      const capturedLeapNums = capturedList.map(c => c.leapNumber)

      const [cardWords, capturedWords] = await Promise.all([
        cardWordIds.length > 0
          ? db.words.where('id').anyOf(cardWordIds).toArray()
          : Promise.resolve([]),
        capturedLeapNums.length > 0
          ? db.words.where('leapNumber').anyOf(capturedLeapNums).toArray()
          : Promise.resolve([]),
      ])

      const wordMap = Object.fromEntries(cardWords.map(w => [w.id, w]))
      // leapNumber → word（複数PartにまたがるNO重複があるため最初の1件を使う）
      const leapNumMap = {}
      for (const w of capturedWords) {
        if (!leapNumMap[w.leapNumber]) leapNumMap[w.leapNumber] = w
      }

      // 日付でグループ化（wordId + dateKey でユニーク）
      const dateMap = {}
      const seenKeys = new Set()

      function addEntry(key, date, word, isCaptured = false) {
        const dedupeKey = `${word.id}_${key}`
        if (seenKeys.has(dedupeKey)) return
        seenKeys.add(dedupeKey)
        if (!dateMap[key]) dateMap[key] = { dateKey: key, date, entries: [] }
        dateMap[key].entries.push({ word, date: new Date(date), isCaptured })
      }

      // cards からの履歴
      for (const card of allCards) {
        if (!card.lastReviewed || !wordMap[card.wordId]) continue
        const d = new Date(card.lastReviewed)
        addEntry(dayKey(d), d, wordMap[card.wordId], false)
      }

      // captured_words からの履歴
      for (const cap of capturedList) {
        const word = leapNumMap[cap.leapNumber]
        if (!word) continue
        const d = cap.capturedAt ? new Date(cap.capturedAt) : new Date()
        addEntry(dayKey(d), d, word, true)
      }

      if (Object.keys(dateMap).length === 0) { setLoading(false); return }

      // 新しい日付が上・単語は時刻が新しい順
      const sorted = Object.values(dateMap)
        .sort((a, b) => b.date - a.date)
        .map(g => ({
          ...g,
          dateLabel: fmtDate(g.date),
          entries: g.entries.sort((a, b) => b.date - a.date),
          words: g.entries.sort((a, b) => b.date - a.date).map(e => e.word),
        }))

      setGroups(sorted)
      setLoading(false)
    }
    load()
  }, [])

  if (wordContext) {
    return (
      <WordDetailScreen
        word={wordContext.word}
        onBack={() => setWordContext(null)}
        sessionWords={wordContext.sessionWords}
        initialIndex={wordContext.sessionIndex}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white px-4 py-8">
      <div className="max-w-sm mx-auto">
        <div className="flex items-center mb-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white mr-4 text-lg">
            ← 戻る
          </button>
          <h1 className="text-2xl font-bold">学習履歴</h1>
        </div>

        {loading ? (
          <p className="text-slate-600 text-center py-10">読み込み中…</p>
        ) : groups.length === 0 ? (
          <p className="text-slate-600 text-sm">まだ学習履歴がありません</p>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map(({ dateKey, dateLabel, words, entries }) => (
              <div key={dateKey}>
                <p className="text-slate-400 text-sm font-bold mb-2">{dateLabel}
                  <span className="text-slate-600 font-normal ml-2">{entries.length}件</span>
                </p>
                <div className="flex flex-col gap-1">
                  {entries.map(({ word, isCaptured }, i) => (
                    <button
                      key={`${word.id}_${i}`}
                      onClick={() => setWordContext({ word, sessionWords: words, sessionIndex: i })}
                      className="w-full text-left px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center gap-3 active:scale-95 transition-all"
                    >
                      <span className="text-slate-500 text-xs w-14 shrink-0">No.{word.leapNumber}</span>
                      <WordBadges isCaptured={isCaptured} />
                      <span className="text-white font-bold flex-1 truncate">{word.word}</span>
                      <span className="text-slate-500 text-sm truncate max-w-28">{word.meaning}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
