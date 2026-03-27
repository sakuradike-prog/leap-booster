import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import ScrollToTop from './components/ScrollToTop'
import Home from './pages/Home'
import Challenge from './pages/Challenge'
import Warmup from './pages/Warmup'
import Stats from './pages/Stats'
import Settings from './pages/Settings'
import DailyQuiz from './pages/DailyQuiz'
import StudyHistory from './pages/StudyHistory'
import HeatmapPage from './pages/HeatmapPage'
import CapturePage from './pages/CapturePage'
import StreakInfoPage from './pages/StreakInfoPage'
import PointsInfoPage from './pages/PointsInfoPage'
import Rankings from './pages/Rankings'
import TeacherDashboard from './pages/TeacherDashboard'
import MessagesPage from './pages/MessagesPage'
import NotAllowedPage from './pages/NotAllowedPage'
import UserManagementPage from './pages/UserManagementPage'
import { AllowedUserContext } from './contexts/AllowedUserContext'
import { db } from './db/database'
import { importCSVFromUrl } from './utils/importFromCSV'
import { loadWordFamilies } from './utils/loadWordFamilies'
import { loadRoots } from './utils/loadRoots'
import { loadExamples } from './utils/loadExamples'
import { supabase } from './lib/supabase'
import { migrateLocalDataToServer } from './utils/migrateToServer'
import { mergeCapturedWords, mergeCards, mergeChallengeHistory, mergeWarmupHistory, mergeDailyQuizHistory, mergeCheckedWords, syncDisplayName } from './utils/supabaseSync'
import { mergeConsecutiveCorrect } from './utils/consecutiveCorrect'

// ── 認証キャッシュ（LocalStorage, 24時間有効） ──────────────────────────
const AUTH_CACHE_KEY = 'vocaleap_auth_cache'
const AUTH_CACHE_TTL = 24 * 60 * 60 * 1000

function getCachedAuth(uid) {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw)
    if (c.uid !== uid) return null
    if (Date.now() - c.ts > AUTH_CACHE_TTL) return null
    return { nickname: c.nickname, role: c.role }
  } catch { return null }
}
function setCachedAuth(uid, nickname, role) {
  try { localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ uid, nickname, role, ts: Date.now() })) } catch {}
}
function clearCachedAuth() {
  localStorage.removeItem(AUTH_CACHE_KEY)
}

// 歓迎モーダル
function WelcomeModal({ nickname, onSettings, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
      <div className="max-w-sm w-full bg-slate-800 border border-slate-600 rounded-2xl p-7 flex flex-col gap-4 text-white">
        <h2 className="text-xl font-bold text-center">ようこそ、{nickname}さん！</h2>
        <div className="text-sm text-slate-300 leading-relaxed">
          <p>あなたの名前は「<span className="text-white font-bold">{nickname}</span>」で登録されています。</p>
          <p className="mt-1 text-slate-500">気に入らない場合は先生に言ってください。</p>
        </div>
        <div className="bg-slate-700/60 rounded-xl p-4 text-sm text-slate-300 leading-relaxed">
          📚 まず<span className="text-white font-semibold">設定</span>から書籍データを選んでください。<br />
          「改訂版」または「旧版」のどちらを使っているか選ぶと学習が始められます。
        </div>
        <div className="flex gap-3 mt-1">
          <button
            onClick={onSettings}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-colors"
          >
            設定を開く
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition-colors"
          >
            あとで
          </button>
        </div>
      </div>
    </div>
  )
}

