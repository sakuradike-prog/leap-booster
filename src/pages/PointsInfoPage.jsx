import { useNavigate } from 'react-router-dom'
import { useUserStats } from '../hooks/useUserStats'

function CoinSvg({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <ellipse cx="21" cy="21" rx="17" ry="17" fill="#713F12" opacity="0.35"/>
      <circle cx="20" cy="20" r="18" fill="#A16207"/>
      <circle cx="20" cy="20" r="16" fill="#EAB308"/>
      <circle cx="20" cy="20" r="12" fill="#FBBF24"/>
      <rect x="16.5" y="8" width="7" height="24" rx="3.5" fill="#713F12"/>
      <rect x="16.5" y="8" width="2.5" height="24" rx="1.25" fill="#FEF08A" opacity="0.5"/>
      <ellipse cx="12" cy="13" rx="4" ry="5.5" fill="#FEFCE8" opacity="0.6" transform="rotate(-20 12 13)"/>
    </svg>
  )
}

export default function PointsInfoPage() {
  const navigate = useNavigate()
  const { stats } = useUserStats()

  const total = stats?.totalPoints ?? 0
  const todayPts = (() => {
    const d = stats?.todayPointsDate
    if (!d) return 0
    const pd = new Date(d)
    const now = new Date()
    if (pd.getFullYear() === now.getFullYear() &&
        pd.getMonth() === now.getMonth() &&
        pd.getDate() === now.getDate()) {
      return stats.todayPoints ?? 0
    }
    return 0
  })()

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[600px] mx-auto px-5 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white text-sm active:opacity-60">← 戻る</button>
          <h1 className="text-lg font-bold">🪙 POINTS</h1>
        </div>
      </div>
    <div className="max-w-[600px] mx-auto w-full flex flex-col px-5 py-6">

      {/* ポイント表示 */}
      <div className="flex flex-col items-center py-8 bg-slate-900 rounded-2xl border border-slate-800 mb-4">
        <CoinSvg size={44} />
        <div
          className="tabular-nums mt-2"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 72, color: '#f59e0b', lineHeight: 1 }}
        >
          {total.toLocaleString()}
        </div>
        <div className="text-slate-400 text-sm mt-1">累計獲得ポイント</div>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="flex-1 flex flex-col items-center py-4 bg-slate-900 rounded-xl border border-slate-800">
          <div
            className="tabular-nums"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: '#22d3ee', lineHeight: 1 }}
          >
            +{todayPts}
          </div>
          <div className="text-slate-400 text-xs mt-1">本日の獲得</div>
        </div>
        <div className="flex-1 flex flex-col items-center py-4 bg-slate-900 rounded-xl border border-slate-800">
          <div
            className="tabular-nums"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: '#f59e0b', lineHeight: 1 }}
          >
            {total.toLocaleString()}
          </div>
          <div className="text-slate-400 text-xs mt-1">累計</div>
        </div>
      </div>

      {/* Daily Quiz ルール */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-5 text-sm mb-4">
        <h2 className="font-bold text-slate-200 mb-4 text-base">💡 Daily Quiz のポイント獲得ルール</h2>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between py-2 border-b border-slate-800">
            <div>
              <div className="text-slate-200 font-medium">4択練習（初回クリア）</div>
              <div className="text-slate-500 text-xs mt-0.5">1日1回・セッション終了時に獲得</div>
            </div>
            <div className="text-yellow-400 font-black text-lg">+1pt</div>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-slate-800">
            <div>
              <div className="text-slate-200 font-medium">スペル入力（初回クリア）</div>
              <div className="text-slate-500 text-xs mt-0.5">1日1回・セッション終了時に獲得</div>
            </div>
            <div className="text-yellow-400 font-black text-lg">+1pt</div>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-slate-800">
            <div>
              <div className="text-slate-400 font-medium">仕分け練習（初回クリア）</div>
              <div className="text-slate-500 text-xs mt-0.5">近日公開</div>
            </div>
            <div className="text-slate-600 font-black text-lg">+1pt</div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-green-300 font-medium">全練習コンプリートボーナス</div>
              <div className="text-slate-500 text-xs mt-0.5">3種類すべてを1日1回ずつこなす</div>
            </div>
            <div className="text-green-400 font-black text-lg">+10pt</div>
          </div>
        </div>
        <div className="mt-4 px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-xs text-slate-500">
          <span className="text-slate-400 font-bold">最大ポイント例（1日）</span><br />
          4択 + スペル + 仕分け + ボーナス = 1+1+1+10 = <span className="text-yellow-400 font-bold">13pt</span>
        </div>
      </div>

      {/* 30問チャレンジ ルール */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-5 text-sm">
        <h2 className="font-bold text-slate-200 mb-4 text-base">⚡ 30問チャレンジのポイント獲得ルール</h2>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between py-2 border-b border-slate-800">
            <div>
              <div className="text-slate-200 font-medium">通常単語 1問正解</div>
              <div className="text-slate-500 text-xs mt-0.5">チャレンジで正解した通常の単語</div>
            </div>
            <div className="text-blue-400 font-black text-lg">+1pt</div>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-slate-800">
            <div>
              <div className="text-cyan-300 font-medium">捕獲済み単語 1問正解</div>
              <div className="text-slate-500 text-xs mt-0.5">他の教材で見かけて捕獲済みにした単語</div>
            </div>
            <div className="text-cyan-400 font-black text-lg">+2pt</div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-purple-300 font-medium">αあり 全問クリアボーナス</div>
              <div className="text-slate-500 text-xs mt-0.5">αを含めてチャレンジし30問全問正解</div>
            </div>
            <div className="text-purple-400 font-black text-lg">+15pt</div>
          </div>
        </div>
        <div className="mt-4 px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-xs text-slate-500">
          <span className="text-slate-400 font-bold">最大ポイント例（1回）</span><br />
          αあり・全問正解・全問捕獲済みの場合: 30×2 + 15 = <span className="text-amber-400 font-bold">75pt</span>
        </div>
      </div>
    </div>
    </div>
  )
}
