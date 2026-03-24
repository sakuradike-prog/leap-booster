import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useAllowedUser } from '../contexts/AllowedUserContext'
import * as XLSX from 'xlsx'

export default function UserManagementPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const allowedUser = useAllowedUser()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [newNickname, setNewNickname] = useState('')
  const [newRole, setNewRole] = useState('student')
  const [addMsg, setAddMsg] = useState(null)
  const [importMsg, setImportMsg] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editNickname, setEditNickname] = useState('')
  const fileInputRef = useRef(null)

  const isTeacher = allowedUser?.role === 'teacher'

  useEffect(() => {
    if (!isTeacher) return
    fetchUsers()
  }, [isTeacher])

  async function fetchUsers() {
    setLoading(true)
    const { data, error } = await supabase
      .from('allowed_users')
      .select('*')
      .order('created_at', { ascending: true })
    if (!error && data) setUsers(data)
    setLoading(false)
  }

  async function handleAddUser() {
    if (!newEmail.trim() || !newNickname.trim()) {
      setAddMsg({ type: 'error', text: 'メールとニックネームを入力してください' })
      return
    }
    const { error } = await supabase.from('allowed_users').insert({
      email: newEmail.trim().toLowerCase(),
      nickname: newNickname.trim(),
      role: newRole,
    })
    if (error) {
      setAddMsg({ type: 'error', text: error.message.includes('unique') ? 'このメールアドレスは既に登録されています' : error.message })
    } else {
      setAddMsg({ type: 'ok', text: '追加しました' })
      setNewEmail(''); setNewNickname(''); setNewRole('student')
      fetchUsers()
    }
    setTimeout(() => setAddMsg(null), 4000)
  }

  async function handleDeleteUser(id, email) {
    if (!confirm(`${email} を削除しますか？次回ログイン時にアクセス拒否されます。`)) return
    await supabase.from('allowed_users').delete().eq('id', id)
    fetchUsers()
  }

  function startEdit(u) {
    setEditingId(u.id)
    setEditNickname(u.nickname)
  }

  async function handleSaveNickname(id) {
    if (!editNickname.trim()) return
    const { error } = await supabase
      .from('allowed_users')
      .update({ nickname: editNickname.trim() })
      .eq('id', id)
    if (!error) {
      setUsers(prev => prev.map(u => u.id === id ? { ...u, nickname: editNickname.trim() } : u))
    }
    setEditingId(null)
  }

  function handleExcelImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws)
        let count = 0
        for (const row of rows) {
          const email = String(row.email ?? row['メール'] ?? '').trim().toLowerCase()
          const nickname = String(row.nickname ?? row['ニックネーム'] ?? '').trim()
          const role = String(row.role ?? row['権限'] ?? 'student').trim()
          if (!email || !nickname) continue
          const { error } = await supabase.from('allowed_users').upsert(
            { email, nickname, role: role === 'teacher' ? 'teacher' : 'student' },
            { onConflict: 'email' }
          )
          if (!error) count++
        }
        setImportMsg({ type: 'ok', text: `${count}件登録しました` })
        fetchUsers()
      } catch {
        setImportMsg({ type: 'error', text: 'Excelの読み込みに失敗しました' })
      }
      setTimeout(() => setImportMsg(null), 5000)
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  if (!isTeacher) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-500">先生アカウントのみアクセスできます</p>
      </div>
    )
  }

  const teachers = users.filter(u => u.role === 'teacher')
  const students = users.filter(u => u.role === 'student')

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[600px] mx-auto px-5 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/teacher')} className="text-slate-400 hover:text-white text-sm active:opacity-60">← 戻る</button>
          <h1 className="text-lg font-bold">👥 ユーザー管理</h1>
          <span className="ml-auto text-xs text-slate-500">{users.length}件</span>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Excel一括インポート */}
        <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-sm font-bold text-slate-300">📋 Excelから一括登録</p>
          <p className="text-xs text-slate-500">列：email / nickname / role（student か teacher）</p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelImport} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2.5 bg-teal-700 hover:bg-teal-600 rounded-lg text-sm font-bold transition-colors"
          >
            Excelファイルを選択して登録
          </button>
          {importMsg && (
            <p className={`text-xs font-bold ${importMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{importMsg.text}</p>
          )}
        </div>

        {/* 個別追加 */}
        <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-sm font-bold text-slate-300">＋ ユーザーを追加</p>
          <input
            type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
            placeholder="メールアドレス"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <input
            type="text" value={newNickname} onChange={e => setNewNickname(e.target.value)}
            placeholder="ニックネーム"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" value="student" checked={newRole === 'student'} onChange={() => setNewRole('student')} />
              <span className="text-slate-300">生徒</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" value="teacher" checked={newRole === 'teacher'} onChange={() => setNewRole('teacher')} />
              <span className="text-slate-300">教員</span>
            </label>
          </div>
          <button
            onClick={handleAddUser}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-bold transition-colors"
          >
            追加する
          </button>
          {addMsg && (
            <p className={`text-xs font-bold ${addMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{addMsg.text}</p>
          )}
        </div>

        {/* 登録済みユーザー一覧 */}
        {loading ? (
          <p className="text-slate-500 text-sm text-center py-6">読み込み中…</p>
        ) : (
          <>
            {/* 教員 */}
            {teachers.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-bold text-slate-500 tracking-wider">教員（{teachers.length}件）</p>
                {teachers.map(u => <UserRow key={u.id} u={u} currentUserId={user?.id} editingId={editingId} editNickname={editNickname} setEditNickname={setEditNickname} onEdit={startEdit} onSave={handleSaveNickname} onCancel={() => setEditingId(null)} onDelete={handleDeleteUser} />)}
              </div>
            )}

            {/* 生徒 */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-slate-500 tracking-wider">生徒（{students.length}件）</p>
              {students.map(u => <UserRow key={u.id} u={u} currentUserId={user?.id} editingId={editingId} editNickname={editNickname} setEditNickname={setEditNickname} onEdit={startEdit} onSave={handleSaveNickname} onCancel={() => setEditingId(null)} onDelete={handleDeleteUser} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function UserRow({ u, currentUserId, editingId, editNickname, setEditNickname, onEdit, onSave, onCancel, onDelete }) {
  const isEditing = editingId === u.id

  return (
    <div className="bg-slate-800/70 rounded-xl px-4 py-3 flex flex-col gap-2">
      {isEditing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={editNickname}
            onChange={e => setEditNickname(e.target.value)}
            autoFocus
            className="flex-1 bg-slate-700 border border-blue-500 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
          />
          <button onClick={() => onSave(u.id)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold">保存</button>
          <button onClick={onCancel} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-slate-400">✕</button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold shrink-0 ${u.role === 'teacher' ? 'bg-teal-900 text-teal-300' : 'bg-slate-700 text-slate-400'}`}>
            {u.role === 'teacher' ? '教員' : '生徒'}
          </span>
          <button
            onClick={() => onEdit(u)}
            className="flex-1 text-left"
          >
            <span className="text-white text-sm font-bold">{u.nickname}</span>
            <span className="text-slate-500 text-xs ml-2">✎</span>
          </button>
          <span className="text-slate-600 text-xs truncate max-w-[140px]">{u.email}</span>
          {u.email !== 'suyama.kennichi@nihon-u.ac.jp' && (
            <button onClick={() => onDelete(u.id, u.email)} className="text-slate-700 hover:text-red-400 text-xs transition-colors shrink-0">削除</button>
          )}
        </div>
      )}
    </div>
  )
}
