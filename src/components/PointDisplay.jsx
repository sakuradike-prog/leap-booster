function CoinSvg({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      {/* 影（右下） */}
      <ellipse cx="21" cy="21" rx="17" ry="17" fill="#78350F" opacity="0.35"/>
      {/* 外枠（暗めの金） */}
      <circle cx="20" cy="20" r="18" fill="#B45309"/>
      {/* メイン金色 */}
      <circle cx="20" cy="20" r="16" fill="#F59E0B"/>
      {/* 内側フェイス（やや暗め） */}
      <circle cx="20" cy="20" r="12" fill="#D97706"/>
      {/* 中央縦ストライプ（Iビーム） */}
      <rect x="16.5" y="8" width="7" height="24" rx="3.5" fill="#92400E"/>
      {/* ストライプ左の光沢 */}
      <rect x="16.5" y="8" width="2.5" height="24" rx="1.25" fill="#FCD34D" opacity="0.45"/>
      {/* 左上ハイライト */}
      <ellipse cx="12" cy="13" rx="4" ry="5.5" fill="#FEF3C7" opacity="0.55" transform="rotate(-20 12 13)"/>
    </svg>
  )
}

export default function PointDisplay({ points = 0, clearCount = 0 }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="leading-none"><CoinSvg size={34} /></div>
      <div className="text-3xl font-black tabular-nums leading-none text-amber-400">
        {points.toLocaleString()}
      </div>
      <div className="text-slate-400 text-xs">累計ポイント</div>
      {clearCount > 0 && (
        <div className="mt-1 text-xs text-slate-500">
          クリア {clearCount}回
        </div>
      )}
    </div>
  )
}
