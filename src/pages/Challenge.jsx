import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { useUserStats } from '../hooks/useUserStats'

const PARTS = ['Part1', 'Part2', 'Part3', 'Part4', 'α']
const GOAL = 30

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---- パート選択画面 ----
function PartSelect({ onStart }) {
  const [selected, setSelected] = useState(['Part1'])
  const [wordCounts, setWordCounts] = useState({})

  useEffect(() => {
    const fetchCounts = async () => {
      const counts = {}
      for (const p of PARTS) {
        counts[p] = await db.words.where('leapPart').equals(p).count()
      }
      setWordCounts(counts)
    }
    fetchCounts()
  }, [])

  function toggle(part) {
    setSelected(prev =>
      prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]
    )
  }

  const totalWords = PARTS.filter(p => selected.includes(p)).reduce((s, p) => s + (wordCounts[p] ?? 0), 0)

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">📖 30問チャレンジ</h1>
      <p className="text-slate-400 mb-8">出題するパートを選んでください</p>

      <div className="w-full max-w-sm flex flex-col gap-3 mb-8">
        {PARTS.map(part => (
          <button
            key={part}
            onClick={() => toggle(part)}
            className={`flex items-center justify-between w-full py-4 px-5 rounded-xl text-lg font-bold border-2 transition-all ${
              selected.includes(part)
                ? 'bg-blue-600 border-blue-400 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-400'
            }`}
          >
            <span>{part}</span>
            <span className="text-sm font-normal">
              {wordCounts[part] !== undefined ? `${wordCounts[part]}語` : '…'}
            </span>
          </button>
        ))}
      </div>

      <p className="text-slate-400 mb-6">
        {totalWords === 0
          ? '⚠️ 単語データがありません。設定からCSVをインポートしてください。'
          : `合計 ${totalWords} 語から ${Math.min(totalWords, GOAL)} 問出題`}
      </p>

      <button
        onClick={() => onStart(selected)}
        disabled={selected.length === 0 || totalWords === 0}
        className="w-full max-w-sm py-5 text-xl font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-2xl transition-colors"
      >
        スタート
      </button>
    </div>
  )
}

// ---- 出題画面 ----
function Quiz({ words, onClear, onGiveUp }) {
  const [current, setCurrent] = useState(0)
  const [streak, setStreak] = useState(0)
  const [shaking, setShaking] = useState(false)
  const [flipping, setFlipping] = useState(false)
  const navigate = useNavigate()

  const word = words[current]

  const counterColor =
    streak >= 28 ? 'text-red-400' :
    streak >= 20 ? 'text-amber-400' :
    'text-blue-400'

  async function handleKnow() {
    // cardsテーブルの正解カウントを更新
    const existing = await db.cards.where('wordId').equals(word.id).first()
    if (existing) {
      await db.cards.update(existing.id, {
        correctCount: (existing.correctCount ?? 0) + 1,
        lastReviewed: new Date(),
      })
    } else {
      await db.cards.add({ wordId: word.id, lastReviewed: new Date(), correctCount: 1, incorrectCount: 0 })
    }

    const next = streak + 1
    if (next >= GOAL) {
      onClear()
      return
    }

    setFlipping(true)
    setTimeout(() => {
      setStreak(next)
      setCurrent(prev => (prev + 1) % words.length)
      setFlipping(false)
    }, 180)
  }

  async function handleDontKnow() {
    // cardsテーブルの不正解カウントを更新
    const existing = await db.cards.where('wordId').equals(word.id).first()
    if (existing) {
      await db.cards.update(existing.id, {
        incorrectCount: (existing.incorrectCount ?? 0) + 1,
        lastReviewed: new Date(),
      })
    } else {
      await db.cards.add({ wordId: word.id, lastReviewed: new Date(), correctCount: 0, incorrectCount: 1 })
    }

    setShaking(true)
    setTimeout(() => {
      setShaking(false)
      setStreak(0)
      // シャッフルして先頭から
      setCurrent(0)
    }, 500)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center px-4 py-6 select-none">
      {/* 上部：カウンター */}
      <div className={`text-center mb-6 transition-all ${shaking ? 'animate-shake' : ''}`}>
        <div className={`text-7xl font-black tabular-nums ${counterColor} transition-colors duration-300`}>
          {streak}
        </div>
        <div className="text-slate-500 text-lg">/ {GOAL}</div>
      </div>

      {/* 進捗バー */}
      <div className="w-full max-w-sm h-2 bg-slate-700 rounded-full mb-8 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            streak >= 28 ? 'bg-red-500' : streak >= 20 ? 'bg-amber-500' : 'bg-blue-500'
          }`}
          style={{ width: `${(streak / GOAL) * 100}%` }}
        />
      </div>

      {/* 単語カード */}
      <div
        className={`w-full max-w-sm bg-slate-800 rounded-3xl p-8 mb-8 text-center transition-opacity duration-150 ${
          flipping ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="text-slate-500 text-sm mb-2">No. {word.leapNumber} ({word.leapPart})</div>
        <div className="text-5xl font-black tracking-tight mb-3">{word.word}</div>
        <div className="text-slate-500 text-sm">{word.partOfSpeech}</div>
      </div>

      {/* ボタン */}
      <div className="w-full max-w-sm flex gap-4">
        <button
          onClick={handleDontKnow}
          className="flex-1 py-5 text-xl font-bold bg-slate-700 hover:bg-slate-600 rounded-2xl transition-colors active:scale-95"
        >
          ❌ わからない
        </button>
        <button
          onClick={handleKnow}
          className="flex-1 py-5 text-xl font-bold bg-blue-600 hover:bg-blue-500 rounded-2xl transition-colors active:scale-95"
        >
          ✅ わかる
        </button>
      </div>

      {/* 中断ボタン */}
      <button
        onClick={() => navigate('/')}
        className="mt-6 text-slate-600 hover:text-slate-400 text-sm transition-colors"
      >
        中断してホームへ
      </button>
    </div>
  )
}

