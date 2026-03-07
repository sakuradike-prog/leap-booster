export default function PointDisplay({ points = 0, clearCount = 0 }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-3xl leading-none">⭐</div>
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
