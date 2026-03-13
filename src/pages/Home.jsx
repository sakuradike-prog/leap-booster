import { useNavigate } from 'react-router-dom'
import { useUserStats } from '../hooks/useUserStats'
import StreakBadge from '../components/StreakBadge'
import PointDisplay from '../components/PointDisplay'

export default function Home() {
  const navigate = useNavigate()
  const { stats, loading } = useUserStats()

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center px-4 py-10">
      {/* タイトル */}
      <h1
        className="text-5xl font-extrabold tracking-tight mb-1"
        style={{ fontFamily: "'Space Grotesk', sans-serif", background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
      >Vocaleap</h1>
      <p className="text-slate-500 text-sm mb-10">英単語自学習アプリ</p>

      {/* ストリーク・ポイント */}
      <div className="flex gap-12 mb-12">
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
