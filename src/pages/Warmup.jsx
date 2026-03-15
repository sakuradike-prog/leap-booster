import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { useUserStats } from '../hooks/useUserStats'
import WordCard from '../components/WordCard'

const PARTS = ['すべて', 'Part1', 'Part2', 'Part3', 'Part4', 'α']
const SESSION_OPTIONS = [5, 10, 15, 20]
const DEFAULT_SESSION = 10

// ────────────────────────────────────────────
// データ取得
// ────────────────────────────────────────────
async function fetchQuestions(part, count) {
  let query = part === 'すべて'
    ? db.warmupSentences.toCollection()
    : db.warmupSentences.where('leapPart').equals(part)

  const all = await query.toArray()
  if (all.length === 0) return []

  // ランダムシャッフルして count 件取得
  const shuffled = [...all].sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, count)

  // leapNumber から wordId を取得して付加（WordCard・studyCount用）
  const leapNumbers = [...new Set(selected.map(s => s.leapNumber).filter(Boolean))]
  if (leapNumbers.length > 0) {
    const wordRecords = await db.words.where('leapNumber').anyOf(leapNumbers).toArray()
    const wordIdMap = Object.fromEntries(wordRecords.map(w => [w.leapNumber, w.id]))
    return selected.map(s => ({ ...s, wordId: wordIdMap[s.leapNumber] ?? null }))
  }
  return selected
}

