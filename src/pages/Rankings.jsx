import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { fetchRankings, fetchClearTimeRankings, fetchCaptureRankings, fetchWeekPointsRankings, fetchConsecutiveRankings } from '../utils/supabaseSync'

const TABS = [
  { key: 'total_points',          label: 'ポイント',    unit: 'pt', emoji: '🏆' },
  { key: 'current_streak',        label: 'ストリーク',  unit: '日', emoji: '🔥' },
  { key: 'challenge_clear_count', label: '30問クリアー', unit: '回', emoji: '⚡' },
  { key: 'clear_time',            label: 'タイム',      unit: '秒', emoji: '⏱' },
  { key: 'capture',               label: '捕獲',        unit: '語', emoji: '🎯' },
  { key: 'week_points',           label: '今週',        unit: 'pt', emoji: '📅' },
  { key: 'consecutive',           label: '連続',        unit: '問', emoji: '🏃' },
]

function getWeekRange() {
  const mon = new Date()
  const day = mon.getDay()
  mon.setDate(mon.getDate() + (day === 0 ? -6 : 1 - day))
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(sun.getDate() + 6)
  const fmt = d => `${d.getMonth()+1}月${d.getDate()}日`
  return `集計期間：${fmt(mon)}(月)〜${fmt(sun)}(日)`
}

function medalEmoji(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return null
}

const TAB_ORDER_KEY = 'vocaleap_rankings_tab_order'

function loadTabOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.filter(k => TABS.some(t => t.key === k)) : []
  } catch { return [] }
}

function saveTabOrder(order) {
  try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(order)) } catch {}
}

/** ソート済み配列に同数同順位を付与（1,1,3,3,5...） */
function addRanks(sortedRows, getValue) {
  let rank = 1
  return sortedRows.map((row, idx) => {
    if (idx > 0 && getValue(sortedRows[idx - 1]) !== getValue(row)) rank = idx + 1
    return { ...row, _rank: rank }
  })
}

