import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useAllowedUser } from '../contexts/AllowedUserContext'
import { fetchRankings, fetchUserModeCompletions } from '../utils/supabaseSync'

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

const MODE_LABELS = {
  practice:       { label: '4択練習',         icon: '📝' },
  sort:           { label: '仕分け練習',       icon: '🃏' },
  spell:          { label: 'スペル練習',       icon: '⌨️' },
  challenge:      { label: 'チャレンジ',       icon: '⚡' },
  complete_bonus: { label: '全モード完了ボーナス', icon: '🏆' },
}

function getModeInfo(mode) {
  return MODE_LABELS[mode] ?? { label: mode, icon: '▪️' }
}

function StudentDetail({ student, onBack }) {
  const [completions, setCompletions] = useState(null)

  useEffect(() => {
    fetchUserModeCompletions(student.user_id, 30)
      .then(data => {
        // group by date
        const map = {}
        for (const row of data) {
          if (!map[row.date]) map[row.date] = []
          map[row.date].push({ mode: row.mode, completedAt: row.completed_at })
        }
        const groups = Object.entries(map)
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([date, entries]) => ({ date, entries }))
        setCompletions(groups)
      })
  }, [student.user_id])

  const status = activityStatus(student.last_study_date)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm active:opacity-60">← 戻る</button>
        <div className="flex items-center gap-2">
          <span className="text-base">{status.emoji}</span>
          <span className="font-bold text-white">{student.display_name || '名無し'}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="font-black tabular-nums text-lg text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            {(student.total_points ?? 0).toLocaleString()}
          </div>
          <div className="text-xs text-slate-500">ポイント</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="font-black tabular-nums text-lg text-orange-400" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            {student.current_streak ?? 0}
          </div>
          <div className="text-xs text-slate-500">🔥 ストリーク</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="font-black tabular-nums text-lg text-purple-400" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            {student.challenge_clear_count ?? 0}
          </div>
          <div className="text-xs text-slate-500">⚡ チャレンジ</div>
        </div>
      </div>

      <div>
        <p className="text-sm font-bold text-slate-400 mb-2">練習完了履歴（直近30日）</p>
        {completions === null ? (
          <p className="text-slate-500 text-sm text-center py-6">読み込み中…</p>
        ) : completions.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">完了履歴がありません</p>
        ) : (
          <div className="flex flex-col gap-2">
            {completions.map(({ date, entries }) => (
              <div key={date} className="bg-slate-800 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-400 font-bold mb-2">{date}</p>
                <div className="flex flex-col gap-1.5">
                  {entries.map(({ mode, completedAt }) => {
                    const { label, icon } = getModeInfo(mode)
                    const timeStr = completedAt
                      ? new Date(completedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
                      : null
                    return (
                      <div key={mode} className="flex items-center justify-between bg-slate-700/60 rounded-lg px-3 py-1.5">
                        <span className="text-xs text-slate-200">{icon} {label}</span>
                        {timeStr && <span className="text-xs text-slate-500 tabular-nums">{timeStr}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const allowedUser = useAllowedUser()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('last_study_date')
  const [selectedStudent, setSelectedStudent] = useState(null)

  const isTeacher = allowedUser?.role === 'teacher'

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
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[600px] mx-auto px-5 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm active:opacity-60">← 戻る</button>
          <h1 className="text-lg font-bold">📊 先生ダッシュボード</h1>
        </div>
      </div>
      <div className="max-w-[600px] mx-auto px-4 py-6 flex flex-col gap-8">

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

        {/* 生徒詳細 */}
        {isTeacher && selectedStudent && (
          <StudentDetail student={selectedStudent} onBack={() => setSelectedStudent(null)} />
        )}

        {/* ダッシュボード本体 */}
        {isTeacher && !selectedStudent && (
          <>
            {/* サマリー統計 */}
            {!loading && (
              <div className="grid grid-cols-3 gap-3">
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
            <div className="flex gap-2 flex-wrap">
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
                    <button
                      key={s.user_id}
                      onClick={() => setSelectedStudent(s)}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border active:scale-95 transition-all ${
                        isMe
                          ? 'bg-blue-900/30 border-blue-700/40 hover:bg-blue-900/50'
                          : studiedToday
                          ? 'bg-green-950/30 border-green-800/30 hover:bg-green-950/50'
                          : 'bg-slate-800/80 border-slate-700/60 hover:bg-slate-700/80'
                      }`}
                    >
                      <div className="w-6 text-center flex-shrink-0">
                        <span className="text-slate-600 text-xs tabular-nums font-bold">{idx + 1}</span>
                      </div>
                      <div className="text-base flex-shrink-0">{status.emoji}</div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-bold text-sm truncate ${isMe ? 'text-blue-300' : 'text-white'}`}>
                          {s.display_name || '名無し'}
                          {isMe && <span className="ml-1 text-xs text-blue-500 font-normal">（自分）</span>}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: status.color }}>
                          {status.label}
                        </div>
                      </div>
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
                    </button>
                  )
                })}
              </div>
            )}

            {/* 凡例 */}
            <div className="p-3 bg-slate-800/50 rounded-xl">
              <p className="text-xs text-slate-500 font-bold mb-1">アクティビティ表示</p>
              <div className="flex gap-4 text-xs text-slate-400">
                <span>🟢 今日学習した</span>
                <span>🟡 3日以内</span>
                <span>🔴 4日以上前</span>
                <span>⚫ 未学習</span>
              </div>
            </div>

            {/* ユーザー管理ボタン */}
            <button
              onClick={() => navigate('/users')}
              className="w-full py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl font-bold text-slate-300 transition-colors flex items-center justify-center gap-2"
            >
              👥 ユーザー管理
            </button>
          </>
        )}
      </div>
    </div>
  )
}
