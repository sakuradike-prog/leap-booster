import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { useUserStats } from '../hooks/useUserStats'
import StreakToast from '../components/StreakToast'
import { playCaptureSound } from '../utils/celebrationSounds'

/** Canvas 放射状パーティクルバースト */
function CaptureCanvas() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = window.innerWidth, H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    const cx = W / 2, cy = H * 0.36
    const COLORS = ['#00e5ff','#ffffff','#22d3ee','#67e8f9','#ffd93d','#6bcb77','#a78bfa','#f9a8d4']
    const particles = Array.from({ length: 70 }, (_, i) => {
      const angle = (i / 70) * Math.PI * 2 + Math.random() * 0.15
      const speed = 7 + Math.random() * 13
      return {
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0.18, drag: 0.94,
        color: COLORS[i % COLORS.length],
        w: 4 + Math.random() * 9, h: 2 + Math.random() * 5,
        rot: angle, rotV: (Math.random() - 0.5) * 0.22,
        isLine: Math.random() > 0.5, opacity: 1,
      }
    })
    let rafId
    const t0 = Date.now()
    function draw() {
      const elapsed = Date.now() - t0
      ctx.clearRect(0, 0, W, H)
      let alive = false
      for (const p of particles) {
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.gravity
        p.x += p.vx; p.y += p.vy; p.rot += p.rotV
        p.opacity = Math.max(0, 1 - Math.max(0, elapsed - 200) / 1100)
        if (p.opacity < 0.02) continue
        alive = true
        ctx.save()
        ctx.globalAlpha = p.opacity; ctx.shadowBlur = 10; ctx.shadowColor = p.color
        ctx.fillStyle = p.color; ctx.strokeStyle = p.color; ctx.lineWidth = 2.5
        ctx.translate(p.x, p.y); ctx.rotate(p.rot)
        if (p.isLine) {
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p.w * 2.2, 0); ctx.stroke()
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        }
        ctx.restore()
      }
      if (alive) rafId = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(rafId)
  }, [])
  return (
    <canvas ref={ref} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }} />
  )
}

const WILD_LABEL = '野生で発見'

