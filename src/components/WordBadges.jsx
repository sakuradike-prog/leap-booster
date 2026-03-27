/**
 * WordBadges - 単語に付くバッジ群（インライン・アイコンのみ）
 *
 * Props:
 *   isCaptured  - 捕獲済みバッジを表示するか（🎯）
 *   isChecked   - チェック済みバッジを表示するか（✓）
 */
export default function WordBadges({ isCaptured, isChecked }) {
  if (!isCaptured && !isChecked) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      {isCaptured && (
        <span style={{
          fontSize: 13,
          lineHeight: 1,
          filter: 'drop-shadow(0 0 3px rgba(6,182,212,0.6))',
        }} title="捕獲済み">
          🎯
        </span>
      )}
      {isChecked && (
        <span style={{
          fontSize: 12,
          lineHeight: 1,
          width: 18,
          height: 18,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          background: 'rgba(251,191,36,0.2)',
          color: '#fbbf24',
          border: '1px solid rgba(251,191,36,0.5)',
          fontWeight: 700,
          filter: 'drop-shadow(0 0 3px rgba(251,191,36,0.5))',
        }} title="チェック済み">
          ✓
        </span>
      )}
    </div>
  )
}
