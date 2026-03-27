import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { supabase } from '../lib/supabase'
import WordDetailScreen from '../components/WordDetailScreen'
import WordBadges from '../components/WordBadges'

// 日付を "YYYY/M/D" 形式に
function fmtDate(date) {
  const d = new Date(date)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

// 時刻を "HH:MM" 形式に
function fmtTime(date) {
  const d = new Date(date)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 日付キー "YYYY-MM-DD" を生成（アクティビティ判定用）
function dayKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// parts 配列をフォーマット
function fmtParts(parts) {
  if (!parts || parts.length === 0) return '—'
  const hasPart1 = parts.includes('Part1')
  const hasPart2 = parts.includes('Part2')
  const hasPart3 = parts.includes('Part3')
  const hasPart4 = parts.includes('Part4')
  const hasAlpha = parts.includes('α')
  if (hasPart1 && hasPart2 && hasPart3 && hasPart4) {
    if (hasAlpha) return 'Part1〜Part4 + α'
    return 'Part1〜Part4'
  }
  return parts.join(' + ')
}

export default function Stats() {
  const navigate = useNavigate()

  const [challengeHistory, setChallengeHistory] = useState([])
  const [weakWords, setWeakWords]               = useState([])
  const [studyRanking, setStudyRanking]         = useState([])
  const [loading, setLoading]                   = useState(true)
  const [capturedSet, setCapturedSet]           = useState(new Set())
  const [checkedSet, setCheckedSet]             = useState(new Set())
  // { word, sessionWords, sessionIndex } | null
  const [wordContext, setWordContext]           = useState(null)
  const scrollPosRef = useRef(0)

  // 単語詳細から戻ったときにスクロール位置を復元
  useEffect(() => {
    if (wordContext === null && scrollPosRef.current > 0) {
      const pos = scrollPosRef.current
      requestAnimationFrame(() => window.scrollTo(0, pos))
    }
  }, [wordContext])

  function handleSelectWord(word, sessionWords, sessionIndex) {
    scrollPosRef.current = window.scrollY
    setWordContext({ word, sessionWords, sessionIndex })
  }

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id

      // 捕獲済み・チェック済みセット（IndexedDBから）
      const [capList, chkList] = await Promise.all([
        db.captured_words.toArray(),
        db.checked_words.toArray(),
      ])
      setCapturedSet(new Set(capList.map(c => c.leapNumber)))
      setCheckedSet(new Set(chkList.map(c => c.leapNumber)))

      if (uid) {
        // ── ログイン中：Supabaseから直接読む（全デバイスで同じデータを表示） ──

        // 30問チャレンジ履歴（新しい順20件）
        const { data: chData } = await supabase
          .from('challenge_history')
          .select('*')
          .eq('user_id', uid)
          .order('date', { ascending: false })
          .limit(20)
        setChallengeHistory((chData ?? []).map(rc => ({
          id:        rc.id,
          date:      rc.recorded_at ? new Date(rc.recorded_at) : new Date(rc.date + 'T00:00:00'),
          result:    rc.score      ?? 0,
          cleared:   rc.cleared    ?? false,
          totalTime: rc.total_time ?? null,
          parts:     rc.parts      ?? null,
        })))

        // cardsデータ
        const { data: cardsData } = await supabase
          .from('cards')
          .select('leap_number, study_count, incorrect_count')
          .eq('user_id', uid)

        // leapNumberでローカルの単語情報を引く
        const leapNums = (cardsData ?? []).map(c => c.leap_number)
        const words = leapNums.length > 0
          ? await db.words.where('leapNumber').anyOf(leapNums).toArray()
          : []
        const wordByLeap = Object.fromEntries(words.map(w => [w.leapNumber, w]))

        // 苦手な単語トップ10
        const weakCards = (cardsData ?? [])
          .filter(c => (c.incorrect_count ?? 0) > 0 && wordByLeap[c.leap_number])
          .sort((a, b) => (b.incorrect_count ?? 0) - (a.incorrect_count ?? 0))
          .slice(0, 10)
          .map(c => ({
            card: { incorrectCount: c.incorrect_count, studyCount: c.study_count },
            word: wordByLeap[c.leap_number],
          }))
        setWeakWords(weakCards)

        // 総学習回数ランキング トップ10
        const studyCards = (cardsData ?? [])
          .filter(c => (c.study_count ?? 0) > 0 && wordByLeap[c.leap_number])
          .sort((a, b) => (b.study_count ?? 0) - (a.study_count ?? 0))
          .slice(0, 10)
          .map(c => ({
            card: { incorrectCount: c.incorrect_count, studyCount: c.study_count },
            word: wordByLeap[c.leap_number],
          }))
        setStudyRanking(studyCards)

      } else {
        // ── 未ログイン：IndexedDBから読む ──

        const history = await db.challengeHistory
          .orderBy('date').reverse().limit(20).toArray()
        setChallengeHistory(history)

        const allCards = await db.cards.toArray()

        const topCards = allCards
          .filter(c => (c.incorrectCount ?? 0) > 0)
          .sort((a, b) => (b.incorrectCount ?? 0) - (a.incorrectCount ?? 0))
          .slice(0, 10)
        if (topCards.length > 0) {
          const wordIds = topCards.map(c => c.wordId)
          const words = await db.words.where('id').anyOf(wordIds).toArray()
          const wordMap = Object.fromEntries(words.map(w => [w.id, w]))
          setWeakWords(topCards.filter(c => wordMap[c.wordId]).map(c => ({ card: c, word: wordMap[c.wordId] })))
        } else {
          setWeakWords([])
        }

        const topStudy = allCards
          .filter(c => (c.studyCount ?? 0) > 0)
          .sort((a, b) => (b.studyCount ?? 0) - (a.studyCount ?? 0))
          .slice(0, 10)
        if (topStudy.length > 0) {
          const studyWordIds = topStudy.map(c => c.wordId)
          const studyWords = await db.words.where('id').anyOf(studyWordIds).toArray()
          const studyWordMap = Object.fromEntries(studyWords.map(w => [w.id, w]))
          setStudyRanking(topStudy.filter(c => studyWordMap[c.wordId]).map(c => ({ card: c, word: studyWordMap[c.wordId] })))
        } else {
          setStudyRanking([])
        }
      }

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
          <h1 className="text-lg font-bold">📊 学習記録</h1>
        </div>
      </div>
      <div className="max-w-[600px] mx-auto px-4 py-6">

        {loading ? (
          <p className="text-slate-600 text-center py-10">読み込み中…</p>
        ) : (
          <>
            {/* 30問チャレンジ履歴 */}
            <section className="mb-8">
              <h2 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">30問チャレンジ履歴</h2>
              {challengeHistory.length === 0 ? (
                <p className="text-slate-600 text-sm">まだ挑戦記録がありません</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {challengeHistory.map(h => {
                    const color = h.cleared ? 'text-amber-400' : 'text-slate-600'
                    return (
                      <div key={h.id} className="flex items-center gap-3 bg-slate-800 rounded-xl px-4 py-3">
                        <span className="flex-1 min-w-0">
                          <div className="text-slate-400 text-xs">
                            {fmtDate(h.date)} {fmtTime(h.date)}
                          </div>
                          <div className="text-sm font-bold text-white mt-0.5">
                            {fmtParts(h.parts)}
                          </div>
                        </span>
                        <span className={`text-sm font-bold tabular-nums ${color} flex-shrink-0 mr-2`}>
                          {h.totalTime != null ? `${h.totalTime}秒` : '—'}
                        </span>
                        <span className={`text-sm font-bold tabular-nums ${color} flex-shrink-0`}>
                          {h.result ?? 0} / 30
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* 苦手な単語トップ10 */}
            <section className="mb-8">
              <h2 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">苦手な単語トップ10</h2>
              {weakWords.length === 0 ? (
                <p className="text-slate-600 text-sm">まだデータがありません</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {weakWords.map(({ card, word }, i) => (
                    <button
                      key={word.id}
                      onClick={() => handleSelectWord(word, weakWords.map(e => e.word), i)}
                      className="w-full flex items-center gap-3 bg-slate-800 hover:bg-slate-700 rounded-xl px-4 py-3 text-left active:scale-95 transition-all"
                    >
                      <span className="text-slate-600 text-sm w-5 text-right flex-shrink-0">{i + 1}</span>
                      <span className="font-bold text-white text-sm truncate">{word.word}</span>
                      <WordBadges isCaptured={capturedSet.has(word.leapNumber)} isChecked={checkedSet.has(word.leapNumber)} />
                      <span className="text-slate-400 text-sm truncate max-w-24 ml-auto">{word.meaning}</span>
                      <span className="text-red-400 text-sm font-bold tabular-nums flex-shrink-0">
                        ×{card.incorrectCount}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* 総学習回数ランキング */}
            <section className="mb-8">
              <h2 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">総学習回数ランキング</h2>
              {studyRanking.length === 0 ? (
                <p className="text-slate-600 text-sm">まだデータがありません</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {studyRanking.map(({ card, word }, i) => (
                    <button
                      key={word.id}
                      onClick={() => handleSelectWord(word, studyRanking.map(e => e.word), i)}
                      className="w-full flex items-center gap-3 bg-slate-800 hover:bg-slate-700 rounded-xl px-4 py-3 text-left active:scale-95 transition-all"
                    >
                      <span className="text-slate-600 text-sm w-5 text-right flex-shrink-0">{i + 1}</span>
                      <span className="font-bold text-white text-sm truncate">{word.word}</span>
                      <WordBadges isCaptured={capturedSet.has(word.leapNumber)} isChecked={checkedSet.has(word.leapNumber)} />
                      <span className="text-slate-400 text-sm truncate max-w-24 ml-auto">{word.meaning}</span>
                      <span className="text-amber-400 text-sm font-bold tabular-nums flex-shrink-0">
                        {(card.studyCount ?? 0).toLocaleString()}回
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
