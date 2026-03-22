import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStats } from '../hooks/useUserStats'
import { useAuth } from '../hooks/useAuth'
import { db } from '../db/database'
import { getConsecutiveCorrect } from '../utils/consecutiveCorrect'

const TEACHER_EMAIL = 'suyama.kennichi@nihon-u.ac.jp'

// ---- SVG アイコン（Cモノグラムスタイル）----

function IconChallenge() {
  return (
    <svg width="44" height="44" viewBox="0 0 60 60" fill="none">
      <rect x="2" y="2" width="56" height="56" rx="13"
        fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5"/>
      <text x="30" y="33" fontFamily="'Bebas Neue', sans-serif" fontSize="26"
        fill="white" textAnchor="middle">30</text>
      <text x="30" y="45" fontFamily="'Bebas Neue', sans-serif" fontSize="10"
        fill="rgba(255,255,255,0.55)" textAnchor="middle" letterSpacing="1">CHAL</text>
    </svg>
  )
}

function IconDaily() {
  return (
    <svg width="44" height="44" viewBox="0 0 60 60" fill="none">
      <rect x="2" y="2" width="56" height="56" rx="13"
        fill="rgba(0,0,0,0.12)" stroke="rgba(0,0,0,0.25)" strokeWidth="2.5"/>
      <polygon points="34,6 22,28 28,28 24,54 38,24 32,24" fill="#111"/>
    </svg>
  )
}

function IconWarmup() {
  return (
    <svg width="44" height="44" viewBox="0 0 60 60" fill="none">
      <rect x="2" y="2" width="56" height="56" rx="13"
        fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5"/>
      <text x="18" y="42" fontFamily="'Noto Sans JP', sans-serif" fontSize="34"
        fontWeight="900" fill="white" textAnchor="middle">英</text>
      <text x="42" y="55" fontFamily="'Noto Sans JP', sans-serif" fontSize="22"
        fontWeight="900" fill="#ff2255" stroke="#111" strokeWidth="1.5"
        paintOrder="stroke" textAnchor="middle">作</text>
    </svg>
  )
}

function IconStats() {
  return (
    <svg width="32" height="32" viewBox="0 0 60 60" fill="none">
      <rect x="9" y="34" width="9" height="20" rx="2" fill="#44dd88"/>
      <rect x="22" y="24" width="9" height="30" rx="2" fill="#88ffcc"/>
      <rect x="35" y="16" width="9" height="38" rx="2" fill="white"/>
      <line x1="6" y1="54" x2="50" y2="54" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="32" height="32" viewBox="0 0 60 60" fill="none">
      <line x1="12" y1="18" x2="48" y2="18" stroke="#aaa" strokeWidth="3.5" strokeLinecap="round"/>
      <circle cx="22" cy="18" r="6" fill="#222" stroke="#aaa" strokeWidth="2.5"/>
      <line x1="12" y1="30" x2="48" y2="30" stroke="#aaa" strokeWidth="3.5" strokeLinecap="round"/>
      <circle cx="36" cy="30" r="6" fill="#222" stroke="#aaa" strokeWidth="2.5"/>
      <line x1="12" y1="42" x2="48" y2="42" stroke="#aaa" strokeWidth="3.5" strokeLinecap="round"/>
      <circle cx="24" cy="42" r="6" fill="#222" stroke="#aaa" strokeWidth="2.5"/>
    </svg>
  )
}

// ---- メニューボタン ----
function MenuButton({ onClick, bgColor, textDark = false, icon, label, sub }) {
  const textColor  = textDark ? '#111' : '#fff'
  const subColor   = textDark ? 'rgba(0,0,0,0.42)' : 'rgba(255,255,255,0.62)'
  const arrowColor = textDark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.35)'

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl border-[2.5px] border-black px-3 py-2 transition-all active:translate-x-[1.5px] active:translate-y-[1.5px]"
      style={{ backgroundColor: bgColor, boxShadow: '3px 3px 0 #111' }}
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 text-left min-w-0">
        <div className="leading-tight"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: '.04em', color: textColor }}>
          {label}
        </div>
        <div className="text-[9px] mt-0.5" style={{ color: subColor }}>{sub}</div>
      </div>
      <span className="text-xl font-black flex-shrink-0"
        style={{ fontFamily: "'Bebas Neue', sans-serif", color: arrowColor }}>›</span>
    </button>
  )
}

