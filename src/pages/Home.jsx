import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStats } from '../hooks/useUserStats'
import StreakBadge from '../components/StreakBadge'
import PointDisplay from '../components/PointDisplay'
import { db } from '../db/database'

export default function Home() {
  const navigate = useNavigate()
  const { stats, loading } = useUserStats()
  const [totalStudyCount, setTotalStudyCount] = useState(0)

  useEffect(() => {
    db.cards.toArray()
      .then(cards => {
        const total = cards.reduce((sum, c) => sum + (c.studyCount ?? 0), 0)
        setTotalStudyCount(total)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center px-4 py-10">
      {/* タイトル */}
      <div className="flex items-end gap-2 mb-1">
        <h1
          className="text-5xl font-extrabold tracking-tight"
          style={{ fontFamily: "'Space Grotesk', sans-serif", background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        >Vocaleap</h1>
        <span className="text-xs font-bold text-slate-600 mb-2 tracking-widest">
          v{/* global __APP_VERSION__ */}{__APP_VERSION__}
        </span>
      </div>
      <p className="text-slate-500 text-sm mb-10">英単語自学習アプリ</p>

      {/* ストリーク・ポイント */}
      <div className="flex gap-8 mb-6">
        {loading ? (
          <div className="text-slate-600 text-sm">読み込み中…</div>
        ) : (
          <>
            <StreakBadge streak={stats.currentStreak} />
            <PointDisplay
              points={stats.totalPoints}
              clearCount={stats.challengeClearCount}
            />
          </>
        )}
      </div>

      {/* 総出会い数 */}
      <div className="text-center mb-10">
        <div className="text-3xl font-black text-purple-400 tabular-nums">
          {totalStudyCount.toLocaleString()}
        </div>
        <div className="text-slate-500 text-xs mt-1">総出会い数</div>
      </div>

      {/* ナビゲーションボタン */}
      <div className="w-full max-w-sm flex flex-col gap-4">
        <NavButton
          onClick={() => navigate('/challenge')}
          color="bg-blue-600 hover:bg-blue-500"
          icon="📖"
          label="30問チャレンジ"
          sub="ノーミスで30問連続正解を目指せ"
        />
        <NavButton
          onClick={() => navigate('/daily')}
          color="bg-green-700 hover:bg-green-600"
          icon="⚡"
          label="10問デイリークイズ"
          sub="今日1回限り・4択・ポイント獲得"
        />
        <NavButton
          onClick={() => navigate('/warmup')}
          color="bg-amber-600 hover:bg-amber-500"
          icon="🎤"
          label="瞬間英作文"
          sub="授業ウォームアップ用"
        />
        <NavButton
          onClick={() => navigate('/stats')}
          color="bg-slate-700 hover:bg-slate-600"
          icon="📊"
          label="学習記録"
          sub="ストリーク・履歴・苦手単語"
        />
        <NavButton
          onClick={() => navigate('/settings')}
          color="bg-slate-700 hover:bg-slate-600"
          icon="⚙️"
          label="設定"
          sub="CSVインポート・データリセット"
        />
      </div>
    </div>
  )
}

function NavButton({ onClick, color, icon, label, sub }) {
  return (
    <button
      onClick={onClick}
      className={`w-full py-4 px-5 ${color} rounded-2xl transition-colors text-left flex items-center gap-4 active:scale-95`}
    >
      <span className="text-3xl">{icon}</span>
      <span>
        <div className="text-lg font-bold leading-tight">{label}</div>
        <div className="text-sm opacity-70 leading-tight mt-0.5">{sub}</div>
      </span>
    </button>
  )
}
