import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { useUserStats } from '../hooks/useUserStats'
import StreakBadge from '../components/StreakBadge'
import PointDisplay from '../components/PointDisplay'
import WordDetailScreen from '../components/WordDetailScreen'

// ---- バッジ定義 ----
const POINT_BADGES = [
  { id: 'starter',    label: 'Starter',      emoji: '⭐', desc: '50pt達成',   threshold: 50 },
  { id: 'challenger', label: 'Challenger',   emoji: '🥈', desc: '200pt達成',  threshold: 200 },
  { id: 'walker',     label: 'LEAP Walker',  emoji: '🚶', desc: '500pt達成',  threshold: 500 },
  { id: 'runner',     label: 'LEAP Runner',  emoji: '🏃', desc: '1000pt達成', threshold: 1000 },
  { id: 'master',     label: 'LEAP Master',  emoji: '🎓', desc: '2000pt達成', threshold: 2000 },
  { id: 'legend',     label: 'LEAP Legend',  emoji: '👑', desc: '5000pt達成', threshold: 5000 },
]
const STREAK_BADGES = [
  { id: 'week',    label: '一週間の炎', emoji: '🔥',   desc: '7日連続学習',   threshold: 7 },
  { id: 'month',   label: '一ヶ月の炎', emoji: '🌟',   desc: '30日連続学習',  threshold: 30 },
  { id: 'eternal', label: '不滅の炎',   emoji: '💥',   desc: '100日連続学習', threshold: 100 },
]

function computeBadges(stats, challengeHistory) {
  const cleared = challengeHistory.filter(h => h.cleared)
  const partsCleared = new Set(cleared.flatMap(h => h.parts ?? []))
  return {
    point:     POINT_BADGES.map(b => ({ ...b, earned: stats.totalPoints >= b.threshold })),
    streak:    STREAK_BADGES.map(b => ({ ...b, earned: (stats.longestStreak ?? stats.currentStreak ?? 0) >= b.threshold })),
    challenge: [
      { id: 'part1',   label: 'Part1 Cleared',      emoji: '📗', desc: 'Part1でクリア',       earned: partsCleared.has('Part1') },
      { id: 'full',    label: 'Full LEAP Cleared',   emoji: '📚', desc: 'Part4を含むクリア',   earned: partsCleared.has('Part4') },
      { id: 'triple',  label: 'Triple Crown',        emoji: '🏆', desc: 'クリア3回達成',       earned: cleared.length >= 3 },
    ],
  }
}

