import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { useUserStats } from '../hooks/useUserStats'

const PARTS = ['Part1', 'Part2', 'Part3', 'Part4', 'α']
const QUESTIONS = 10
const TIME_LIMIT = 10 // seconds per question

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function isSameDay(a, b) {
  const da = new Date(a), db2 = new Date(b)
  return da.getFullYear() === db2.getFullYear() &&
    da.getMonth() === db2.getMonth() &&
    da.getDate() === db2.getDate()
}

// パート選択に応じたボーナスを計算
function calcPartBonus(selected) {
  if (selected.includes('α')) return 4
  if (selected.includes('Part4')) return 3
  if (selected.includes('Part3')) return 2
  if (selected.includes('Part2')) return 1
  return 0
}

// ---- パート選択画面 ----
function PartSelect({ onStart, alreadyDone }) {
  const [selected, setSelected] = useState(['Part1'])
  const [wordCounts, setWordCounts] = useState({})

  useEffect(() => {
    async function fetchCounts() {
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

  const partBonus = calcPartBonus(selected)
  const maxPoints = QUESTIONS + partBonus + 1 // 全正解 + パートボーナス + タイムボーナス

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center px-4 py-8">
      <button
        onClick={() => window.history.back()}
        className="self-start text-slate-400 hover:text-white mb-6 text-sm"
      >
        ← 戻る
      </button>

      <h1 className="text-2xl font-bold mb-1">⚡ 10問デイリークイズ</h1>
      <p className="text-slate-400 text-sm mb-6">今日1回限り・4択クイズ</p>

      {alreadyDone && (
        <div className="w-full max-w-sm mb-6 p-4 bg-amber-900/30 border border-amber-700 rounded-xl text-amber-300 text-sm text-center">
          今日はすでに受験済みです。明日また挑戦しよう！
        </div>
      )}

      <div className="w-full max-w-sm flex flex-col gap-3 mb-6">
        {PARTS.map(part => (
          <button
            key={part}
            onClick={() => !alreadyDone && toggle(part)}
            disabled={alreadyDone}
            className={`flex items-center justify-between w-full py-4 px-5 rounded-xl text-lg font-bold border-2 transition-all ${
              selected.includes(part)
                ? 'bg-blue-600 border-blue-400 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-400'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span>{part}</span>
            <span className="text-sm font-normal">
              {wordCounts[part] !== undefined ? `${wordCounts[part]}語` : '…'}
            </span>
          </button>
        ))}
      </div>

      {/* ポイントプレビュー */}
      <div className="w-full max-w-sm bg-slate-800 rounded-xl p-4 mb-6 text-sm">
        <div className="text-slate-400 font-bold mb-3">獲得できるポイント</div>
        <div className="flex justify-between mb-1">
          <span className="text-slate-300">正解ポイント（最大）</span>
          <span className="text-blue-400 font-bold">{QUESTIONS}pt</span>
        </div>
        <div className="flex justify-between mb-1">
          <span className="text-slate-300">パートボーナス</span>
          <span className="text-amber-400 font-bold">+{partBonus}pt</span>
        </div>
        <div className="flex justify-between mb-3">
          <span className="text-slate-300">タイムボーナス（平均3秒以内）</span>
          <span className="text-green-400 font-bold">+1pt</span>
        </div>
        <div className="border-t border-slate-700 pt-2 flex justify-between font-bold">
          <span className="text-white">最大獲得ポイント</span>
          <span className="text-amber-400">{maxPoints}pt</span>
        </div>
      </div>

      <button
        onClick={() => onStart(selected)}
        disabled={selected.length === 0 || alreadyDone}
        className="w-full max-w-sm py-5 text-xl font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-2xl transition-colors"
      >
        スタート
      </button>
    </div>
  )
}

// ---- 出題画面 ----
function QuizScreen({ questions, onFinish }) {
  const [qIdx, setQIdx] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT)
  const [scoreDisplay, setScoreDisplay] = useState(0)

  const scoreRef = useRef(0)
  const responseTimesRef = useRef([])
  const startTimeRef = useRef(Date.now())
  const revealedRef = useRef(false)

  const q = questions[qIdx]

  // 問題が変わるたびにタイマーをリセット
  useEffect(() => {
    revealedRef.current = false
    setSelectedChoice(null)
    setRevealed(false)
    setTimeLeft(TIME_LIMIT)
    startTimeRef.current = Date.now()

    const timerId = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerId)
          if (!revealedRef.current) {
            revealedRef.current = true
            responseTimesRef.current.push(TIME_LIMIT)
            setSelectedChoice(-1)
            setRevealed(true)
            setTimeout(() => advance(qIdx), 1500)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timerId)
  }, [qIdx]) // eslint-disable-line

  function advance(currentQIdx) {
    const nextIdx = currentQIdx + 1
    if (nextIdx >= questions.length) {
      const times = responseTimesRef.current
      const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : TIME_LIMIT
      onFinish({ score: scoreRef.current, timeBonus: avg <= 3 ? 1 : 0 })
    } else {
      setQIdx(nextIdx)
    }
  }

  function handleAnswer(choiceIdx) {
    if (revealedRef.current) return
    revealedRef.current = true
    const elapsed = (Date.now() - startTimeRef.current) / 1000
    responseTimesRef.current.push(elapsed)
    const isCorrect = choiceIdx === q.correctIdx
    if (isCorrect) {
      scoreRef.current += 1
      setScoreDisplay(s => s + 1)
    }
    setSelectedChoice(choiceIdx)
    setRevealed(true)
    setTimeout(() => advance(qIdx), 1200)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center px-4 py-6">
      {/* 進捗 + タイマー */}
      <div className="w-full max-w-sm mb-4">
        <div className="flex justify-between text-sm text-slate-400 mb-1">
          <span>{qIdx + 1} / {questions.length}</span>
          <span className={timeLeft <= 3 ? 'text-red-400 font-bold animate-pulse' : ''}>{timeLeft}秒</span>
        </div>
        {/* 問題進捗バー */}
        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${(qIdx / questions.length) * 100}%` }}
          />
        </div>
        {/* タイムバー */}
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ease-linear duration-1000 ${timeLeft <= 3 ? 'bg-red-500' : 'bg-amber-400'}`}
            style={{ width: `${(timeLeft / TIME_LIMIT) * 100}%` }}
          />
        </div>
      </div>

      <div className="text-slate-500 text-sm mb-4">{scoreDisplay} 問正解中</div>

      {/* 単語カード */}
      <div className="w-full max-w-sm bg-slate-800 rounded-2xl p-8 text-center mb-6">
        <div className="text-slate-500 text-sm mb-1">{q.word.leapPart} No.{q.word.leapNumber}</div>
        <div className="text-5xl font-black mb-2">{q.word.word}</div>
        <div className="text-slate-500 text-sm">{q.word.partOfSpeech}</div>
      </div>

      {/* 4択 */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        {q.choices.map((choice, i) => {
          let cls = 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700 active:scale-95'
          if (revealed) {
            if (i === q.correctIdx) cls = 'bg-green-800 border-green-500 text-white'
            else if (i === selectedChoice) cls = 'bg-red-900 border-red-600 text-white'
            else cls = 'bg-slate-800 border-slate-700 text-slate-500 opacity-50'
          }
          return (
            <button
              key={i}
              onClick={() => handleAnswer(i)}
              disabled={revealed}
              className={`w-full py-4 px-5 border-2 rounded-xl text-left font-medium transition-all ${cls}`}
            >
              <span className="text-slate-400 font-bold mr-3 text-sm">{['A', 'B', 'C', 'D'][i]}</span>
              {choice}
            </button>
          )
        })}
      </div>

      {revealed && selectedChoice === -1 && (
        <div className="mt-4 text-red-400 font-bold animate-pulse">⏰ 時間切れ！</div>
      )}
    </div>
  )
}

// ---- 結果画面 ----
function ResultScreen({ result, onHome }) {
  const { score, partBonus, timeBonus } = result
  const totalPoints = score + partBonus + timeBonus

  const emoji =
    score === QUESTIONS ? '🎉' :
    score >= 8 ? '😄' :
    score >= 5 ? '👍' : '💪'

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center px-4 text-center">
      <div className="text-7xl mb-4">{emoji}</div>
      <h2 className="text-5xl font-black text-blue-400 mb-1">{score} / {QUESTIONS}</h2>
      <p className="text-slate-400 mb-8">正解数</p>

      {/* ポイント内訳 */}
      <div className="w-full max-w-sm bg-slate-800 rounded-2xl p-5 mb-8 text-sm">
        <h3 className="text-slate-300 font-bold mb-3 text-base">ポイント内訳</h3>
        <div className="flex justify-between mb-1">
          <span className="text-slate-400">正解ポイント</span>
          <span className="text-blue-400 font-bold">+{score}pt</span>
        </div>
        <div className="flex justify-between mb-1">
          <span className="text-slate-400">パートボーナス</span>
          <span className="text-amber-400 font-bold">+{partBonus}pt</span>
        </div>
        <div className="flex justify-between mb-3">
          <span className="text-slate-400">タイムボーナス</span>
          <span className={`font-bold ${timeBonus > 0 ? 'text-green-400' : 'text-slate-600'}`}>
            {timeBonus > 0 ? '+1pt' : '±0pt'}
          </span>
        </div>
        <div className="border-t border-slate-700 pt-3 flex justify-between font-bold text-base">
          <span className="text-white">合計獲得ポイント</span>
          <span className="text-amber-400">+{totalPoints}pt</span>
        </div>
      </div>

      <button
        onClick={onHome}
        className="w-full max-w-sm py-5 text-xl font-bold bg-blue-600 hover:bg-blue-500 rounded-2xl transition-colors"
      >
        ホームへ
      </button>
    </div>
  )
}

// ---- メイン ----
export default function DailyQuiz() {
  const navigate = useNavigate()
  const { recordDailyQuiz } = useUserStats()
  const [phase, setPhase] = useState('select')
  const [alreadyDone, setAlreadyDone] = useState(false)
  const [questions, setQuestions] = useState([])
  const [selectedParts, setSelectedParts] = useState([])
  const [result, setResult] = useState(null)

  // 今日受験済みか確認
  useEffect(() => {
    db.userStats.get(1).then(s => {
      if (s?.dailyQuizLastDate && isSameDay(s.dailyQuizLastDate, new Date())) {
        setAlreadyDone(true)
      }
    })
  }, [])

  async function handleStart(parts) {
    const allWords = await db.words.where('leapPart').anyOf(parts).toArray()
    if (allWords.length < 4) return

    const pool = shuffle(allWords).slice(0, QUESTIONS)
    const allMeanings = allWords.map(w => w.meaning)

    const qs = pool.map(word => {
      const wrongs = shuffle(allMeanings.filter(m => m !== word.meaning)).slice(0, 3)
      const correctIdx = Math.floor(Math.random() * 4)
      const choices = [...wrongs]
      choices.splice(correctIdx, 0, word.meaning)
      return { word, choices, correctIdx }
    })

    setSelectedParts(parts)
    setQuestions(qs)
    setPhase('playing')
  }

  async function handleFinish(res) {
    const partBonus = calcPartBonus(selectedParts)
    const totalPoints = res.score + partBonus + res.timeBonus
    await recordDailyQuiz(totalPoints)
    setResult({ ...res, partBonus })
    setPhase('result')
  }

  if (phase === 'select') {
    return <PartSelect onStart={handleStart} alreadyDone={alreadyDone} />
  }
  if (phase === 'playing') {
    return <QuizScreen questions={questions} onFinish={handleFinish} />
  }
  if (phase === 'result') {
    return <ResultScreen result={result} onHome={() => navigate('/')} />
  }
}