export default function Rankings() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()

  const [tabOrder, setTabOrder] = useState(loadTabOrder)
  const [tabKey, setTabKey] = useState(() => {
    const order = loadTabOrder()
    return order[0] ?? TABS[0].key
  })
  const [rows, setRows] = useState([])
  const [clearTimeRows, setClearTimeRows] = useState([])
  const [captureRows, setCaptureRows] = useState([])
  const [weekPointsRows, setWeekPointsRows] = useState([])
  const [consecutiveRows, setConsecutiveRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // タブを最近見た順に並べ替え（未訪問は末尾に元の順序で）
  const orderedTabs = [
    ...tabOrder.map(k => TABS.find(t => t.key === k)).filter(Boolean),
    ...TABS.filter(t => !tabOrder.includes(t.key)),
  ]

  function fetchAll() {
    if (!user) { setLoading(false); return }
    setLoading(true)
    setError(null)
    Promise.all([
      fetchRankings(),
      fetchClearTimeRankings(),
      fetchCaptureRankings(),
      fetchWeekPointsRankings(),
      fetchConsecutiveRankings(),
    ])
      .then(([rankData, clearData, captureData, weekData, consecutiveData]) => {
        setRows(rankData)
        setClearTimeRows(clearData)
        setCaptureRows(captureData)
        setWeekPointsRows(weekData)
        setConsecutiveRows(consecutiveData)
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }

  useEffect(() => {
    if (authLoading) return
    fetchAll()
  }, [user, authLoading]) // eslint-disable-line

  function handleTabChange(key) {
    setTabKey(key)
    const next = [key, ...tabOrder.filter(k => k !== key)]
    setTabOrder(next)
    saveTabOrder(next)
  }

  const currentTab = TABS.find(t => t.key === tabKey) ?? TABS[0]

  // 現在のタブでソート（0より大きい値のみ表示）、特殊タブは別処理
  const sorted = tabKey === 'clear_time'
    ? addRanks(clearTimeRows, r => r.total_time)
    : tabKey === 'capture'
    ? addRanks(captureRows, r => r.capture_count)
    : tabKey === 'week_points'
    ? addRanks(weekPointsRows, r => r.week_points)
    : tabKey === 'consecutive'
    ? addRanks(consecutiveRows, r => r.consecutive_correct ?? 0)
    : addRanks(
        [...rows]
          .filter(r => (r[currentTab.key] ?? 0) > 0)
          .sort((a, b) => b[currentTab.key] - a[currentTab.key]),
        r => r[currentTab.key]
      )

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[600px] mx-auto px-5 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm active:opacity-60">← 戻る</button>
          <h1 className="text-lg font-bold flex-1">🏆 ランキング</h1>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="text-slate-400 hover:text-white text-sm active:opacity-60 disabled:opacity-40"
          >
            {loading ? '更新中…' : '🔄 更新'}
          </button>
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
            {/* タブ（横スクロール対応） */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
              {orderedTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => handleTabChange(t.key)}
                  className={`flex-shrink-0 py-2.5 px-3 rounded-xl text-sm font-bold transition-colors ${
                    tabKey === t.key
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

            {/* セクションタイトル */}
            {tabKey === 'clear_time' && !loading && !error && (
              <p className="text-slate-500 text-xs text-center mb-4">30問チャレンジクリアタイムランキング</p>
            )}
            {tabKey === 'capture' && !loading && !error && (
              <p className="text-slate-500 text-xs text-center mb-4">捕獲単語数ランキング</p>
            )}
            {tabKey === 'week_points' && !loading && !error && (
              <div className="text-center mb-4">
                <p className="text-slate-500 text-xs">今週の獲得ポイントランキング</p>
                <p className="text-slate-600 text-xs mt-1">{getWeekRange()}</p>
              </div>
            )}
            {tabKey === 'consecutive' && !loading && !error && (
              <p className="text-slate-500 text-xs text-center mb-4">連続正解数ランキング</p>
            )}

            {/* ランキングリスト */}
            {!loading && !error && sorted.length > 0 && (
              <div className="flex flex-col gap-2">
                {tabKey === 'capture' ? (
                  sorted.map((row) => {
                    const rank = row._rank
                    const isMe = row.user_id === user.id
                    const name = row.display_name || '名無し'
                    const m = medalEmoji(rank)
                    return (
                      <div
                        key={row.user_id}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                          isMe ? 'bg-yellow-900/40 border-yellow-500/60' : rank <= 3 ? 'bg-slate-800 border-slate-600' : 'bg-slate-800/60 border-slate-700/60'
                        }`}
                      >
                        <div className="w-8 text-center flex-shrink-0">
                          {m ? <span className="text-xl leading-none">{m}</span> : <span className="text-slate-500 font-bold text-sm tabular-nums">{rank}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold truncate ${isMe ? 'text-yellow-300' : 'text-white'}`}>
                            {name}{isMe && <span className="ml-1.5 text-xs text-yellow-600 font-normal">（自分）</span>}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <span className={`font-black tabular-nums ${isMe ? 'text-yellow-300' : 'text-white'}`} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22 }}>{row.capture_count.toLocaleString()}</span>
                          <span className="text-xs text-slate-500 ml-0.5">語</span>
                        </div>
                      </div>
                    )
                  })
                ) : tabKey === 'week_points' ? (
                  sorted.map((row) => {
                    const rank = row._rank
                    const isMe = row.user_id === user.id
                    const name = row.display_name || '名無し'
                    const m = medalEmoji(rank)
                    return (
                      <div
                        key={row.user_id}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                          isMe ? 'bg-yellow-900/40 border-yellow-500/60' : rank <= 3 ? 'bg-slate-800 border-slate-600' : 'bg-slate-800/60 border-slate-700/60'
                        }`}
                      >
                        <div className="w-8 text-center flex-shrink-0">
                          {m ? <span className="text-xl leading-none">{m}</span> : <span className="text-slate-500 font-bold text-sm tabular-nums">{rank}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold truncate ${isMe ? 'text-yellow-300' : 'text-white'}`}>
                            {name}{isMe && <span className="ml-1.5 text-xs text-yellow-600 font-normal">（自分）</span>}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <span className={`font-black tabular-nums ${isMe ? 'text-yellow-300' : 'text-white'}`} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22 }}>{row.week_points.toLocaleString()}</span>
                          <span className="text-xs text-slate-500 ml-0.5">pt</span>
                        </div>
                      </div>
                    )
                  })
                ) : tabKey === 'consecutive' ? (
                  sorted.map((row) => {
                    const rank = row._rank
                    const isMe = row.user_id === user.id
                    const name = row.display_name || '名無し'
                    const m = medalEmoji(rank)
                    return (
                      <div
                        key={row.user_id}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                          isMe ? 'bg-yellow-900/40 border-yellow-500/60' : rank <= 3 ? 'bg-slate-800 border-slate-600' : 'bg-slate-800/60 border-slate-700/60'
                        }`}
                      >
                        <div className="w-8 text-center flex-shrink-0">
                          {m ? <span className="text-xl leading-none">{m}</span> : <span className="text-slate-500 font-bold text-sm tabular-nums">{rank}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold truncate ${isMe ? 'text-yellow-300' : 'text-white'}`}>
                            {name}{isMe && <span className="ml-1.5 text-xs text-yellow-600 font-normal">（自分）</span>}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <span className={`font-black tabular-nums ${isMe ? 'text-yellow-300' : 'text-white'}`} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22 }}>{(row.consecutive_correct ?? 0).toLocaleString()}</span>
                          <span className="text-xs text-slate-500 ml-0.5">問</span>
                        </div>
                      </div>
                    )
                  })
                ) : tabKey === 'clear_time' ? (
                  sorted.map((row) => {
                    const rank = row._rank
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
                  sorted.map((row) => {
                    const rank = row._rank
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
