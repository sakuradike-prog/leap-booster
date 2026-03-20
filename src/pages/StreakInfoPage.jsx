import { useNavigate } from 'react-router-dom'
import { useUserStats } from '../hooks/useUserStats'

export default function StreakInfoPage() {
  const navigate = useNavigate()
  const { stats } = useUserStats()

  const streak = stats?.currentStreak ?? 0
  const longest = stats?.longestStreak ?? 0

  const flameCount = streak >= 100 ? 4 : streak >= 50 ? 3 : streak >= 10 ? 2 : 1
  const flames = Array.from({ length: flameCount }, (_, i) => (
    <span key={i} style={{ fontSize: 28 }}>🔥</span>
  ))

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col px-5 py-6">
      <button
        onClick={() => navigate(-1)}
        className="text-slate-400 hover:text-white text-sm mb-6 text-left"
      >
        ← 戻る
      </button>

      <h1 className="text-2xl font-black mb-6">🔥 STREAK</h1>

      {/* 現在のストリーク */}
      <div className="flex flex-col items-center py-8 bg-slate-900 rounded-2xl border border-slate-800 mb-4">
        <div className="flex gap-1 mb-1">{flames}</div>
        <div
          className="tabular-nums"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 80, color: '#fff', lineHeight: 1 }}
        >
          {streak}
        </div>
        <div className="text-slate-400 text-sm mt-1">現在のストリーク</div>
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
  )
}
