import { useState, useEffect, useRef } from 'react'
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
  const savedScrollY = useRef(0)

  useEffect(() => {
    async function load() {
      const [studyLogs, capturedList, checkedList, allCards, allWords] = await Promise.all([
        db.study_logs.filter(l => l.eventType === 'studied').toArray(),
        db.captured_words.toArray(),
        db.checked_words.toArray(),
        db.cards.toArray(),
        db.words.toArray(),
      ])

      const checkedLeapSet  = new Set(checkedList.map(c => c.leapNumber))
      const capturedLeapSet = new Set(capturedList.map(c => c.leapNumber))

      // leapNumber → word（最初の1件を使用）
      const leapToWord = {}
      for (const w of allWords) {
        if (!leapToWord[w.leapNumber]) leapToWord[w.leapNumber] = w
      }

      // leapNumber → card（incorrectCount 青色表示用）
      const wordIdToLeap = {}
      for (const w of allWords) wordIdToLeap[w.id] = w.leapNumber
      const leapToCard = {}
      for (const card of allCards) {
        const ln = wordIdToLeap[card.wordId]
        if (ln && !leapToCard[ln]) leapToCard[ln] = card
      }

      const dateMap = {}
      // 同日同単語の重複除去キー（新しい順に処理するので先着 = 最新）
      const seenDayLeap = new Set()

      // study_logs を新しい順に処理（同日同単語は最新のみ残す）
      // timestamp が同値のとき id（自動採番）が大きい方が後で記録されたログ
      const sortedLogs = [...studyLogs].sort((a, b) =>
        b.timestamp !== a.timestamp ? b.timestamp - a.timestamp : (b.id ?? 0) - (a.id ?? 0)
      )
      for (const log of sortedLogs) {
        const d = new Date(log.timestamp)
        const key = dayKey(d)
        const dedupeKey = `${key}_${log.leapNumber}`
        if (seenDayLeap.has(dedupeKey)) continue
        seenDayLeap.add(dedupeKey)

        const word = leapToWord[log.leapNumber]
        if (!word) continue

        if (!dateMap[key]) dateMap[key] = { dateKey: key, date: d, entries: [] }
        const card = leapToCard[log.leapNumber]
        const hasError   = (card?.incorrectCount ?? 0) >= 1
        const isCaptured = capturedLeapSet.has(log.leapNumber)
        const isChecked  = checkedLeapSet.has(log.leapNumber)
        dateMap[key].entries.push({ word, date: d, isCaptured, isChecked, hasError })
      }

      // captured_words からの履歴（study_logs に含まれない日付分も追加）
      for (const cap of capturedList) {
        const word = leapToWord[cap.leapNumber]
        if (!word) continue
        const d = cap.capturedAt ? new Date(cap.capturedAt) : new Date()
        const key = dayKey(d)
        const dedupeKey = `${key}_${cap.leapNumber}`
        if (seenDayLeap.has(dedupeKey)) continue
        seenDayLeap.add(dedupeKey)
        if (!dateMap[key]) dateMap[key] = { dateKey: key, date: d, entries: [] }
        dateMap[key].entries.push({ word, date: d, isCaptured: true, isChecked: checkedLeapSet.has(cap.leapNumber), hasError: false })
      }

      if (Object.keys(dateMap).length === 0) { setLoading(false); return }

      // 日付は新しい順、各日の単語も新しい順
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
    window.addEventListener('vocaleap:synced', load)
    window.addEventListener('vocaleap:checked', load)
    return () => {
      window.removeEventListener('vocaleap:synced', load)
      window.removeEventListener('vocaleap:checked', load)
    }
  }, [])

  // 単語詳細から戻ったときにスクロール位置を復元
  useEffect(() => {
    if (!wordContext && savedScrollY.current > 0) {
      const y = savedScrollY.current
      requestAnimationFrame(() => {
        window.scrollTo(0, y)
        document.documentElement.scrollTop = y
        document.body.scrollTop = y
      })
    }
  }, [wordContext])

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
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[600px] mx-auto px-5 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm active:opacity-60">← 戻る</button>
          <h1 className="text-lg font-bold">学習履歴</h1>
          <span className="text-slate-500 text-xs ml-1">間違えたことのある単語は青色で表示されています</span>
        </div>
      </div>
      <div className="max-w-[600px] mx-auto px-4 py-6">

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
                  {entries.map(({ word, isCaptured, isChecked, hasError }, i) => (
                    <button
                      key={`${word.id}_${i}`}
                      onClick={() => {
                        savedScrollY.current = window.scrollY || document.documentElement.scrollTop || 0
                        setWordContext({ word, sessionWords: words, sessionIndex: i })
                      }}
                      className="w-full text-left px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center gap-3 active:scale-95 transition-all"
                    >
                      <span className="text-slate-500 text-xs w-14 shrink-0">No.{word.leapNumber}</span>
                      <span className={`font-bold truncate ${hasError ? 'text-blue-400' : 'text-white'}`}>{word.word}</span>
                      <WordBadges isCaptured={isCaptured} isChecked={isChecked} />
                      <span className="text-slate-500 text-sm truncate max-w-28 ml-auto">{word.meaning}</span>
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
