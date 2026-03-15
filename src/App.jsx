import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Challenge from './pages/Challenge'
import Warmup from './pages/Warmup'
import Stats from './pages/Stats'
import Settings from './pages/Settings'
import DailyQuiz from './pages/DailyQuiz'
import StudyHistory from './pages/StudyHistory'
import { db } from './db/database'
import { importCSVFromUrl } from './utils/importFromCSV'
import { loadWordFamilies } from './utils/loadWordFamilies'
import { loadRoots } from './utils/loadRoots'
import { loadExamples } from './utils/loadExamples'

function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function initDB() {
      try {
        const count = await db.words.count()
        if (count === 0) {
          await importCSVFromUrl('/data/leap_words.csv', false)
        }
        // 語族データのロード（未ロードの場合のみ）
        await loadWordFamilies()
        // 語源データのロード（未ロードの場合のみ）
        await loadRoots()
        // 例文データのロード（warmupSentences を差し替え）
        await loadExamples()
      } catch (err) {
        setError(err.message)
      } finally {
        setReady(true)
      }
    }
    initDB()
  }, [])

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

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/challenge" element={<Challenge />} />
        <Route path="/warmup" element={<Warmup />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/daily" element={<DailyQuiz />} />
        <Route path="/study-history" element={<StudyHistory />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
