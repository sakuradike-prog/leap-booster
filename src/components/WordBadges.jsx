/**
 * WordBadges - 単語に付くバッジ群
 *
 * Props:
 *   isCaptured  - 捕獲済みバッジを表示するか
 *
 * 将来バッジを追加する場合はここにプロパティと JSX を追記するだけ。
 */
export default function WordBadges({ isCaptured }) {
  if (!isCaptured) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
      justifyContent: 'center',
      marginTop: 6,
    }}>
      {isCaptured && (
        <span style={{
          fontSize: 11,
          padding: '2px 7px',
          borderRadius: 5,
          background: 'rgba(6,182,212,0.15)',
          color: '#22d3ee',
          border: '1px solid rgba(6,182,212,0.35)',
          fontWeight: 700,
          letterSpacing: '.02em',
          filter: 'drop-shadow(0 0 4px rgba(6,182,212,0.4))',
          whiteSpace: 'nowrap',
        }}>
          🎯 捕獲済
        </span>
      )}
    </div>
  )
}
