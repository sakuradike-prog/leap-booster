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

        // allowed_users チェック（タイムアウト8秒）
        let allowed = null
        try {
          const result = await Promise.race([
            supabase.from('allowed_users').select('nickname, role').eq('email', session.user.email).single(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
          ])
          if (!result.error && result.data) allowed = result.data
        } catch {
          // タイムアウトまたはネットワークエラー → 未ログイン扱いにせず再試行ボタンを表示
          setAllowedUser('error')
          return
        }

        if (!allowed) {
          await supabase.auth.signOut()
          setAllowedUser(false)
          setCurrentUserId(null)
          return
        }

        setAllowedUser({ nickname: allowed.nickname, role: allowed.role })

        // ニックネームを user_stats に同期
        syncDisplayName(uid, allowed.nickname)

        // 初回ログイン歓迎モーダル
        const welcomeKey = `vocaleap_welcomed_${uid}`
        if (!localStorage.getItem(welcomeKey)) {
          setShowWelcome(true)
        }

        migrateLocalDataToServer(uid)
        runSync(uid)
      } else if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
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

  // ログイン済みだが allowed_users 確認中
  if (currentUserId && allowedUser === undefined) {
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
