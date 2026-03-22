import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { fetchRankings } from '../utils/supabaseSync'

const TEACHER_EMAIL = 'suyama.kennichi@nihon-u.ac.jp'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function activityStatus(lastStudyDate) {
  if (!lastStudyDate) return { emoji: '⚫', label: '未学習', color: '#666' }
  const today = new Date(); today.setHours(0,0,0,0)
  const last  = new Date(lastStudyDate); last.setHours(0,0,0,0)
  const diff  = Math.round((today - last) / 86400000)
  if (diff === 0) return { emoji: '🟢', label: '今日',    color: '#4ade80' }
  if (diff <= 3)  return { emoji: '🟡', label: `${diff}日前`, color: '#facc15' }
  return              { emoji: '🔴', label: `${diff}日前`, color: '#f87171' }
}

const SORT_OPTIONS = [
  { key: 'last_study_date', label: '最近' },
  { key: 'total_points',    label: 'ポイント' },
  { key: 'current_streak',  label: 'ストリーク' },
  { key: 'challenge_clear_count', label: 'チャレンジ' },
]

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('last_study_date')

  const isTeacher = user?.email === TEACHER_EMAIL

  useEffect(() => {
    if (authLoading) return
    if (!isTeacher) { setLoading(false); return }
    fetchRankings()
      .then(data => { setStudents(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [user, authLoading, isTeacher])

  // ソート
  const sorted = [...students].sort((a, b) => {
    if (sortKey === 'last_study_date') {
      if (!a.last_study_date && !b.last_study_date) return 0
      if (!a.last_study_date) return 1
      if (!b.last_study_date) return -1
      return new Date(b.last_study_date) - new Date(a.last_study_date)
    }
    return (b[sortKey] ?? 0) - (a[sortKey] ?? 0)
  })

  const today = todayStr()
  const activeToday    = students.filter(s => s.last_study_date === today).length
  const activeThisWeek = students.filter(s => {
    if (!s.last_study_date) return false
    const diff = Math.round((new Date() - new Date(s.last_study_date)) / 86400000)
    return diff <= 7
  }).length

  return (
    <div className="min-h-screen bg-slate-900 text-white px-4 py-8">
      <div className="max-w-[600px] mx-auto">

        {/* ヘッダー */}
        <div className="flex items-center mb-6">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white mr-4 text-lg">
            ← 戻る
          </button>
          <h1 className="text-2xl font-bold">📊 先生ダッシュボード</h1>
        </div>

        {/* アクセス拒否 */}
        {!authLoading && !user && (
          <div className="p-8 bg-slate-800 rounded-2xl text-center">
            <div className="text-4xl mb-4">🔐</div>
            <p className="text-slate-300 font-bold mb-4">ログインが必要です</p>
            <button onClick={() => navigate('/settings')}
              className="py-3 px-6 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold">
              設定画面でログイン
            </button>
          </div>
        )}
        {!authLoading && user && !isTeacher && (
          <div className="p-8 bg-slate-800 rounded-2xl text-center">
            <div className="text-4xl mb-4">🚫</div>
            <p className="text-slate-300 font-bold">先生アカウントでのみ閲覧できます</p>
          </div>
        )}

        {/* ダッシュボード本体 */}
        {isTeacher && (
          <>
            {/* サマリー統計 */}
            {!loading && (
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-center">
                  <div className="font-black tabular-nums leading-tight"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff' }}>
                    {students.length}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">登録ユーザー</div>
                </div>
                <div className="bg-green-950/60 border border-green-800/50 rounded-xl p-3 text-center">
                  <div className="font-black tabular-nums leading-tight"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#4ade80' }}>
                    {activeToday}
                  </div>
                  <div className="text-xs text-green-700 mt-0.5">🟢 今日学習</div>
                </div>
                <div className="bg-yellow-950/40 border border-yellow-800/30 rounded-xl p-3 text-center">
                  <div className="font-black tabular-nums leading-tight"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#facc15' }}>
                    {activeThisWeek}
                  </div>
                  <div className="text-xs text-yellow-800 mt-0.5">🟡 今週学習</div>
                </div>
              </div>
            )}

            {/* ソートボタン */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {SORT_OPTIONS.map(s => (
                <button
                  key={s.key}
                  onClick={() => setSortKey(s.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    sortKey === s.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {s.label}順
                </button>
              ))}
            </div>

            {/* 生徒リスト */}
            {loading ? (
              <div className="text-center py-16 text-slate-400">読み込み中…</div>
            ) : students.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <div className="text-4xl mb-4">👩‍🏫</div>
                <p>まだ生徒データがありません</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {sorted.map((s, idx) => {
                  const status = activityStatus(s.last_study_date)
                  const isMe = s.user_id === user.id
                  const studiedToday = s.last_study_date === today

                  return (
                    <div
                      key={s.user_id}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                        isMe
                          ? 'bg-blue-900/30 border-blue-700/40'
                          : studiedToday
                          ? 'bg-green-950/30 border-green-800/30'
                          : 'bg-slate-800/80 border-slate-700/60'
                      }`}
                    >
                      {/* 番号 */}
                      <div className="w-6 text-center flex-shrink-0">
                        <span className="text-slate-600 text-xs tabular-nums font-bold">{idx + 1}</span>
                      </div>

                      {/* アクティビティ信号 */}
                      <div className="text-base flex-shrink-0">{status.emoji}</div>

                      {/* 名前・最終学習 */}
                      <div className="flex-1 min-w-0">
                        <div className={`font-bold text-sm truncate ${isMe ? 'text-blue-300' : 'text-white'}`}>
                          {s.display_name || '名無し'}
                          {isMe && <span className="ml-1 text-xs text-blue-500 font-normal">（自分）</span>}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: status.color }}>
                          {status.label}
                        </div>
                      </div>

                      {/* ポイント / ストリーク / チャレンジ */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <div className="font-black tabular-nums text-sm"
                            style={{ fontFamily: "'Bebas Neue', sans-serif", color: '#fff' }}>
                            {(s.total_points ?? 0).toLocaleString()}
                          </div>
                          <div className="text-xs text-slate-600">pt</div>
                        </div>
                        <div className="text-right">
                          <div className="font-black tabular-nums text-sm"
                            style={{ fontFamily: "'Bebas Neue', sans-serif", color: '#fb923c' }}>
                            {s.current_streak ?? 0}
                          </div>
                          <div className="text-xs text-slate-600">🔥</div>
                        </div>
                        <div className="text-right">
                          <div className="font-black tabular-nums text-sm"
                            style={{ fontFamily: "'Bebas Neue', sans-serif", color: '#a78bfa' }}>
                            {s.challenge_clear_count ?? 0}
                          </div>
                          <div className="text-xs text-slate-600">⚡</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 凡例 */}
            <div className="mt-6 p-3 bg-slate-800/50 rounded-xl">
              <p className="text-xs text-slate-500 font-bold mb-1">アクティビティ表示</p>
              <div className="flex gap-4 text-xs text-slate-400">
                <span>🟢 今日学習した</span>
                <span>🟡 3日以内</span>
                <span>🔴 4日以上前</span>
                <span>⚫ 未学習</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