export default function CapturePage() {
  const navigate = useNavigate()
  const [leapNumber, setLeapNumber] = useState('')
  const [memo, setMemo] = useState('')
  const [foundWord, setFoundWord] = useState(null)
  const [capturedEntry, setCapturedEntry] = useState(null) // null = 未捕獲, object = 捕獲済エントリ
  const [registered, setRegistered] = useState(false)
  const [savedMemo, setSavedMemo] = useState('')          // 完了画面表示用
  const [searching, setSearching] = useState(false)
  const [streakToast, setStreakToast] = useState(null)
  // インライン編集
  const [editingMemo, setEditingMemo] = useState(false)
  const [editMemoValue, setEditMemoValue] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const editInputRef = useRef(null)
  const { recordStudy } = useUserStats()

  // LEAP No. が変わったら単語を検索
  useEffect(() => {
    const num = parseInt(leapNumber, 10)
    if (!num || num <= 0) {
      setFoundWord(null)
      setCapturedEntry(null)
      setEditingMemo(false)
      return
    }
    setSearching(true)
    Promise.all([
      db.words.where('leapNumber').equals(num).first(),
      db.captured_words.where('leapNumber').equals(num).first(),
    ]).then(([word, cap]) => {
      setFoundWord(word ?? null)
      setCapturedEntry(cap ?? null)
      setEditingMemo(false)
      setSearching(false)
    }).catch(() => setSearching(false))
  }, [leapNumber])

  // 編集モードに入ったらフォーカス
  useEffect(() => {
    if (editingMemo) editInputRef.current?.focus()
  }, [editingMemo])

  async function handleRegister() {
    if (!foundWord) return
    const finalMemo = memo.trim() || WILD_LABEL
    const existing = await db.captured_words.where('leapNumber').equals(foundWord.leapNumber).first()
    if (existing) {
      await db.captured_words.update(existing.id, { memo: finalMemo, capturedAt: new Date() })
    } else {
      await db.captured_words.add({
        leapNumber: foundWord.leapNumber,
        word: foundWord.word,
        memo: finalMemo,
        capturedAt: new Date(),
      })
    }
    playCaptureSound()
    const result = await recordStudy()
    if (result.streakUpdated) setStreakToast(result.currentStreak)
    setSavedMemo(finalMemo)
    setRegistered(true)
  }

  async function handleSaveEdit() {
    if (!capturedEntry) return
    setSavingEdit(true)
    const newMemo = editMemoValue.trim() || WILD_LABEL
    await db.captured_words.update(capturedEntry.id, { memo: newMemo })
    setCapturedEntry({ ...capturedEntry, memo: newMemo })
    setEditingMemo(false)
    setSavingEdit(false)
  }

  function handleReset() {
    setLeapNumber('')
    setMemo('')
    setFoundWord(null)
    setCapturedEntry(null)
    setRegistered(false)
    setSavedMemo('')
    setEditingMemo(false)
    setEditMemoValue('')
  }

  if (streakToast !== null) {
    return <StreakToast streak={streakToast} onDone={() => setStreakToast(null)} />
  }

  if (registered && foundWord) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 text-center"
        style={{ background: 'linear-gradient(160deg, #001a1f 0%, #002a30 60%, #001218 100%)' }}>
        <style>{`
          @keyframes cpFlash {
            0% { opacity: .85; } 100% { opacity: 0; }
          }
          @keyframes cpShake {
            0%,100% { transform: translateX(0) rotate(0); }
            15% { transform: translateX(-9px) rotate(-2deg); }
            30% { transform: translateX(9px) rotate(2deg); }
            50% { transform: translateX(-6px) rotate(-1deg); }
            70% { transform: translateX(5px) rotate(1deg); }
            85% { transform: translateX(-2px); }
          }
          @keyframes cpTarget {
            0%   { transform: scale(0) rotate(-50deg); opacity: 0; }
            50%  { transform: scale(1.45) rotate(7deg); opacity: 1; }
            68%  { transform: scale(0.82) rotate(-4deg); }
            82%  { transform: scale(1.1) rotate(2deg); }
            100% { transform: scale(1) rotate(0deg); }
          }
          @keyframes cpRing {
            0%   { transform: scale(0.3); opacity: 1; }
            100% { transform: scale(3.2); opacity: 0; }
          }
          @keyframes cpSlideUp {
            from { opacity: 0; transform: translateY(30px) scale(.94); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes cpGlow {
            0%,100% { text-shadow: 0 0 20px rgba(34,211,238,.7), 0 0 40px rgba(34,211,238,.4); }
            50%      { text-shadow: 0 0 40px rgba(34,211,238,1),  0 0 80px rgba(34,211,238,.7); }
          }
        `}</style>

        {/* 白フラッシュ */}
        <div style={{ position: 'fixed', inset: 0, backgroundColor: '#00e5ff', animation: 'cpFlash .25s ease-out both', pointerEvents: 'none', zIndex: 9 }} />

        {/* パーティクルキャンバス */}
        <CaptureCanvas />

        {/* シェイク＋コンテンツ */}
        <div style={{ animation: 'cpShake .5s ease-out .03s both', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>

          {/* 的 ＋ 波紋 */}
          <div style={{ position: 'relative', width: 130, height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{
                position: 'absolute', borderRadius: '50%',
                border: '3px solid rgba(34,211,238,.9)',
                width: 80, height: 80,
                animation: `cpRing .9s ease-out ${i * 0.16}s both`,
                boxShadow: '0 0 12px rgba(34,211,238,.6)',
              }} />
            ))}
            <div style={{ fontSize: 80, lineHeight: 1, display: 'inline-block', animation: 'cpTarget .58s cubic-bezier(0.34,1.56,0.64,1) .03s both', filter: 'drop-shadow(0 0 18px rgba(34,211,238,.8))' }}>
              🎯
            </div>
          </div>

          {/* テキスト */}
          <div style={{ animation: 'cpSlideUp .4s ease-out .38s both', opacity: 0 }}>
            <h2 style={{ fontSize: 30, fontWeight: 900, color: '#22d3ee', marginBottom: 8, animation: 'cpGlow 1.5s ease-in-out .8s infinite' }}>
              捕獲完了！
            </h2>
            <p style={{ color: '#ffffff', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{foundWord.word}</p>
            <p style={{ color: '#67e8f9', fontSize: 13, marginBottom: 3 }}>No.{foundWord.leapNumber} {foundWord.leapPart}</p>
            <p style={{ color: '#475569', fontSize: 13, marginBottom: 36 }}>📍 {savedMemo}</p>
          </div>

          {/* ボタン */}
          <div className="flex flex-col gap-3 w-full max-w-sm" style={{ animation: 'cpSlideUp .4s ease-out .56s both', opacity: 0 }}>
            <button onClick={handleReset}
              className="w-full py-4 rounded-xl font-bold text-slate-900 transition-colors"
              style={{ background: 'linear-gradient(90deg,#00e5ff,#22d3ee)', boxShadow: '0 0 24px rgba(0,229,255,.5)' }}>
              続けて捕獲する
            </button>
            <button onClick={() => navigate(-1)}
              className="w-full py-4 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-slate-300 transition-colors">
              戻る
            </button>
          </div>
        </div>
      </div>
    )
  }

  const canRegister = !!foundWord

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col px-5 py-6">
      <button
        onClick={() => navigate(-1)}
        className="text-slate-400 hover:text-white text-sm mb-6 text-left"
      >
        ← 戻る
      </button>

      <h1 className="text-2xl font-black mb-1">🎯 単語を捕獲する</h1>
      <p className="text-slate-400 text-sm mb-6">LEAPの英単語を他で見つけたらNo.で登録</p>

      {/* LEAP No. 入力 */}
      <div className="mb-4">
        <label className="block text-xs text-slate-400 font-bold mb-1.5 uppercase tracking-wider">
          LEAP No.
        </label>
        <input
          type="number"
          min="1"
          max="2300"
          value={leapNumber}
          onChange={e => { setLeapNumber(e.target.value); setRegistered(false) }}
          placeholder="例: 142"
          className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-cyan-500 rounded-xl text-white text-2xl font-black text-center outline-none transition-colors"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '.05em' }}
        />
      </div>

      {/* 単語プレビュー */}
      {leapNumber && (
        <div className="mb-4 px-4 py-3 rounded-xl border-2" style={{
          backgroundColor: foundWord ? 'rgba(6,182,212,0.08)' : 'rgba(100,100,100,0.05)',
          borderColor: foundWord ? 'rgba(6,182,212,0.4)' : 'rgba(100,100,100,0.3)',
        }}>
          {searching ? (
            <p className="text-slate-500 text-sm text-center py-2">検索中...</p>
          ) : foundWord ? (
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <p className="text-white font-black"
                  style={{
                    fontSize: foundWord.word.length <= 10 ? '1.5rem'
                      : foundWord.word.length <= 15 ? '1.25rem' : '1rem',
                    overflowWrap: 'break-word', wordBreak: 'break-word',
                  }}
                >{foundWord.word}</p>
                {capturedEntry && (
                  <span className="text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 rounded px-1.5 py-0.5 font-bold">🎯 捕獲済</span>
                )}
              </div>
              <p className="text-slate-300 text-sm">{foundWord.meaning}</p>
              <p className="text-slate-500 text-xs mt-0.5">{foundWord.leapPart} — {foundWord.partOfSpeech}</p>

              {/* 捕獲済み：場所メモのインライン編集 */}
              {capturedEntry && (
                <div className="mt-3 border-t border-cyan-500/20 pt-3">
                  {editingMemo ? (
                    <div>
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editMemoValue}
                        onChange={e => setEditMemoValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit() }}
                        placeholder={WILD_LABEL}
                        className="w-full px-3 py-2 bg-slate-700 border-2 border-cyan-500/60 rounded-lg text-white text-sm outline-none"
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={handleSaveEdit}
                          disabled={savingEdit}
                          className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg text-sm font-bold transition-colors"
                        >
                          {savingEdit ? '保存中…' : '保存する'}
                        </button>
                        <button
                          onClick={() => setEditingMemo(false)}
                          className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditMemoValue(capturedEntry.memo || WILD_LABEL)
                        setEditingMemo(true)
                      }}
                      className="w-full flex items-center gap-2 text-left active:opacity-60 transition-opacity group"
                    >
                      <span className="text-cyan-600 text-xs shrink-0">📍</span>
                      <span className="flex-1 text-xs text-cyan-400/80 truncate">
                        {capturedEntry.memo || WILD_LABEL}
                      </span>
                      <span className="text-slate-600 text-xs group-active:text-slate-400 shrink-0">✏️ 編集</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-slate-500 text-sm text-center py-2">No.{leapNumber} は見つかりません</p>
          )}
        </div>
      )}

      {/* 備考欄（任意） */}
      <div className="mb-6">
        <label className="block text-xs text-slate-400 font-bold mb-1.5 uppercase tracking-wider">
          捕獲場所メモ <span className="text-slate-600 normal-case font-normal tracking-normal">(任意)</span>
        </label>
        <input
          type="text"
          value={memo}
          onChange={e => setMemo(e.target.value)}
          placeholder="例: 英検1級 2024年度第1回 大問3"
          className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-cyan-500 rounded-xl text-white text-sm outline-none transition-colors"
        />
        <p className="text-slate-600 text-xs mt-1.5">
          空欄の場合は「{WILD_LABEL}」として登録されます
        </p>
      </div>

      {/* 登録ボタン */}
      <button
        onClick={handleRegister}
        disabled={!canRegister}
        className="w-full py-5 text-xl font-bold bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-2xl transition-colors"
      >
        {capturedEntry ? '🔄 再捕獲する' : '🎯 捕獲する'}
      </button>

      {!canRegister && leapNumber && !searching && (
        <p className="text-center text-slate-600 text-xs mt-3">
          有効な No. を入力してください
        </p>
      )}
    </div>
  )
}
