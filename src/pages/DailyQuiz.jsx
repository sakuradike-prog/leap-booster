import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { playCorrect, playWrong } from '../utils/sound'
import { speak } from '../utils/speak'
import { findRoots } from '../utils/findRoots'
import WordCard from '../components/WordCard'
import WordDetailScreen from '../components/WordDetailScreen'
import { useUserStats } from '../hooks/useUserStats'
import StreakToast from '../components/StreakToast'
import SessionCompleteOverlay from '../components/SessionCompleteOverlay'
import WordBadges from '../components/WordBadges'


const PARTS = ['Part1', 'Part2', 'Part3', 'Part4', 'α']
const QUESTIONS = 10

function getQuizTimerSecs() {
  const v = parseInt(localStorage.getItem('quizTimerSecs'), 10)
  return (!isNaN(v) && v >= 3 && v <= 15) ? v : 10
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---- パート選択画面 ----
const PRACTICE_LAST_PART_KEY = 'vocaleap_practice_last_part'

function PartSelect({ onStart }) {
  const [selected, setSelected] = useState(() => {
    try {
      const saved = localStorage.getItem(PRACTICE_LAST_PART_KEY)
      return saved ? JSON.parse(saved) : ['Part1']
    } catch {
      return ['Part1']
    }
  })
  const [wordCounts, setWordCounts] = useState({})
  const navigate = useNavigate()

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
    setSelected(prev => {
      const next = prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]
      try { localStorage.setItem(PRACTICE_LAST_PART_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center px-4 py-8">
      <button
        onClick={() => navigate('/')}
        className="self-start text-slate-400 hover:text-white mb-6 text-sm"
      >
        ← 戻る
      </button>

      <h1 className="text-2xl font-bold mb-1">💡 4択練習</h1>
      <p className="text-slate-400 text-sm mb-6">ポイントなし・何度でも挑戦できる</p>

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

      <button
        onClick={() => onStart(selected)}
        disabled={selected.length === 0}
        className="w-full max-w-sm py-5 text-xl font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-2xl transition-colors"
      >
        スタート
      </button>
    </div>
  )
}

// ── studyCount +1（出題ごと）──
async function saveStudyCountBatch(words) {
  for (const word of words) {
    if (!word?.id) continue
    try {
      const existing = await db.cards.where('wordId').equals(word.id).first()
      if (existing) {
        await db.cards.update(existing.id, {
          studyCount: (existing.studyCount ?? 0) + 1,
          lastReviewed: new Date(),
        })
      } else {
        await db.cards.add({
          wordId: word.id,
          lastReviewed: new Date(),
          correctCount: 0,
          incorrectCount: 0,
          studyCount: 1,
        })
      }
    } catch { /* ignore */ }
  }
}

// ---- 出題画面 ----
function QuizScreen({ questions, onFinish, onHome }) {
  const [qIdx, setQIdx] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [choicesVisible, setChoicesVisible] = useState(false)
  const [timeLimit] = useState(getQuizTimerSecs)
  const [timeLeft, setTimeLeft] = useState(() => getQuizTimerSecs())
  const [scoreDisplay, setScoreDisplay] = useState(0)

  const scoreRef = useRef(0)
  const revealedRef = useRef(false)
  const choicesRef = useRef(null)

  const q = questions[qIdx]

  useEffect(() => {
    revealedRef.current = false
    setSelectedChoice(null)
    setRevealed(false)
    setChoicesVisible(false)
    setTimeLeft(timeLimit)
    speak(questions[qIdx].word.word, 'en-US', 0.85)

    const timerId = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerId)
          if (!revealedRef.current) {
            revealedRef.current = true
            setChoicesVisible(true)
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

  async function advance(currentQIdx) {
    const nextIdx = currentQIdx + 1
    if (nextIdx >= questions.length) {
      // 全問終了 → 全単語の学習履歴を保存
      await saveStudyCountBatch(questions.map(q => q.word))
      onFinish({ score: scoreRef.current, words: questions.map(q => q.word) })
    } else {
      setQIdx(nextIdx)
    }
  }

  function handleAnswer(choiceIdx) {
    if (revealedRef.current) return
    revealedRef.current = true
    const isCorrect = choiceIdx === q.correctIdx

    if (isCorrect) {
      playCorrect()
      scoreRef.current += 1
      setScoreDisplay(s => s + 1)
    } else {
      playWrong()
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
        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${(qIdx / questions.length) * 100}%` }}
          />
        </div>
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ease-linear duration-1000 ${timeLeft <= 3 ? 'bg-red-500' : 'bg-amber-400'}`}
            style={{ width: `${(timeLeft / timeLimit) * 100}%` }}
          />
        </div>
      </div>

      <div className="text-slate-500 text-sm mb-4">{scoreDisplay} 問正解中</div>

      {/* 単語カード（タップで再読み上げ） */}
      <div
        className="w-full max-w-sm bg-slate-800 rounded-2xl px-6 py-6 text-center mb-6 active:opacity-70 transition-opacity"
        onClick={() => speak(q.word.word, 'en-US', 0.85)}
      >
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="text-slate-500 text-sm">{q.word.leapPart} No.{q.word.leapNumber}</span>
          <WordBadges isCaptured={q.isCaptured} />
        </div>
        <div
          className="font-black tracking-tight mb-1 leading-tight"
          style={{
            fontSize: q.word.word.length <= 10 ? '3rem'
              : q.word.word.length <= 13 ? '2.25rem'
              : q.word.word.length <= 17 ? '1.75rem' : '1.375rem',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
          }}
        >
          {q.word.word}
        </div>
        <div className="text-slate-500 text-sm mt-1">{q.word.partOfSpeech}</div>
      </div>

      {!choicesVisible ? (
        <div className="w-full max-w-sm">
          <button
            onClick={() => {
              setChoicesVisible(true)
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
                })
              })
            }}
            className="w-full py-5 text-xl font-bold bg-slate-700 hover:bg-slate-600 border-2 border-slate-500 rounded-2xl transition-all active:scale-95"
          >
            💡 答えを見る
          </button>
          <p className="text-center text-slate-600 text-xs mt-3">
            頭の中で意味を考えてからタップ
          </p>
          <button
            onClick={async () => {
              // 途中終了 → 出題済み単語（0〜qIdx）の学習履歴を保存
              await saveStudyCountBatch(questions.slice(0, qIdx + 1).map(q => q.word))
              onHome()
            }}
            className="w-full mt-3 py-3 text-slate-500 hover:text-slate-300 text-sm transition-colors"
          >
            終了してメニューへ
          </button>
        </div>
      ) : (
        <div ref={choicesRef} className="w-full max-w-sm flex flex-col gap-3">
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

          {revealed && selectedChoice === -1 && (
            <div className="mt-2 text-red-400 font-bold animate-pulse text-center">⏰ 時間切れ！</div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- 結果画面（解説ボタン付き） ----
function ResultScreen({ score, onReview, onHome }) {
  const emoji =
    score === QUESTIONS ? '🎉' :
    score >= 8 ? '😄' :
    score >= 5 ? '👍' : '💪'

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center px-4 text-center">
      <div className="text-7xl mb-4">{emoji}</div>
      <h2 className="text-5xl font-black text-blue-400 mb-1">{score} / {QUESTIONS}</h2>
      <p className="text-slate-400 mb-8">正解数</p>

      <div className="w-full max-w-sm flex flex-col gap-4">
        <button
          onClick={onReview}
          className="w-full py-5 text-xl font-bold bg-amber-600 hover:bg-amber-500 rounded-2xl transition-colors"
        >
          📖 解説を始める
        </button>
        <button
          onClick={onHome}
          className="w-full py-5 text-xl font-bold bg-slate-700 hover:bg-slate-600 rounded-2xl transition-colors"
        >
          ホームへ
        </button>
      </div>
    </div>
  )
}

// ---- 単語解説スライドショー（CMBreak風・タイトルなし） ----
// ReviewSlideshow → 共通 WordDetailScreen を使用
// 「← 戻る」でホームへ
function ReviewSlideshow({ words, onHome }) {
  if (!words || words.length === 0) return null
  return (
    <WordDetailScreen
      word={words[0]}
      sessionWords={words}
      initialIndex={0}
      backLabel="終了する"
      backAsLink={true}
      onBack={onHome}
    />
  )
}

// ---- メイン ----
export default function DailyQuiz() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('select')
  const [questions, setQuestions] = useState([])
  const [score, setScore] = useState(0)
  const [reviewWords, setReviewWords] = useState([])
  const [selectedParts, setSelectedParts] = useState([])
  const [streakToast, setStreakToast] = useState(null)
  const [showSessionOverlay, setShowSessionOverlay] = useState(false)
  const { recordStudy } = useUserStats()

  async function handleStart(parts) {
    const allWords = await db.words.where('leapPart').anyOf(parts).toArray()
    if (allWords.length < 4) return

    const pool = shuffle(allWords).slice(0, QUESTIONS)
    const allMeanings = allWords.map(w => w.meaning)

    const capturedEntries = await db.captured_words.toArray()
    const capturedNums = new Set(capturedEntries.map(c => c.leapNumber))

    const qs = pool.map(word => {
      const wrongs = shuffle(allMeanings.filter(m => m !== word.meaning)).slice(0, 3)
      const correctIdx = Math.floor(Math.random() * 4)
      const choices = [...wrongs]
      choices.splice(correctIdx, 0, word.meaning)
      return { word, choices, correctIdx, isCaptured: capturedNums.has(word.leapNumber) }
    })

    setSelectedParts(parts)
    setQuestions(qs)
    setPhase('playing')
  }

  async function handleFinish(res) {
    setScore(res.score)
    setReviewWords(res.words ?? [])
    const result = await recordStudy()
    if (result.streakUpdated) setStreakToast(result.currentStreak)
    setShowSessionOverlay(true)
    setPhase('result')
  }

  if (phase === 'select') {
    return <PartSelect onStart={handleStart} />
  }
  if (phase === 'playing') {
    return <QuizScreen questions={questions} onFinish={handleFinish} onHome={() => navigate('/')} />
  }
  if (phase === 'result') {
    return (
      <>
        {showSessionOverlay && (
          <SessionCompleteOverlay
            label="セッション完了！"
            onDone={() => {
              setShowSessionOverlay(false)
              if (streakToast !== null) {
                // StreakToastはオーバーレイ消去後に表示するため phase を一時変更
                setPhase('streak')
              }
            }}
          />
        )}
        <ResultScreen
          score={score}
          onReview={() => setPhase('review')}
          onHome={() => navigate('/')}
        />
      </>
    )
  }
  if (phase === 'streak') {
    return <StreakToast streak={streakToast} onDone={() => { setStreakToast(null); setPhase('result') }} />
  }
  if (phase === 'review') {
    return <ReviewSlideshow words={reviewWords} onHome={() => navigate('/')} />
  }
  return null
}