// ---- 紙吹雪 ----
function Confetti() {
  const colors = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#f97316']
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 1.5}s`,
    duration: `${1.5 + Math.random() * 1.5}s`,
    color: colors[i % colors.length],
    size: `${6 + Math.random() * 8}px`,
  }))

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {pieces.map(p => (
        <div
          key={p.id}
          className="absolute top-0 animate-confetti rounded-sm"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
    </div>
  )
}

// ---- クリア画面 ----
function ClearScreen({ parts, onRetry, onHome }) {
  const now = new Date()
  const dateStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center px-4 text-center">
      <Confetti />
      <div className="relative z-10">
        <div className="text-8xl mb-4">🏆</div>
        <h1 className="text-4xl font-black text-amber-400 mb-2">30問クリア！</h1>
        <p className="text-slate-400 mb-1">+10ポイント獲得</p>
        <p className="text-slate-500 text-sm mb-2">{parts.join(' + ')}</p>
        <p className="text-slate-600 text-sm mb-10">{dateStr}</p>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button
            onClick={onRetry}
            className="w-full py-5 text-xl font-bold bg-blue-600 hover:bg-blue-500 rounded-2xl transition-colors"
          >
            もう一度
          </button>
          <button
            onClick={onHome}
            className="w-full py-5 text-xl font-bold bg-slate-700 hover:bg-slate-600 rounded-2xl transition-colors"
          >
            ホームへ
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- メイン ----
export default function Challenge() {
  const [phase, setPhase] = useState('select') // 'select' | 'playing' | 'clear'
  const [words, setWords] = useState([])
  const [selectedParts, setSelectedParts] = useState([])
  const { recordChallengeClear } = useUserStats()
  const navigate = useNavigate()

  async function handleStart(parts) {
    const allWords = await db.words
      .where('leapPart')
      .anyOf(parts)
      .toArray()

    if (allWords.length === 0) return

    const shuffled = shuffle(allWords)
    // 30問以上あれば30問に絞る（足りない場合はループ用に複製）
    let pool = shuffled
    while (pool.length < GOAL) {
      pool = [...pool, ...shuffle(allWords)]
    }

    setSelectedParts(parts)
    setWords(pool)
    setPhase('playing')
  }

  async function handleClear() {
    await recordChallengeClear()
    await db.challengeHistory.add({
      date: new Date(),
      parts: selectedParts,
      result: GOAL,
      cleared: true,
    })
    setPhase('clear')
  }

  if (phase === 'select') {
    return <PartSelect onStart={handleStart} />
  }
  if (phase === 'playing') {
    return <Quiz words={words} onClear={handleClear} />
  }
  if (phase === 'clear') {
    return (
      <ClearScreen
        parts={selectedParts}
        onRetry={() => setPhase('select')}
        onHome={() => navigate('/')}
      />
    )
  }
}
