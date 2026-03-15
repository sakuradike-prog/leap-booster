import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import WordDetailScreen from '../components/WordDetailScreen'

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
  const [selectedWord, setSelectedWord] = useState(null)

  useEffect(() => {
    async function load() {
      const allCards = await db.cards.filter(c => !!c.lastReviewed).toArray()
      if (allCards.length === 0) { setLoading(false); return }

      const wordIds = allCards.map(c => c.wordId)
      const words = await db.words.where('id').anyOf(wordIds).toArray()
      const wordMap = Object.fromEntries(words.map(w => [w.id, w]))

      // 日付でグループ化
      const dateMap = {}
      for (const card of allCards) {
        if (!card.lastReviewed || !wordMap[card.wordId]) continue
        const key = dayKey(card.lastReviewed)
        const lastReviewed = new Date(card.lastReviewed)
        if (!dateMap[key]) {
          dateMap[key] = { dateKey: key, date: lastReviewed, entries: [] }
        }
        dateMap[key].entries.push({ word: wordMap[card.wordId], lastReviewed })
      }

      // 新しい日付が上・単語は学習時刻が新しい順
      const sorted = Object.values(dateMap)
        .sort((a, b) => b.date - a.date)
        .map(g => ({
          ...g,
          dateLabel: fmtDate(g.date),
          words: g.entries
            .sort((a, b) => b.lastReviewed - a.lastReviewed)
            .map(e => e.word),
        }))

      setGroups(sorted)
      setLoading(false)
    }
    load()
  }, [])

  if (selectedWord) {
    return <WordDetailScreen word={selectedWord} onBack={() => setSelectedWord(null)} />
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
            {groups.map(({ dateKey, dateLabel, words }) => (
              <div key={dateKey}>
                <p className="text-slate-400 text-sm font-bold mb-2">{dateLabel}</p>
                <div className="flex flex-col gap-1">
                  {words.map(word => (
                    <button
                      key={word.id}
                      onClick={() => setSelectedWord(word)}
                      className="w-full text-left px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center gap-3 active:scale-95 transition-all"
                    >
                      <span className="text-white font-bold flex-1">{word.word}</span>
                      <span className="text-slate-500 text-sm truncate max-w-32">{word.meaning}</span>
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
