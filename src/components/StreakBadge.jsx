// 連続学習日数の炎バッジ
// 1〜6日  : 青白い小さな炎
// 7〜29日 : オレンジの炎
// 30〜99日: 赤い大きな炎
// 100日〜 : 金色の炎 + パルスアニメーション

function flameStyle(streak) {
  if (streak >= 100) {
    return {
      emoji: '🔥',
      color: 'text-yellow-400',
      glow: 'drop-shadow(0 0 12px #facc15)',
      pulse: true,
      size: 'text-6xl',
    }
  }
  if (streak >= 30) {
    return {
      emoji: '🔥',
      color: 'text-red-500',
      glow: 'drop-shadow(0 0 8px #ef4444)',
      pulse: false,
      size: 'text-5xl',
    }
  }
  if (streak >= 7) {
    return {
      emoji: '🔥',
      color: 'text-orange-400',
      glow: 'drop-shadow(0 0 6px #fb923c)',
      pulse: false,
      size: 'text-4xl',
    }
  }
  // 1〜6日（または0日）
  return {
    emoji: '🔥',
    color: 'text-blue-300',
    glow: 'drop-shadow(0 0 4px #93c5fd)',
    pulse: false,
    size: 'text-3xl',
  }
}

export default function StreakBadge({ streak = 0 }) {
  const style = flameStyle(streak)

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`${style.size} ${style.color} ${style.pulse ? 'animate-pulse' : ''} leading-none`}
        style={{ filter: streak > 0 ? style.glow : 'none' }}
      >
        {style.emoji}
      </div>
      <div className="text-3xl font-black tabular-nums leading-none">
        {streak}
      </div>
      <div className="text-slate-400 text-xs">連続学習日</div>
    </div>
  )
}