// ────────────────────────────────────────────
// セッション選択画面
// ────────────────────────────────────────────
function SelectScreen({ onStart }) {
  const [selectedPart, setSelectedPart] = useState('すべて')
  const [sessionCount, setSessionCount] = useState(DEFAULT_SESSION)
  const [totalCount, setTotalCount] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      const count = selectedPart === 'すべて'
        ? await db.warmupSentences.count()
        : await db.warmupSentences.where('leapPart').equals(selectedPart).count()
      setTotalCount(count)
    }
    load()
  }, [selectedPart])

  async function handleStart() {
    const questions = await fetchQuestions(selectedPart, sessionCount)
    if (questions.length === 0) return
    onStart(questions)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col px-4 py-8">
      <div className="max-w-sm mx-auto w-full">

        {/* ヘッダー */}
        <div className="flex items-center mb-8">
          <button
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-white mr-4 text-lg"
          >← 戻る</button>
          <div>
            <h1 className="text-2xl font-bold">⚡ 瞬間英作文</h1>
            <p className="text-slate-500 text-xs mt-0.5">日本語 → 英語 自己採点式</p>
          </div>
        </div>

        {totalCount === 0 && (
          <div className="mb-6 p-4 bg-amber-900/30 border border-amber-700 rounded-xl text-amber-300 text-sm">
            ⚠️ 例文データが未ロードです。アプリを再起動してください。
          </div>
        )}

        {/* パート選択 */}
        <div className="mb-7">
          <p className="text-slate-400 text-sm font-bold mb-3">出題パート</p>
          <div className="flex flex-wrap gap-2">
            {PARTS.map(p => (
              <button
                key={p}
                onClick={() => setSelectedPart(p)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  selectedPart === p
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >{p}</button>
            ))}
          </div>
          {totalCount > 0 && (
            <p className="text-slate-600 text-xs mt-2">{totalCount.toLocaleString()}問から出題</p>
          )}
        </div>

        {/* 問題数選択 */}
        <div className="mb-8">
          <p className="text-slate-400 text-sm font-bold mb-3">1セッションの問題数</p>
          <div className="flex gap-2">
            {SESSION_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => setSessionCount(n)}
                className={`flex-1 py-3 rounded-xl text-base font-bold transition-all ${
                  sessionCount === n
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >{n}問</button>
            ))}
          </div>
        </div>

        {/* スタートボタン */}
        <button
          onClick={handleStart}
          disabled={totalCount === 0}
          className="w-full py-5 text-xl font-bold bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-2xl transition-colors active:scale-95"
        >
          スタート
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────
// 問題カード（1問）
// ────────────────────────────────────────────
function QuizCard({ question, questionNumber, totalQuestions, onCorrect, onRetry, onReveal }) {
  const [revealed, setRevealed] = useState(false)

  // 問題が切り替わったら必ず折り畳む
  useEffect(() => { setRevealed(false) }, [question])

  function handleReveal() {
    setRevealed(true)
    onReveal?.()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col px-5 py-8">

      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-slate-500 text-sm font-bold">
          No.{question.leapNumber} &nbsp;
          <span className="text-slate-400">{question.leapPart}</span>
        </span>
        <span className="text-slate-500 text-sm font-bold tabular-nums">
          {questionNumber} / {totalQuestions}
        </span>
      </div>

      {/* 単語名（WordCard でフリップ可能） */}
      <div className="mb-6 flex items-center gap-2">
        {question.wordId ? (
          <WordCard
            word={{ id: question.wordId, word: question.word }}
            textClassName="text-amber-400 text-lg font-bold tracking-tight"
          />
        ) : (
          <span className="text-amber-400 text-lg font-bold tracking-tight">{question.word}</span>
        )}
        {question.exampleTotal > 1 && (
          <span className="text-slate-600 text-sm">
            ({question.exampleIndex}/{question.exampleTotal})
          </span>
        )}
      </div>

      {/* 日本語（問題） */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="bg-slate-900 rounded-2xl px-6 py-8 mb-6 text-center border border-slate-800">
            <p className="text-2xl font-bold leading-relaxed text-slate-100">
              {question.questionJa}
            </p>
          </div>

          {!revealed ? (
            /* 答えを見るボタン */
            <button
              onClick={handleReveal}
              className="w-full py-5 text-lg font-bold bg-blue-600 hover:bg-blue-500 rounded-2xl transition-colors active:scale-95"
            >
              答えを見る
            </button>
          ) : (
            /* 英文 + 採点ボタン */
            <div>
              <div className="bg-blue-950/60 border border-blue-800/50 rounded-2xl px-6 py-5 mb-5 text-center">
                <p className="text-xl font-bold text-blue-200 leading-relaxed">
                  {question.answerEn}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onCorrect}
                  className="flex-1 py-5 text-lg font-bold bg-emerald-600 hover:bg-emerald-500 rounded-2xl transition-colors active:scale-95"
                >
                  できた ✓
                </button>
                <button
                  onClick={onRetry}
                  className="flex-1 py-5 text-lg font-bold bg-slate-700 hover:bg-slate-600 rounded-2xl transition-colors active:scale-95"
                >
                  もう一度 ↺
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────
// クイズ進行管理
// ────────────────────────────────────────────
function QuizScreen({ initialQuestions, onComplete }) {
  // queue: 出題キュー（末尾に追加することでリトライを実現）
  const [queue, setQueue] = useState(initialQuestions)
  const [correctCount, setCorrectCount] = useState(0)
  const [answered, setAnswered] = useState(0)
  const total = initialQuestions.length

  const current = queue[0]

  // 答えを見たときに studyCount を +1（出題1回につき1カウント）
  const handleReveal = useCallback(async () => {
    if (!current?.wordId) return
    try {
      const existing = await db.cards.where('wordId').equals(current.wordId).first()
      if (existing) {
        await db.cards.update(existing.id, {
          studyCount: (existing.studyCount ?? 0) + 1,
          lastReviewed: new Date(),
        })
      } else {
        await db.cards.add({
          wordId: current.wordId,
          lastReviewed: new Date(),
          correctCount: 0,
          incorrectCount: 0,
          studyCount: 1,
        })
      }
    } catch { /* ignore */ }
  }, [current])

  const handleCorrect = useCallback(() => {
    setCorrectCount(c => c + 1)
    setAnswered(a => a + 1)
    const next = queue.slice(1)
    if (next.length === 0) {
      onComplete(correctCount + 1, total)
    } else {
      setQueue(next)
    }
  }, [queue, correctCount, total, onComplete])

  const handleRetry = useCallback(() => {
    setAnswered(a => a + 1)
    // 末尾に追加してリトライ
    const [head, ...rest] = queue
    const next = [...rest, head]
    setQueue(next)
  }, [queue])

  if (!current) return null

  return (
    <QuizCard
      question={current}
      questionNumber={answered + 1}
      totalQuestions={total + queue.filter((q, i) => i > 0 && initialQuestions.indexOf(q) === -1 ? false : true).length}
      onCorrect={handleCorrect}
      onRetry={handleRetry}
      onReveal={handleReveal}
    />
  )
}

// ────────────────────────────────────────────
// 完了画面
// ────────────────────────────────────────────
function CompleteScreen({ correctCount, totalCount, onRetry, onHome }) {
  const ratio = totalCount > 0 ? correctCount / totalCount : 0
  const emoji = ratio >= 0.9 ? '🏆' : ratio >= 0.7 ? '⭐' : ratio >= 0.5 ? '👍' : '💪'
  const message = ratio >= 0.9 ? '完璧！' : ratio >= 0.7 ? 'よくできました！' : ratio >= 0.5 ? 'まずまずです' : 'もう一度チャレンジ！'

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center px-4 text-center">
      <div className="text-7xl mb-5">{emoji}</div>
      <h1 className="text-3xl font-black text-amber-400 mb-2">{message}</h1>
      <p className="text-slate-400 text-lg mb-1">
        できた: <span className="text-emerald-400 font-bold text-2xl">{correctCount}</span>
        <span className="text-slate-600"> / {totalCount}問</span>
      </p>
      <p className="text-slate-600 text-sm mb-10">+{correctCount}ポイント獲得</p>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={onRetry}
          className="w-full py-5 text-xl font-bold bg-amber-600 hover:bg-amber-500 rounded-2xl transition-colors active:scale-95"
        >
          もう一度
        </button>
        <button
          onClick={onHome}
          className="w-full py-5 text-xl font-bold bg-slate-700 hover:bg-slate-600 rounded-2xl transition-colors active:scale-95"
        >
          ホームへ
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────
// メイン
// ────────────────────────────────────────────
export default function Warmup() {
  const [phase, setPhase] = useState('select')
  const [questions, setQuestions] = useState([])
  const [result, setResult] = useState({ correct: 0, total: 0 })
  const navigate = useNavigate()
  const { recordStudy } = useUserStats()

  async function addPoints(pts) {
    const s = await db.userStats.get(1)
    if (s) await db.userStats.update(1, { totalPoints: (s.totalPoints ?? 0) + pts })
  }

  async function handleComplete(correctCount, totalCount) {
    setResult({ correct: correctCount, total: totalCount })
    await recordStudy()
    await addPoints(correctCount)
    setPhase('complete')
  }

  if (phase === 'select') {
    return (
      <SelectScreen
        onStart={qs => { setQuestions(qs); setPhase('quiz') }}
      />
    )
  }

  if (phase === 'quiz') {
    return (
      <QuizScreen
        initialQuestions={questions}
        onComplete={handleComplete}
      />
    )
  }

  if (phase === 'complete') {
    return (
      <CompleteScreen
        correctCount={result.correct}
        totalCount={result.total}
        onRetry={() => setPhase('select')}
        onHome={() => navigate('/')}
      />
    )
  }
}