function AppRoutes({ allowedUser, showWelcome, onWelcomeClose, onWelcomeSettings }) {
  const navigate = useNavigate()

  function handleWelcomeSettings() {
    onWelcomeSettings()
    navigate('/settings')
  }

  return (
    <>
      <ScrollToTop />
      {showWelcome && allowedUser && (
        <WelcomeModal
          nickname={allowedUser.nickname}
          onSettings={handleWelcomeSettings}
          onClose={onWelcomeClose}
        />
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/challenge" element={<Challenge />} />
        <Route path="/warmup" element={<Warmup />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/daily" element={<DailyQuiz />} />
        <Route path="/study-history" element={<StudyHistory />} />
        <Route path="/heatmap" element={<HeatmapPage />} />
        <Route path="/capture" element={<CapturePage />} />
        <Route path="/streak-info" element={<StreakInfoPage />} />
        <Route path="/points-info" element={<PointsInfoPage />} />
        <Route path="/rankings" element={<Rankings />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/users" element={<UserManagementPage />} />
      </Routes>
    </>
  )
}

function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  // undefined=確認中, null=未ログイン, false=アクセス拒否, {nickname,role}=認証済み
  const [allowedUser, setAllowedUser] = useState(undefined)
  const [currentUserId, setCurrentUserId] = useState(undefined)
  const [showWelcome, setShowWelcome] = useState(false)
  const lastSyncRef = useRef(0)

  function runSync(uid) {
    const now = Date.now()
    if (now - lastSyncRef.current < 60_000) return
    lastSyncRef.current = now
    Promise.all([
      mergeCapturedWords(uid, db),
      mergeCards(uid, db),
      mergeChallengeHistory(uid, db),
      mergeWarmupHistory(uid, db),
      mergeDailyQuizHistory(uid, db),
      mergeCheckedWords(uid, db),
      mergeConsecutiveCorrect(uid),
    ]).then(() => {
      window.dispatchEvent(new CustomEvent('vocaleap:synced'))
    })
  }

  // ログイン状態を監視 → allowed_users チェック
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user?.id) {
        const uid = session.user.id
        setCurrentUserId(uid)

        // ── キャッシュヒット：即座に認証済みにしてバックグラウンドで更新 ──
        const cached = getCachedAuth(uid)
        if (cached) {
          setAllowedUser({ nickname: cached.nickname, role: cached.role })
          syncDisplayName(uid, cached.nickname)
          runSync(uid)
          // バックグラウンドでキャッシュを更新（失敗しても表示に影響なし）
          supabase.from('allowed_users').select('nickname, role').eq('email', session.user.email).single()
            .then(({ data, error }) => {
              if (!error && data) setCachedAuth(uid, data.nickname, data.role)
            })
          return
        }

        // ── キャッシュなし：最大3回リトライ ──
        let allowed = null
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const result = await Promise.race([
              supabase.from('allowed_users').select('nickname, role').eq('email', session.user.email).single(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
            ])
            if (!result.error && result.data) { allowed = result.data; break }
            break // データなし（許可されていない）
          } catch {
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
              continue
            }
            setAllowedUser('error')
            return
          }
        }

        if (!allowed) {
          await supabase.auth.signOut()
          clearCachedAuth()
          setAllowedUser(false)
          setCurrentUserId(null)
          return
        }

        setCachedAuth(uid, allowed.nickname, allowed.role)
        setAllowedUser({ nickname: allowed.nickname, role: allowed.role })
        syncDisplayName(uid, allowed.nickname)

        const welcomeKey = `vocaleap_welcomed_${uid}`
        if (!localStorage.getItem(welcomeKey)) {
          setShowWelcome(true)
        }

        migrateLocalDataToServer(uid)
        runSync(uid)
      } else if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
        clearCachedAuth()
        setAllowedUser(null)
        setCurrentUserId(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // フォアグラウンド復帰時に再同期
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) runSync(session.user.id)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // DB 初期化
  useEffect(() => {
    async function initDB() {
      try {
        const count = await db.words.count()
        if (count === 0) {
          await importCSVFromUrl('/data/leap_words.csv', false)
        }
        await loadWordFamilies()
        await loadRoots()
        await loadExamples()
      } catch (err) {
        setError(err.message)
      } finally {
        setReady(true)
      }
    }
    initDB()
  }, [])

  function handleWelcomeClose() {
    if (currentUserId) localStorage.setItem(`vocaleap_welcomed_${currentUserId}`, '1')
    setShowWelcome(false)
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-4">
        <div className="text-4xl animate-spin">⏳</div>
        <p className="text-lg text-slate-300">単語データを読み込み中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-4 px-6">
        <div className="text-4xl">❌</div>
        <p className="text-lg text-red-400 text-center">データの読み込みに失敗しました</p>
        <p className="text-sm text-slate-400 text-center">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-colors"
        >
          再試行
        </button>
      </div>
    )
  }

  // 認証状態確認中（INITIAL_SESSION 受信前 or allowed_users チェック中）
  if (allowedUser === undefined) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-4">
        <div className="text-4xl animate-spin">⏳</div>
        <p className="text-lg text-slate-300">認証確認中...</p>
      </div>
    )
  }

  // 認証チェックに失敗（ネットワークエラー等）
  if (allowedUser === 'error') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-4 px-6">
        <div className="text-4xl">⚠️</div>
        <p className="text-slate-300 text-center">認証の確認に失敗しました。<br />ネットワークを確認してください。</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-colors"
        >
          再試行
        </button>
      </div>
    )
  }

  // アクセス拒否
  if (allowedUser === false) {
    return <NotAllowedPage />
  }

  // 未ログイン → ログイン画面
  if (allowedUser === null) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6">
        <div className="max-w-sm w-full flex flex-col items-center gap-6 text-white">
          <div className="text-center">
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 56, letterSpacing: '.06em', lineHeight: 1, color: '#fff' }}>
              LEAP<span style={{ color: '#ff2255' }}>Booster</span>
            </div>
            <p className="text-slate-400 text-sm mt-2">英単語学習アプリ</p>
          </div>

          <div className="bg-slate-800 rounded-2xl p-5 w-full text-center">
            <p className="text-slate-300 text-sm leading-relaxed">
              このアプリは<span className="text-white font-bold">登録されたユーザー専用</span>です。<br />
              先生から案内されたGoogleアカウントでログインしてください。
            </p>
          </div>

          <button
            onClick={() => supabase.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: window.location.origin },
            })}
            className="w-full py-4 bg-white hover:bg-slate-100 text-slate-900 rounded-2xl font-bold text-lg transition-colors flex items-center justify-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Googleでログイン
          </button>

          <p className="text-slate-600 text-xs text-center">
            登録されていないGoogleアカウントではログインできません
          </p>
        </div>
      </div>
    )
  }

  return (
    <AllowedUserContext.Provider value={allowedUser}>
      <BrowserRouter>
        <AppRoutes
          allowedUser={allowedUser}
          showWelcome={showWelcome}
          onWelcomeClose={handleWelcomeClose}
          onWelcomeSettings={handleWelcomeClose}
        />
      </BrowserRouter>
    </AllowedUserContext.Provider>
  )
}

export default App
