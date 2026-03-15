import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { useUserStats } from '../hooks/useUserStats'
import { findRoots } from '../utils/findRoots'
import WordCard from '../components/WordCard'

const PARTS = ['すべて', 'Part1', 'Part2', 'Part3', 'Part4', 'α']
const SESSION_COUNT = 5

// ── speech helper ──────────────────────────
function speak(text, lang = 'en-US', rate = 0.85) {
  try {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang
    utter.rate = rate
    window.speechSynthesis.speak(utter)
  } catch { /* ignore */ }
}

// ── データ取得 ──────────────────────────────
async function fetchQuestions(part, count) {
  let query = part === 'すべて'
    ? db.warmupSentences.toCollection()
    : db.warmupSentences.where('leapPart').equals(part)

  const all = await query.toArray()
  if (all.length === 0) return []

  const shuffled = [...all].sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, count)

  const leapNumbers = [...new Set(selected.map(s => s.leapNumber).filter(Boolean))]
  if (leapNumbers.length > 0) {
    const wordRecords = await db.words.where('leapNumber').anyOf(leapNumbers).toArray()
    const wordMap = Object.fromEntries(wordRecords.map(w => [w.leapNumber, w]))
    return selected.map(s => ({
      ...s,
      wordId: wordMap[s.leapNumber]?.id ?? null,
      wordObj: wordMap[s.leapNumber] ?? null,
    }))
  }
  return selected
}

