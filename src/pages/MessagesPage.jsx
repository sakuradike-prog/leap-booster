import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAllowedUser } from '../contexts/AllowedUserContext'
import { useAuth } from '../hooks/useAuth'

const LAST_READ_KEY = 'vocaleap_messages_last_read'

function fmtDate(ts) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function MessagesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const allowedUser = useAllowedUser()
  const [teacherMsgs, setTeacherMsgs] = useState([])
  const [studentMsgs, setStudentMsgs] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const textareaRef = useRef(null)

  async function fetchMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(100)
    if (error || !data) return
    setTeacherMsgs(data.filter(m => m.role === 'teacher'))
    setStudentMsgs(data.filter(m => m.role === 'student'))
    setLoading(false)
  }

  useEffect(() => {
    fetchMessages()
    localStorage.setItem(LAST_READ_KEY, new Date().toISOString())
  }, [])

  async function handleSend() {
    if (!newMsg.trim() || !user || !allowedUser) return
    setSending(true)
    const { error } = await supabase.from('messages').insert({
      user_id: user.id,
      email: user.email,
      nickname: allowedUser.nickname,
      role: allowedUser.role,
      content: newMsg.trim(),
    })
    if (!error) {
      setNewMsg('')
      fetchMessages()
    }
    setSending(false)
  }

  async function handleDelete(id) {
    await supabase.from('messages').delete().eq('id', id)
    fetchMessages()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[600px] mx-auto px-5 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm active:opacity-60">← 戻る</button>
          <h1 className="text-lg font-bold">お知らせ・掲示板</h1>
          <button
            onClick={fetchMessages}
            className="ml-auto text-slate-500 hover:text-slate-300 text-xs active:opacity-60"
          >
            更新
          </button>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto px-4 py-6 flex flex-col gap-6">

        {/* 先生から */}
        <div>
          <p className="text-xs font-bold text-slate-400 mb-3 tracking-wider">── 先生から ──────────────────</p>
          {loading ? (
            <div className="text-slate-600 text-sm text-center py-4">読み込み中…</div>
          ) : teacherMsgs.length === 0 ? (
            <p className="text-slate-600 text-sm">先生からのメッセージはありません</p>
          ) : (
            <div className="flex flex-col gap-2">
              {teacherMsgs.map(m => (
                <div key={m.id} className="bg-slate-700/80 border border-slate-600/40 rounded-xl px-4 py-3">
                  <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-slate-400 text-xs">{fmtDate(m.created_at)}　{m.nickname}</span>
                    {(user?.id === m.user_id || allowedUser?.role === 'teacher') && (
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="text-slate-600 hover:text-red-400 text-xs transition-colors"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* みんなから */}
        <div>
          <p className="text-xs font-bold text-slate-400 mb-3 tracking-wider">── みんなから ────────────────</p>
          {!loading && studentMsgs.length === 0 ? (
            <p className="text-slate-600 text-sm">まだメッセージはありません</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-800">
              {studentMsgs.map(m => (
                <div key={m.id} className="flex items-start gap-2 py-2.5">
                  <p className="flex-1 text-white text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    <span className="text-slate-500 text-xs">{fmtDate(m.created_at)} {m.nickname}</span>
                    {(user?.id === m.user_id || allowedUser?.role === 'teacher') && (
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="text-slate-600 hover:text-red-400 text-xs transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 投稿フォーム */}
        {user && allowedUser ? (
          <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <textarea
              ref={textareaRef}
              value={newMsg}
              onChange={e => setNewMsg(e.target.value.slice(0, 200))}
              onKeyDown={handleKeyDown}
              placeholder="メッセージを入力... (Cmd+Enter で送信)"
              rows={3}
              className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-slate-600 text-xs">{newMsg.length}/200</span>
              <button
                onClick={handleSend}
                disabled={sending || !newMsg.trim()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm font-bold transition-colors"
              >
                {sending ? '送信中…' : '送信'}
              </button>
            </div>
          </div>
        ) : !user ? (
          <p className="text-slate-600 text-sm text-center">投稿するにはログインが必要です</p>
        ) : null}

      </div>
    </div>
  )
}