function BadgeGrid({ title, badges }) {
  return (
    <div className="mb-6">
      <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">{title}</h3>
      <div className="flex gap-2 flex-wrap">
        {badges.map(b => (
          <div
            key={b.id}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-14 transition-all ${
              b.earned ? 'bg-slate-700 text-white' : 'bg-slate-800/50 text-slate-700'
            }`}
            title={b.desc}
          >
            <span className={`text-2xl ${b.earned ? '' : 'grayscale opacity-30'}`}>{b.emoji}</span>
            <span className="text-xs font-bold leading-tight text-center" style={{ fontSize: '10px' }}>{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

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

export default function Stats() {
  const navigate = useNavigate()
  const { stats, loading: statsLoading } = useUserStats()

  const [challengeHistory, setChallengeHistory] = useState([])
  const [weekActivity, setWeekActivity]         = useState([])
  const [weakWords, setWeakWords]               = useState([])
  const [studyRanking, setStudyRanking]         = useState([])
  const [badgeWords, setBadgeWords]             = useState([])
  const [loading, setLoading]                   = useState(true)
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
      // 30問チャレンジ履歴（新しい順に最大20件）
      const history = await db.challengeHistory
        .orderBy('date').reverse().limit(20).toArray()
      setChallengeHistory(history)

      // 直近7日のアクティビティ
      const today = new Date()
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today)
        d.setDate(today.getDate() - (6 - i))
        return d
      })

      const since = new Date(days[0])
      since.setHours(0, 0, 0, 0)

      const sinceTime = since.getTime()
      const [allChLogs, allWuLogs] = await Promise.all([
        db.challengeHistory.toArray(),
        db.warmupHistory.toArray(),
      ])
      const chLogs = allChLogs.filter(r => new Date(r.date).getTime() >= sinceTime)
      const wuLogs = allWuLogs.filter(r => new Date(r.date).getTime() >= sinceTime)

      const activeKeys = new Set([
        ...chLogs.map(r => dayKey(r.date)),
        ...wuLogs.map(r => dayKey(r.date)),
      ])

      const clearKeys = new Set(
        chLogs.filter(r => r.cleared).map(r => dayKey(r.date))
      )

      setWeekActivity(days.map(d => ({
        date: d,
        key: dayKey(d),
        active: activeKeys.has(dayKey(d)),
        cleared: clearKeys.has(dayKey(d)),
      })))

      // 苦手な単語トップ10 + 総学習回数ランキング + バッジ獲得単語リスト
      const allCards = await db.cards.toArray()

      // 苦手単語
      const topCards = allCards
        .filter(c => (c.incorrectCount ?? 0) > 0)
        .sort((a, b) => (b.incorrectCount ?? 0) - (a.incorrectCount ?? 0))
        .slice(0, 10)
      const wordIds = topCards.map(c => c.wordId)
      if (wordIds.length > 0) {
        const words = await db.words.where('id').anyOf(wordIds).toArray()
        const wordMap = Object.fromEntries(words.map(w => [w.id, w]))
        const ranked = topCards
          .filter(c => (c.incorrectCount ?? 0) > 0 && wordMap[c.wordId])
          .slice(0, 10)
          .map(c => ({ card: c, word: wordMap[c.wordId] }))
        setWeakWords(ranked)
      }

      // 総学習回数ランキング トップ10
      const topStudy = allCards
        .filter(c => (c.studyCount ?? 0) > 0)
        .sort((a, b) => (b.studyCount ?? 0) - (a.studyCount ?? 0))
        .slice(0, 10)
      if (topStudy.length > 0) {
        const studyWordIds = topStudy.map(c => c.wordId)
        const studyWords = await db.words.where('id').anyOf(studyWordIds).toArray()
        const studyWordMap = Object.fromEntries(studyWords.map(w => [w.id, w]))
        setStudyRanking(
          topStudy.filter(c => studyWordMap[c.wordId])
            .map(c => ({ card: c, word: studyWordMap[c.wordId] }))
        )
      }

      // バッジ獲得単語リスト（studyCount >= 100）
      const badgeCards = allCards
        .filter(c => (c.studyCount ?? 0) >= 100)
        .sort((a, b) => (b.studyCount ?? 0) - (a.studyCount ?? 0))
      if (badgeCards.length > 0) {
        const badgeWordIds = badgeCards.map(c => c.wordId)
        const bWords = await db.words.where('id').anyOf(badgeWordIds).toArray()
        const bWordMap = Object.fromEntries(bWords.map(w => [w.id, w]))
        setBadgeWords(
          badgeCards.filter(c => bWordMap[c.wordId])
            .map(c => ({ card: c, word: bWordMap[c.wordId] }))
        )
      }

      setLoading(false)
    }
    load()
  }, [])

  const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

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
      <div className="max-w-[600px] mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center mb-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white mr-4 text-lg">
            ← 戻る
          </button>
          <h1 className="text-2xl font-bold">📊 学習記録</h1>
        </div>

        {/* ストリーク・ポイント */}
        {!statsLoading && (
          <div className="flex justify-around mb-8 p-5 bg-slate-800 rounded-2xl">
            <StreakBadge streak={stats.currentStreak} freezeCount={stats.freezeCount ?? 0} />
            <div className="w-px bg-slate-700" />
            <PointDisplay points={stats.totalPoints} clearCount={stats.challengeClearCount} />
          </div>
        )}

        {loading ? (
          <p className="text-slate-600 text-center py-10">読み込み中…</p>
        ) : (
          <>
            {/* 称号・バッジ：運用開始後に実装予定 */}

            {/* 直近7日のアクティビティ */}
            <section className="mb-8">
              <h2 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">直近7日間</h2>
              <div className="flex gap-2 justify-between">
                {weekActivity.map(({ date, active, cleared }) => (
                  <div key={dayKey(date)} className="flex flex-col items-center gap-1 flex-1">
                    <div
                      className={`w-full aspect-square rounded-lg flex items-center justify-center text-lg transition-colors ${
                        cleared ? 'bg-amber-500' :
                        active  ? 'bg-blue-600' :
                        'bg-slate-800'
                      }`}
                    >
                      {cleared ? '🔥' : active ? '✓' : ''}
                    </div>
                    <span className="text-slate-500 text-xs">
                      {DAY_LABELS[date.getDay()]}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-slate-600">
                <span><span className="inline-block w-2 h-2 rounded-sm bg-amber-500 mr-1" />クリアあり</span>
                <span><span className="inline-block w-2 h-2 rounded-sm bg-blue-600 mr-1" />学習あり</span>
              </div>
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
                      <span className="text-slate-600 text-sm w-5 text-right">{i + 1}</span>
                      <span className="flex-1 font-bold text-white text-sm truncate">{word.word}</span>
                      <span className="text-slate-400 text-sm truncate max-w-24">{word.meaning}</span>
                      <span className="text-red-400 text-sm font-bold tabular-nums">
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
                      <span className="text-slate-600 text-sm w-5 text-right">{i + 1}</span>
                      <span className="flex-1 font-bold text-white text-sm truncate">{word.word}</span>
                      <span className="text-slate-400 text-sm truncate max-w-24">{word.meaning}</span>
                      <span className="text-amber-400 text-sm font-bold tabular-nums">
                        {(card.studyCount ?? 0).toLocaleString()}回
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* バッジ獲得単語リスト */}
            <section className="mb-8">
              <h2 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">🎖 バッジ獲得単語</h2>
              {badgeWords.length === 0 ? (
                <p className="text-slate-600 text-sm">100回出会った単語がここに表示されます</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {badgeWords.map(({ card, word }, i) => (
                    <button
                      key={word.id}
                      onClick={() => handleSelectWord(word, badgeWords.map(e => e.word), i)}
                      className="w-full flex items-center gap-3 bg-slate-800 hover:bg-slate-700 rounded-xl px-4 py-3 text-left active:scale-95 transition-all"
                    >
                      <img src="/badge.png" alt="badge" style={{ width: 24, height: 24, flexShrink: 0 }} />
                      <span className="flex-1 font-bold text-white text-sm truncate">{word.word}</span>
                      <span className="text-slate-400 text-sm truncate max-w-24">{word.meaning}</span>
                      <span className="text-amber-400 text-sm font-bold tabular-nums">
                        {(card.studyCount ?? 0).toLocaleString()}回
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* 30問チャレンジ履歴 */}
            <section>
              <h2 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">30問チャレンジ履歴</h2>
              {challengeHistory.length === 0 ? (
                <p className="text-slate-600 text-sm">まだ挑戦記録がありません</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {challengeHistory.map(h => (
                    <div key={h.id} className="flex items-center gap-3 bg-slate-800 rounded-xl px-4 py-3">
                      <span className={`text-xl ${h.cleared ? '' : 'opacity-30'}`}>
                        {h.cleared ? '🏆' : '💀'}
                      </span>
                      <span className="flex-1">
                        <div className="text-sm font-bold">
                          {h.parts?.join(' + ') ?? '—'}
                        </div>
                        <div className="text-slate-500 text-xs">
                          {fmtDate(h.date)} {fmtTime(h.date)}
                        </div>
                      </span>
                      <span className={`text-sm font-bold tabular-nums ${h.cleared ? 'text-amber-400' : 'text-slate-600'}`}>
                        {h.result ?? 0} / 30
                      </span>
                    </div>
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