// ── studyCount +1（問題表示ごと・1問1回のみ）──
async function incrementStudyCount(wordId) {
  if (!wordId) return
  try {
    const existing = await db.cards.where('wordId').equals(wordId).first()
    if (existing) {
      await db.cards.update(existing.id, {
        studyCount: (existing.studyCount ?? 0) + 1,
        lastReviewed: new Date(),
      })
    } else {
      await db.cards.add({
        wordId,
        lastReviewed: new Date(),
        correctCount: 0,
        incorrectCount: 0,
        studyCount: 1,
      })
    }
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────
// SelectScreen
// ─────────────────────────────────────────────
function SelectScreen({ onStart }) {
  const [selectedPart, setSelectedPart] = useState('すべて')
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
    const questions = await fetchQuestions(selectedPart, SESSION_COUNT)
    if (questions.length === 0) return
    onStart(questions)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col px-4 py-8">
      <div className="max-w-sm mx-auto w-full">

        <div className="flex items-center mb-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white mr-4 text-lg">← 戻る</button>
          <div>
            <h1 className="text-2xl font-bold">⚡ 瞬間英作文</h1>
            <p className="text-slate-500 text-xs mt-0.5">声に出して繰り返し練習しよう</p>
          </div>
        </div>

        {totalCount === 0 && (
          <div className="mb-6 p-4 bg-amber-900/30 border border-amber-700 rounded-xl text-amber-300 text-sm">
            ⚠️ 例文データが未ロードです。アプリを再起動してください。
          </div>
        )}

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

// ─────────────────────────────────────────────
// WordDetailScreen（CM Breakの単語表示と同レイアウト）
// ─────────────────────────────────────────────
function WordDetailScreen({ question, onBack }) {
  const [allRoots, setAllRoots] = useState([])
  const [rootsHint, setRootsHint] = useState([])
  const [familyData, setFamilyData] = useState(null)
  const [familyWords, setFamilyWords] = useState([])

  useEffect(() => {
    db.roots.toArray().then(r => setAllRoots(r)).catch(() => {})
  }, [])

  useEffect(() => {
    if (allRoots.length > 0 && question?.word) {
      setRootsHint(findRoots(question.word, allRoots))
    }
  }, [allRoots, question?.word])

  useEffect(() => {
    setFamilyData(null)
    setFamilyWords([])
    if (!question?.wordObj?.familyId) return
    db.wordFamilies.get(question.wordObj.familyId)
      .then(fam => { if (fam) setFamilyData(fam) })
      .catch(() => {})
    db.words.where('familyId').equals(question.wordObj.familyId).toArray()
      .then(ws => {
        const seen = new Set()
        const unique = ws.filter(w => {
          if (w.id === question.wordId) return false
          if (seen.has(w.word)) return false
          seen.add(w.word)
          return true
        })
        setFamilyWords(unique.slice(0, 8))
      })
      .catch(() => {})
  }, [question?.wordId, question?.wordObj?.familyId])

  // マウント時に単語を読み上げ
  useEffect(() => {
    if (question?.word) speak(question.word, 'en-US', 0.85)
  }, [question?.word])

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col px-5 py-6 overflow-y-auto">
      <button
        onClick={onBack}
        className="text-slate-400 hover:text-white text-base mb-6 text-left"
      >
        ← 戻る
      </button>

      {/* 単語（WordCard フリップ） */}
      <div className="text-center mb-5">
        <p className="text-slate-500 text-base font-bold mb-3">
          No.{question.leapNumber}&nbsp;<span className="text-slate-600">{question.leapPart}</span>
        </p>
        <div className="flex justify-center mb-3">
          {question.wordId ? (
            <WordCard
              word={{ id: question.wordId, word: question.word }}
              textClassName="text-5xl font-black tracking-tight"
            />
          ) : (
            <span className="text-5xl font-black tracking-tight">{question.word}</span>
          )}
        </div>
        {question.wordObj?.meaning && (
          <p className="text-2xl text-slate-200 font-medium mt-1">{question.wordObj.meaning}</p>
        )}
        {question.wordObj?.partOfSpeech && (
          <p className="text-slate-600 text-sm mt-1">{question.wordObj.partOfSpeech}</p>
        )}
      </div>

      {/* 発音ボタン */}
      <button
        onClick={() => speak(question.word, 'en-US', 0.75)}
        className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 text-sm font-bold mb-4 transition-colors active:scale-95"
      >
        🔊 読み上げ
      </button>

      {/* 語源ヒント */}
      {rootsHint.length > 0 && (
        <div className="px-4 py-3 bg-purple-900/30 border border-purple-800/50 rounded-xl text-purple-300 text-sm mb-3 text-center">
          🔤 語源:{' '}
          {rootsHint.map((r, i) => (
            <span key={r.root}>
              {i > 0 && <span className="text-purple-600 mx-1">+</span>}
              <span className="font-bold">{r.root}</span>
              <span className="text-purple-400"> ({r.meaning})</span>
            </span>
          ))}
        </div>
      )}

      {/* 語族 */}
      {familyData && (
        <div className="px-4 py-3 bg-blue-900/30 border border-blue-800/50 rounded-xl text-blue-300 text-sm mb-4">
          <p className="text-center mb-2">
            🧬 語族: <span className="font-bold">[{familyData.root}]</span>
            {familyData.rootMeaning && (
              <span className="text-blue-400"> — {familyData.rootMeaning}</span>
            )}
          </p>
          {familyWords.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center pt-1 border-t border-blue-800/40">
              {familyWords.map(fw => (
                <span key={fw.id} className="text-xs bg-blue-900/50 rounded-lg px-2 py-1">
                  <span className="font-bold text-blue-200">{fw.word}</span>
                  <span className="text-blue-500 ml-1">{fw.partOfSpeech}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-auto pt-4">
        <button
          onClick={onBack}
          className="w-full py-4 bg-amber-600 hover:bg-amber-500 rounded-xl text-white text-base font-bold transition-colors active:scale-95"
        >
          ← 問題に戻る
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// QuizScreen（問題画面 + 答え表示画面 + 単語詳細）
// ─────────────────────────────────────────────
function QuizScreen({ questions, onComplete }) {
  const [index, setIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const countedRef = useRef(new Set())
  const navigate = useNavigate()

  const question = questions[index]
  const total = questions.length
  const isFirst = index === 0
  const isLast = index === total - 1

  // 問題画面が表示された時点で studyCount +1（1問1回のみ）
  useEffect(() => {
    if (!question?.wordId) return
    if (countedRef.current.has(index)) return
    countedRef.current.add(index)
    incrementStudyCount(question.wordId)
  }, [index, question?.wordId])

  // 答え表示時に自動 TTS
  useEffect(() => {
    if (showAnswer && question?.answerEn) {
      speak(question.answerEn, 'en-US', 0.85)
    }
  }, [showAnswer, question?.answerEn])

  function handleNext() {
    if (isLast) {
      onComplete(questions)
    } else {
      setShowAnswer(false)
      setIndex(i => i + 1)
    }
  }

  function handlePrev() {
    setShowAnswer(false)
    setIndex(i => i - 1)
  }

  // 単語詳細画面
  if (showDetail) {
    return (
      <WordDetailScreen
        question={question}
        onBack={() => setShowDetail(false)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col px-5 py-8">

      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-slate-400 text-base font-bold">⚡ 瞬間英作文</span>
        <span className="text-slate-500 text-sm font-bold tabular-nums">
          {index + 1} / {total}
        </span>
      </div>

      {/* 単語エリア（タップで単語詳細へ） */}
      <button
        onClick={() => setShowDetail(true)}
        className="mb-6 w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 flex items-center gap-2 active:bg-slate-700 transition-colors text-left"
      >
        <span className="text-amber-400 text-xl font-bold tracking-tight flex-1">
          {question.word}
          {question.exampleTotal > 1 && (
            <span className="text-slate-600 text-sm font-normal ml-2">
              ({question.exampleIndex}/{question.exampleTotal})
            </span>
          )}
        </span>
        <span className="text-slate-600 text-xs">詳細 →</span>
      </button>

      {/* 問題文（タップで英文読み上げ） */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full">
          <button
            onClick={() => question?.answerEn && speak(question.answerEn, 'en-US', 0.85)}
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-6 py-8 text-center mb-5 active:bg-slate-800 transition-colors"
          >
            <p className="text-2xl font-bold leading-relaxed text-slate-100">
              {question.questionJa}
            </p>
            <p className="text-slate-700 text-xs mt-3">🔊 タップで読み上げ</p>
          </button>

          {!showAnswer ? (
            /* 答えを見るボタン */
            <button
              onClick={() => setShowAnswer(true)}
              className="w-full py-5 text-lg font-bold bg-blue-600 hover:bg-blue-500 rounded-2xl transition-colors active:scale-95"
            >
              答えを見る
            </button>
          ) : (
            /* 答え表示 */
            <div>
              <button
                onClick={() => speak(question.answerEn, 'en-US', 0.85)}
                className="w-full bg-blue-950/60 border border-blue-800/50 rounded-2xl px-6 py-5 mb-4 text-center active:bg-blue-900/40 transition-colors"
              >
                <p className="text-xl font-bold text-blue-200 leading-relaxed">
                  {question.answerEn}
                </p>
                <p className="text-blue-800 text-xs mt-2">🔊 タップで再読み上げ</p>
              </button>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowAnswer(false)}
                  className="flex-1 py-4 text-base font-bold bg-slate-700 hover:bg-slate-600 rounded-2xl transition-colors active:scale-95"
                >
                  答えを隠す
                </button>
                <button
                  onClick={handleNext}
                  className="flex-1 py-4 text-base font-bold bg-amber-600 hover:bg-amber-500 rounded-2xl transition-colors active:scale-95"
                >
                  {isLast ? 'まとめへ →' : '次の問題へ →'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* フッター */}
      <div className="flex gap-3 mt-6">
        {!isFirst && (
          <button
            onClick={handlePrev}
            className="flex-1 py-3 text-sm text-slate-500 hover:text-slate-300 border border-slate-800 hover:border-slate-600 rounded-xl transition-colors"
          >
            ← 一つ前に戻る
          </button>
        )}
        <button
          onClick={() => navigate('/')}
          className={`py-3 text-sm text-slate-500 hover:text-slate-300 border border-slate-800 hover:border-slate-600 rounded-xl transition-colors ${isFirst ? 'flex-1' : 'px-4'}`}
        >
          ホームへ戻る
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// SummaryScreen（まとめ画面）
// ─────────────────────────────────────────────
function SummaryScreen({ questions, onRetry, onHome }) {
  const [revealed, setRevealed] = useState({})

  function toggle(i) {
    setRevealed(prev => ({ ...prev, [i]: !prev[i] }))
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col px-4 py-8">
      <div className="max-w-sm mx-auto w-full">
        <h1 className="text-2xl font-bold text-amber-400 mb-1">お疲れ様でした！</h1>
        <p className="text-slate-400 text-sm mb-1">通しで言えるかな？</p>
        <p className="text-slate-600 text-xs mb-6">（日本語をタップすると英文に切り替わります）</p>

        <div className="flex flex-col gap-3 mb-8">
          {questions.map((q, i) => (
            <button
              key={i}
              onClick={() => toggle(i)}
              className="w-full text-left px-4 py-4 rounded-xl border transition-all active:scale-95"
              style={{
                backgroundColor: revealed[i] ? 'rgba(30,58,138,0.3)' : 'rgba(30,41,59,0.8)',
                borderColor: revealed[i] ? 'rgba(37,99,235,0.5)' : 'rgba(51,65,85,0.8)',
              }}
            >
              <span className="text-slate-500 text-xs font-bold mr-2">{i + 1}.</span>
              {revealed[i] ? (
                <span className="text-blue-200 font-medium leading-relaxed">{q.answerEn}</span>
              ) : (
                <span className="text-slate-200 leading-relaxed">{q.questionJa}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onRetry}
            className="flex-1 py-5 text-lg font-bold bg-amber-600 hover:bg-amber-500 rounded-2xl transition-colors active:scale-95"
          >
            もう一度
          </button>
          <button
            onClick={onHome}
            className="flex-1 py-5 text-lg font-bold bg-slate-700 hover:bg-slate-600 rounded-2xl transition-colors active:scale-95"
          >
            ホームへ
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────
export default function Warmup() {
  const [phase, setPhase] = useState('select')
  const [questions, setQuestions] = useState([])
  const [quizKey, setQuizKey] = useState(0)
  const navigate = useNavigate()
  const { recordStudy } = useUserStats()

  async function handleComplete(qs) {
    await recordStudy()
    setPhase('summary')
  }

  function handleRetry() {
    setQuizKey(k => k + 1) // QuizScreen をリセット（countedRef も初期化）
    setPhase('quiz')
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
        key={quizKey}
        questions={questions}
        onComplete={handleComplete}
      />
    )
  }

  if (phase === 'summary') {
    return (
      <SummaryScreen
        questions={questions}
        onRetry={handleRetry}
        onHome={() => navigate('/')}
      />
    )
  }
}