// ---- メイン ----
export default function Home() {
  const navigate = useNavigate()
  const { stats, loading, freezeNotice, clearFreezeNotice, checkStreak } = useUserStats()
  const { user } = useAuth()
  const isTeacher = user?.email === TEACHER_EMAIL
  const [totalStudyCount, setTotalStudyCount] = useState(0)
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0)
  const [notice, setNotice] = useState(null)

  // 起動時にストリーク状態チェック
  useEffect(() => {
    checkStreak()
  }, [checkStreak])

  // フリーズ通知をトースト表示（4秒後に消える）
  useEffect(() => {
    if (!freezeNotice) return
    if (freezeNotice === 'freeze_used') {
      setNotice({ type: 'ice', text: '❄️ フリーズ発動！ストリークを守りました' })
    } else if (freezeNotice === 'freeze_earned') {
      setNotice({ type: 'ice', text: '❄️ フリーズ獲得！ストリーク7日達成ボーナス' })
    } else if (freezeNotice === 'streak_broken') {
      setNotice({ type: 'red', text: '🔥 ストリークが途切れました… また今日から始めよう！' })
    }
    const timer = setTimeout(() => {
      setNotice(null)
      clearFreezeNotice()
    }, 4000)
    return () => clearTimeout(timer)
  }, [freezeNotice, clearFreezeNotice])

  // 累計学習単語数
  useEffect(() => {
    db.cards.toArray()
      .then(cards => {
        const total = cards.reduce((sum, c) => sum + (c.studyCount ?? 0), 0)
        setTotalStudyCount(total)
        setConsecutiveCorrect(getConsecutiveCorrect())
      })
      .catch(() => {})
  }, [])

  const streak      = stats?.currentStreak ?? 0
  const points      = stats?.totalPoints ?? 0
  const freezeCount = stats?.freezeCount ?? 0

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#fff8e8' }}>
    <div className="max-w-[600px] mx-auto min-h-screen flex flex-col">

      {/* トースト通知 */}
      {notice && (
        <div
          className="mx-4 mt-3 px-4 py-3 rounded-xl text-sm font-bold text-center border-2 border-black"
          style={{
            backgroundColor: notice.type === 'ice' ? '#ccf0ff' : '#ffe8e8',
            color: notice.type === 'ice' ? '#0077aa' : '#cc2222',
            boxShadow: '2px 2px 0 #111',
          }}
        >
          {notice.text}
        </div>
      )}

      {/* メインコンテンツ（上部はステータスバー隠れ対策で少し余白） */}
      <div className="flex-1 px-4 pt-8 pb-4 flex flex-col gap-4 relative overflow-hidden">

        {/* ドット背景 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #111 1.5px, transparent 1.5px)',
            backgroundSize: '14px 14px',
            opacity: .04,
            zIndex: 0,
          }}
        />

        {/* タイトルコピー */}
        <div className="relative z-10">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 48,
              color: '#111',
              lineHeight: .82,
              letterSpacing: '.02em',
            }}>
              英単語
            </div>
            {consecutiveCorrect >= 10 && (
              <div style={{
                marginBottom: 4,
                background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                borderRadius: 8,
                padding: '2px 8px',
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
              }}>
                🔥 {consecutiveCorrect}問連続正解中！
              </div>
            )}
          </div>
          {/* VOCABooster 黒帯バナー（全幅）タップでヒートマップへ */}
          <div
            className="flex items-center justify-between px-3 py-0.5 mt-1 -mx-4 active:opacity-70"
            style={{ backgroundColor: '#111', cursor: 'pointer' }}
            onClick={() => navigate('/heatmap')}
          >
            <div>
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 44,
                letterSpacing: '.06em',
                lineHeight: 1,
                color: '#fff',
              }}>
                LEAP
              </span>
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 44,
                letterSpacing: '.06em',
                lineHeight: 1,
                color: '#ff2255',
              }}>
                Booster
              </span>
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#555', letterSpacing: '.08em' }}>
              v{__APP_VERSION__}
            </div>
          </div>
        </div>

        {/* 統計グリッド */}
        {!loading && (
          <div className="relative z-10 flex flex-col gap-1.5">

            {/* 上段3列: STREAK / POINTS / WORDS */}
            <div className="flex gap-1.5">
              {/* STREAK */}
              <button
                onClick={() => navigate('/streak-info')}
                className="flex-1 flex flex-col items-center py-2 rounded-xl border-[2.5px] border-black active:translate-x-[1px] active:translate-y-[1px] transition-transform"
                style={{ backgroundColor: '#111', boxShadow: '2px 2px 0 #000' }}
              >
                <div style={{ height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 11, lineHeight: 1, letterSpacing: '-0.05em' }}>
                    {streak >= 100 ? '🔥🔥🔥🔥' : streak >= 50 ? '🔥🔥🔥' : streak >= 10 ? '🔥🔥' : '🔥'}
                  </span>
                </div>
                <span className="tabular-nums leading-tight"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff' }}>
                  {streak}
                </span>
                <span style={{ fontSize: 7, color: '#888', letterSpacing: '.08em', fontWeight: 700 }}>STREAK</span>
              </button>

              {/* POINTS */}
              <button
                onClick={() => navigate('/points-info')}
                className="flex-1 flex flex-col items-center py-2 rounded-xl border-[2.5px] border-black active:translate-x-[1px] active:translate-y-[1px] transition-transform"
                style={{ backgroundColor: '#ff2255', boxShadow: '2px 2px 0 #111' }}
              >
                <div style={{ height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 40 40">
                    <ellipse cx="21" cy="21" rx="17" ry="17" fill="#713F12" opacity="0.35"/>
                    <circle cx="20" cy="20" r="18" fill="#A16207"/>
                    <circle cx="20" cy="20" r="16" fill="#EAB308"/>
                    <circle cx="20" cy="20" r="12" fill="#FBBF24"/>
                    <rect x="16.5" y="8" width="7" height="24" rx="3.5" fill="#713F12"/>
                    <rect x="16.5" y="8" width="2.5" height="24" rx="1.25" fill="#FEF08A" opacity="0.5"/>
                    <ellipse cx="12" cy="13" rx="4" ry="5.5" fill="#FEFCE8" opacity="0.6" transform="rotate(-20 12 13)"/>
                  </svg>
                </div>
                <span className="tabular-nums leading-tight"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff' }}>
                  {points.toLocaleString()}
                </span>
                <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.7)', letterSpacing: '.08em', fontWeight: 700 }}>POINTS</span>
              </button>

              {/* WORDS（タップで学習履歴） */}
              <button
                onClick={() => navigate('/study-history')}
                className="flex-1 flex flex-col items-center py-2 rounded-xl border-[2.5px] border-black active:translate-x-[1px] active:translate-y-[1px]"
                style={{ backgroundColor: '#1a1a6a', boxShadow: '2px 2px 0 #111' }}>
                <div style={{ height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>📝</span>
                </div>
                <span className="tabular-nums leading-tight"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff' }}>
                  {totalStudyCount.toLocaleString()}
                </span>
                <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.6)', letterSpacing: '.06em', fontWeight: 700 }}>WORDS</span>
              </button>
            </div>

            {/* フリーズ全幅バー */}
            <div
              className="flex items-center justify-between px-3 py-2 rounded-xl border-[2.5px]"
              style={freezeCount > 0
                ? { backgroundColor: '#ccf0ff', borderColor: '#0099cc', boxShadow: '2px 2px 0 #0099cc' }
                : { backgroundColor: '#ebebeb', borderColor: '#ccc', boxShadow: '2px 2px 0 #bbb', opacity: .65 }
              }
            >
              <div>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 12,
                  letterSpacing: '.1em',
                  color: freezeCount > 0 ? '#0077aa' : '#aaa',
                }}>
                  ❄️ FREEZE
                </div>
                <div style={{ fontSize: 8, color: freezeCount > 0 ? '#0099cc' : '#aaa', marginTop: 1 }}>
                  {freezeCount > 0 ? '7日ごとに獲得・最大2個' : '次の7日達成で獲得'}
                </div>
              </div>
              <div className="flex gap-1.5 items-center">
                {[0, 1].map(i => (
                  <span key={i} style={{
                    fontSize: 22,
                    opacity: i < freezeCount ? 1 : .18,
                    filter: i < freezeCount
                      ? 'drop-shadow(0 0 3px rgba(0,180,255,0.5))'
                      : 'grayscale(1)',
                  }}>❄️</span>
                ))}
              </div>
            </div>

          </div>
        )}

        {loading && (
          <div className="relative z-10 text-center py-4 text-sm" style={{ color: '#bbb' }}>
            読み込み中…
          </div>
        )}

        {/* スペーサー: iPadで大きくなりすぎないよう最大高さを制限 */}
        <div className="flex-1" style={{ maxHeight: '2.5rem' }} />

        {/* ナビゲーションボタン */}
        <div className="relative z-10 flex flex-col gap-2 pb-2">

          <MenuButton
            onClick={() => navigate('/daily')}
            bgColor="#ffcc00"
            textDark
            icon={<IconDaily />}
            label="4択練習"
            sub="ポイントなし・何度でも挑戦できる"
          />

          <MenuButton
            onClick={() => navigate('/challenge')}
            bgColor="#ff2255"
            icon={<IconChallenge />}
            label="30問チャレンジ"
            sub="1日1回・ノーミス30問・ポイント獲得"
          />

          <MenuButton
            onClick={() => navigate('/warmup')}
            bgColor="#2266ff"
            icon={<IconWarmup />}
            label="瞬間英作文"
            sub="授業ウォームアップ"
          />

          <MenuButton
            onClick={() => navigate('/rankings')}
            bgColor="#7c3aed"
            icon={
              <svg width="44" height="44" viewBox="0 0 60 60" fill="none">
                <rect x="2" y="2" width="56" height="56" rx="13" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5"/>
                <rect x="7" y="29" width="14" height="21" rx="3" fill="#94a3b8"/>
                <text x="14" y="43" fontSize="10" textAnchor="middle" fontFamily="'Bebas Neue', sans-serif" fill="white">2</text>
                <rect x="24" y="17" width="13" height="33" rx="3" fill="#fbbf24"/>
                <text x="30.5" y="38" fontSize="12" textAnchor="middle" fontFamily="'Bebas Neue', sans-serif" fill="#78350f">1</text>
                <rect x="40" y="37" width="14" height="13" rx="3" fill="#cd7c42"/>
                <text x="47" y="47" fontSize="10" textAnchor="middle" fontFamily="'Bebas Neue', sans-serif" fill="white">3</text>
                <path d="M25 16 L27 10 L30.5 14 L34 10 L36 16 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="0.8"/>
                <circle cx="25" cy="16.5" r="1.8" fill="white"/>
                <circle cx="30.5" cy="13" r="1.8" fill="white"/>
                <circle cx="36" cy="16.5" r="1.8" fill="white"/>
              </svg>
            }
            label="ランキング"
            sub="ポイント・ストリーク・チャレンジ"
          />

          {/* 先生ダッシュボード（先生アカウントのみ表示） */}
          {isTeacher && (
            <MenuButton
              onClick={() => navigate('/teacher')}
              bgColor="#0f766e"
              icon={
                <svg width="44" height="44" viewBox="0 0 60 60" fill="none">
                  <rect x="2" y="2" width="56" height="56" rx="13" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5"/>
                  <circle cx="22" cy="20" r="13" fill="white" opacity="0.92"/>
                  <clipPath id="teacherClip"><circle cx="22" cy="20" r="12"/></clipPath>
                  <image href="/badge_large.png" x="10" y="8" width="24" height="24" clipPath="url(#teacherClip)"/>
                  <circle cx="44" cy="16" r="5" fill="rgba(255,255,255,0.3)"/>
                  <circle cx="44" cy="16" r="2.2" fill="#4ade80"/>
                  <circle cx="44" cy="29" r="5" fill="rgba(255,255,255,0.3)"/>
                  <circle cx="44" cy="29" r="2.2" fill="#4ade80"/>
                  <circle cx="16" cy="44" r="5" fill="rgba(255,255,255,0.3)"/>
                  <circle cx="16" cy="44" r="2.2" fill="#4ade80"/>
                  <circle cx="30" cy="44" r="5" fill="rgba(255,255,255,0.3)"/>
                  <circle cx="30" cy="44" r="2.2" fill="#facc15"/>
                  <circle cx="44" cy="44" r="5" fill="rgba(255,255,255,0.3)"/>
                  <circle cx="44" cy="44" r="2.2" fill="#f87171"/>
                </svg>
              }
              label="先生ダッシュボード"
              sub="生徒の学習状況を確認"
            />
          )}

          {/* 学習記録 + 設定（横並び） */}
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/stats')}
              className="flex-1 flex items-center gap-2 rounded-xl border-[2.5px] border-black px-3 py-2 transition-all active:translate-x-[1px] active:translate-y-[1px]"
              style={{ backgroundColor: '#116633', boxShadow: '2px 2px 0 #111' }}
            >
              <IconStats />
              <div className="text-left">
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: '.04em', color: '#fff' }}>
                  学習記録
                </div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)' }}>ストリーク・履歴</div>
              </div>
            </button>

            <button
              onClick={() => navigate('/settings')}
              className="flex-1 flex items-center gap-2 rounded-xl border-[2.5px] border-black px-3 py-2 transition-all active:translate-x-[1px] active:translate-y-[1px]"
              style={{ backgroundColor: '#333', boxShadow: '2px 2px 0 #111' }}
            >
              <IconSettings />
              <div className="text-left">
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: '.04em', color: '#aaa' }}>
                  設定
                </div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)' }}>サウンド・タイマー</div>
              </div>
            </button>
          </div>

        </div>

      </div>{/* /main content */}
    </div>{/* /max-w-sm */}
    </div>
  )
}
