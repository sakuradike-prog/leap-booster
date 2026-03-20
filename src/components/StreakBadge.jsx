// 連続学習日数の炎バッジ
// 1〜6日  : 青白い小さな炎
// 7〜29日 : オレンジの炎
// 30〜99日: 赤い大きな炎
// 100日〜 : 金色の炎 + パルスアニメーション
//
// 炎の数:
//  0〜9日  : 🔥
//  10〜49日: 🔥🔥
//  50〜99日: 🔥🔥🔥
//  100日〜 : 🔥🔥🔥🔥

function flameStyle(streak) {
  if (streak >= 100) {
    return {
      color: 'text-yellow-400',
      glow: 'drop-shadow(0 0 12px #facc15)',
      pulse: true,
      size: 'text-3xl',
    }
  }
  if (streak >= 30) {
    return {
      color: 'text-red-500',
      glow: 'drop-shadow(0 0 8px #ef4444)',
      pulse: false,
      size: 'text-3xl',
    }
  }
  if (streak >= 7) {
    return {
      color: 'text-orange-400',
      glow: 'drop-shadow(0 0 6px #fb923c)',
      pulse: false,
      size: 'text-3xl',
    }
  }
  return {
    color: 'text-blue-300',
    glow: 'drop-shadow(0 0 4px #93c5fd)',
    pulse: false,
    size: 'text-3xl',
  }
}

function flameCount(streak) {
  if (streak >= 100) return 4
  if (streak >= 50)  return 3
  if (streak >= 10)  return 2
  return 1
}

export default function StreakBadge({ streak = 0, freezeCount = 0 }) {
  const style = flameStyle(streak)
  const count = flameCount(streak)

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex gap-0.5 ${style.size} ${style.color} ${style.pulse ? 'animate-pulse' : ''} leading-none`}
        style={{ filter: streak > 0 ? style.glow : 'none' }}
      >
        {Array.from({ length: count }).map((_, i) => (
          <span key={i}>🔥</span>
        ))}
      </div>
      <div className="text-3xl font-black tabular-nums leading-none">
        {streak}
      </div>
      <div className="text-slate-400 text-xs">連続学習日</div>
      {/* フリーズストック表示 */}
      <div className="mt-1 flex gap-1">
        {[0, 1].map(i => (
          <span
            key={i}
            className={`text-sm ${i < freezeCount ? 'opacity-100' : 'opacity-20'}`}
          >
            ❄️
          </span>
        ))}
      </div>
    </div>
  )
}
