import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { fetchRankings, fetchClearTimeRankings } from '../utils/supabaseSync'

const TABS = [
  { key: 'total_points',          label: 'ポイント',    unit: 'pt', emoji: '🏆' },
  { key: 'current_streak',        label: 'ストリーク',  unit: '日', emoji: '🔥' },
  { key: 'challenge_clear_count', label: 'チャレンジ',  unit: '回', emoji: '⚡' },
  { key: 'clear_time',            label: 'タイム',      unit: '秒', emoji: '⏱' },
]

function medalEmoji(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return null
}

export default function Rankings() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [tab, setTab] = useState(0)
  const [rows, setRows] = useState([])
  const [clearTimeRows, setClearTimeRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    setLoading(true)
    setError(null)
    Promise.all([
      fetchRankings(),
      fetchClearTimeRankings(),
    ])
      .then(([rankData, clearData]) => {
        setRows(rankData)
        setClearTimeRows(clearData)
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [user, authLoading])

  const currentTab = TABS[tab]

  // 現在のタブでソート（0より大きい値のみ表示）、タイムタブは別処理
  const sorted = tab === 3
    ? clearTimeRows
    : [...rows]
        .filter(r => (r[currentTab.key] ?? 0) > 0)
        .sort((a, b) => b[currentTab.key] - a[currentTab.key])

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[600px] mx-auto px-5 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm active:opacity-60">← 戻る</button>
          <h1 className="text-lg font-bold">🏆 ランキング</h1>
        </div>
      </div>
      <div className="max-w-[600px] mx-auto px-4 py-6">

        {/* 未ログイン */}
        {!authLoading && !user && (
          <div className="p-8 bg-slate-800 rounded-2xl text-center">
            <div className="text-4xl mb-4">🔐</div>
            <p className="text-slate-300 mb-2 font-bold">ログインが必要です</p>
            <p className="text-slate-500 text-sm mb-6">
              ランキングはGoogleアカウントでログインすると閲覧できます
            </p>
            <button
              onClick={() => navigate('/settings')}
              className="py-3 px-6 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-colors"
            >
              設定画面でログイン
            </button>
          </div>
        )}

        {/* ログイン済み */}
        {user && (
          <>
            {/* タブ */}
            <div className="flex gap-2 mb-6">
              {TABS.map((t, i) => (
                <button
                  key={t.key}
                  onClick={() => setTab(i)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                    tab === i
                      ? 'bg-yellow-500 text-black'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>

            {/* ローディング */}
            {loading && (
              <div className="text-center py-16 text-slate-400">読み込み中…</div>
            )}

            {/* エラー */}
            {!loading && error && (
              <div className="text-center py-16 text-red-400">
                <p>データの取得に失敗しました</p>
                <p className="text-xs mt-2 text-red-600">{error}</p>
              </div>
            )}

            {/* データなし */}
            {!loading && !error && sorted.length === 0 && (
              <div className="text-center py-16 text-slate-500">
                <div className="text-4xl mb-4">📊</div>
                <p>まだデータがありません</p>
                <p className="text-xs mt-2">学習を始めるとランキングに表示されます</p>
              </div>
            )}

            {/* タイムランキングのセクションタイトル */}
            {tab === 3 && !loading && !error && (
              <p className="text-slate-500 text-xs text-center mb-4">30問チャレンジクリアタイムランキング</p>
            )}

            {/* ランキングリスト */}
            {!loading && !error && sorted.length > 0 && (
              <div className="flex flex-col gap-2">
                {tab === 3 ? (
                  sorted.map((row, idx) => {
                    const rank = idx + 1
                    const isMe = row.user_id === user.id
                    const name = row.display_name || '名無し'
                    const m = medalEmoji(rank)
                    const dateStr = row.date
                      ? (() => { const d = new Date(row.date); return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}` })()
                      : null

                    return (
                      <div
                        key={row.user_id}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                          isMe
                            ? 'bg-yellow-900/40 border-yellow-500/60'
                            : rank <= 3
                            ? 'bg-slate-800 border-slate-600'
                            : 'bg-slate-800/60 border-slate-700/60'
                        }`}
                      >
                        {/* 順位 */}
                        <div className="w-8 text-center flex-shrink-0">
                          {m ? (
                            <span className="text-xl leading-none">{m}</span>
                          ) : (
                            <span className="text-slate-500 font-bold text-sm tabular-nums">
                              {rank}
                            </span>
                          )}
                        </div>

                        {/* ニックネーム */}
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold truncate ${isMe ? 'text-yellow-300' : 'text-white'}`}>
                            {name}
                            {isMe && (
                              <span className="ml-1.5 text-xs text-yellow-600 font-normal">
                                （自分）
                              </span>
                            )}
                          </div>
                          {dateStr && (
                            <div className="text-xs text-slate-500">{dateStr}</div>
                          )}
                        </div>

                        {/* タイム */}
                        <div className="flex-shrink-0 text-right">
                          <span
                            className={`font-black tabular-nums ${isMe ? 'text-yellow-300' : 'text-white'}`}
                            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22 }}
                          >
                            {row.total_time}
                          </span>
                          <span className="text-xs text-slate-500 ml-0.5">秒</span>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  sorted.map((row, idx) => {
                    const rank = idx + 1
                    const isMe = row.user_id === user.id
                    const name = row.display_name || '名無し'
                    const value = row[currentTab.key] ?? 0
                    const m = medalEmoji(rank)

                    return (
                      <div
                        key={row.user_id}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                          isMe
                            ? 'bg-yellow-900/40 border-yellow-500/60'
                            : rank <= 3
                            ? 'bg-slate-800 border-slate-600'
                            : 'bg-slate-800/60 border-slate-700/60'
                        }`}
                      >
                        {/* 順位 */}
                        <div className="w-8 text-center flex-shrink-0">
                          {m ? (
                            <span className="text-xl leading-none">{m}</span>
                          ) : (
                            <span className="text-slate-500 font-bold text-sm tabular-nums">
                              {rank}
                            </span>
                          )}
                        </div>

                        {/* ニックネーム */}
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold truncate ${isMe ? 'text-yellow-300' : 'text-white'}`}>
                            {name}
                            {isMe && (
                              <span className="ml-1.5 text-xs text-yellow-600 font-normal">
                                （自分）
                              </span>
                            )}
                          </div>
                        </div>

                        {/* スコア */}
                        <div className="flex-shrink-0 text-right">
                          <span
                            className={`font-black tabular-nums ${isMe ? 'text-yellow-300' : 'text-white'}`}
                            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22 }}
                          >
                            {value.toLocaleString()}
                          </span>
                          <span className="text-xs text-slate-500 ml-0.5">
                            {currentTab.unit}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}

          </>
        )}
      </div>
    </div>
  )
}
