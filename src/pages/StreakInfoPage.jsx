import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { useUserStats } from '../hooks/useUserStats'

function dayKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export default function StreakInfoPage() {
  const navigate = useNavigate()
  const { stats } = useUserStats()
  const [weekActivity, setWeekActivity] = useState([])

  const streak = stats?.currentStreak ?? 0
  const longest = stats?.longestStreak ?? 0

  const flameCount = streak >= 100 ? 4 : streak >= 50 ? 3 : streak >= 10 ? 2 : 1
  const flames = Array.from({ length: flameCount }, (_, i) => (
    <span key={i} style={{ fontSize: 28 }}>🔥</span>
  ))

  useEffect(() => {
    async function loadWeekActivity() {
      const today = new Date()
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today)
        d.setDate(today.getDate() - (6 - i))
        return d
      })

      const since = new Date(days[0])
      since.setHours(0, 0, 0, 0)
      const sinceTime = since.getTime()

      const [allChLogs, allDqLogs, allWuLogs, allCaptures] = await Promise.all([
        db.challengeHistory.toArray(),
        db.dailyQuizHistory.toArray(),
        db.warmupHistory.toArray(),
        db.captured_words.toArray(),
      ])

      const chLogs  = allChLogs.filter(r => new Date(r.date).getTime() >= sinceTime)
      const dqLogs  = allDqLogs.filter(r => new Date(r.date).getTime() >= sinceTime)
      const wuLogs  = allWuLogs.filter(r => new Date(r.date).getTime() >= sinceTime)
      const capLogs = allCaptures.filter(r => r.capturedAt && new Date(r.capturedAt).getTime() >= sinceTime)

      const practiceKeys  = new Set(dqLogs.map(r => dayKey(r.date)))
      const challengeKeys = new Set(chLogs.map(r => dayKey(r.date)))
      const warmupKeys    = new Set(wuLogs.map(r => dayKey(r.date)))
      const captureKeys   = new Set(capLogs.map(r => dayKey(r.capturedAt)))
      const clearKeys     = new Set(chLogs.filter(r => r.cleared).map(r => dayKey(r.date)))

      setWeekActivity(days.map(d => ({
        date: d,
        practice:  practiceKeys.has(dayKey(d)),
        challenge: challengeKeys.has(dayKey(d)),
        cleared:   clearKeys.has(dayKey(d)),
        warmup:    warmupKeys.has(dayKey(d)),
        capture:   captureKeys.has(dayKey(d)),
        active: practiceKeys.has(dayKey(d)) || challengeKeys.has(dayKey(d)) ||
                warmupKeys.has(dayKey(d))   || captureKeys.has(dayKey(d)),
      })))
    }
    loadWeekActivity()
    window.addEventListener('vocaleap:synced', loadWeekActivity)
    return () => window.removeEventListener('vocaleap:synced', loadWeekActivity)
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[600px] mx-auto px-5 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white text-sm active:opacity-60">← 戻る</button>
          <h1 className="text-lg font-bold">🔥 STREAK</h1>
        </div>
      </div>
      <div className="max-w-[600px] mx-auto w-full flex flex-col px-5 py-6">

        {/* 現在のストリーク */}
        <div className="flex flex-col items-center py-8 bg-slate-900 rounded-2xl border border-slate-800 mb-4">
          <div className="flex gap-1 mb-1">{flames}</div>
          <div
            className="tabular-nums"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 80, color: '#fff', lineHeight: 1 }}
          >
            {streak}
          </div>
          <div className="text-white font-bold text-lg mt-1">{streak}日連続！</div>
          <div className="text-slate-400 text-sm mt-0.5">現在のストリーク</div>
        </div>

        <div className="flex gap-3 mb-6">
          <div className="flex-1 flex flex-col items-center py-4 bg-slate-900 rounded-xl border border-slate-800">
            <div
              className="tabular-nums"
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: '#f59e0b', lineHeight: 1 }}
            >
              {longest}
            </div>
            <div className="text-slate-400 text-xs mt-1">過去最高</div>
          </div>
          <div className="flex-1 flex flex-col items-center py-4 bg-slate-900 rounded-xl border border-slate-800">
            <div
              className="tabular-nums"
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: '#22d3ee', lineHeight: 1 }}
            >
              {stats?.freezeCount ?? 0}
            </div>
            <div className="text-slate-400 text-xs mt-1">フリーズ残数</div>
          </div>
        </div>

        {/* 直近7日間のアクティビティ */}
        {weekActivity.length > 0 && (
          <section className="mb-6">
            <h2 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">直近7日間</h2>
            <div className="flex gap-1.5 justify-between">
              {weekActivity.map(({ date, active, practice, challenge, cleared, warmup, capture }) => (
                <div key={dayKey(date)} className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-full rounded-lg p-1.5 transition-colors ${active ? 'bg-slate-800' : 'bg-slate-900/60'}`}>
                    <div className="grid grid-cols-2 gap-0.5">
                      <span className={`text-center text-xs leading-tight transition-opacity ${practice  ? 'opacity-100' : 'opacity-15'}`} title="4択練習">⚡</span>
                      <span className={`text-center text-xs leading-tight transition-opacity ${challenge ? (cleared ? 'opacity-100' : 'opacity-70') : 'opacity-15'}`} title="30問チャレンジ">🔥</span>
                      <span className={`text-center text-xs leading-tight transition-opacity ${warmup   ? 'opacity-100' : 'opacity-15'}`} title="瞬間英作文">✏️</span>
                      <span className={`text-center text-xs leading-tight transition-opacity ${capture  ? 'opacity-100' : 'opacity-15'}`} title="単語捕獲">📷</span>
                    </div>
                  </div>
                  <span className={`text-xs ${active ? 'text-slate-300' : 'text-slate-600'}`}>
                    {DAY_LABELS[date.getDay()]}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-slate-500">
              <span>⚡ 4択練習</span>
              <span>🔥 30問チャレンジ</span>
              <span>✏️ 瞬間英作文</span>
              <span>📷 単語捕獲</span>
            </div>
          </section>
        )}

        {/* ルール説明 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-5 text-sm">
          <h2 className="font-bold text-slate-200 mb-4 text-base">ストリークのルール</h2>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <span className="text-slate-500 text-lg">▶</span>
              <div>
                <div className="text-slate-200 font-medium">毎日学習するとストリークが伸びる</div>
                <div className="text-slate-500 text-xs mt-0.5">30問チャレンジ・4択練習・瞬間英作文のいずれかを行う</div>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-slate-500 text-lg">▶</span>
              <div>
                <div className="text-slate-200 font-medium">1日でも空くとストリークがリセット</div>
                <div className="text-slate-500 text-xs mt-0.5">フリーズを持っていれば1回穴を防げる</div>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-slate-500 text-lg">▶</span>
              <div>
                <div className="text-slate-200 font-medium">7日連続でフリーズ1個獲得（最大2個）</div>
                <div className="text-slate-500 text-xs mt-0.5">フリーズはストリークが切れそうなときのお守り</div>
              </div>
            </div>
            <div className="mt-1 pt-3 border-t border-slate-800">
              <div className="text-slate-400 text-xs mb-1.5 font-bold">炎が増えるマイルストーン</div>
              <div className="flex flex-col gap-1 text-xs text-slate-500">
                <div>🔥 1日〜9日</div>
                <div>🔥🔥 10日〜49日</div>
                <div>🔥🔥🔥 50日〜99日</div>
                <div>🔥🔥🔥🔥 100日〜</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
