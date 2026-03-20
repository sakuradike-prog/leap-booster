import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { useUserStats } from '../hooks/useUserStats'
import { speak } from '../utils/speak'
import WordDetailScreen from '../components/WordDetailScreen'
import StreakToast from '../components/StreakToast'
import SessionCompleteOverlay from '../components/SessionCompleteOverlay'
import { addStudyLog } from '../utils/studyLog'
import { startSession, endSession } from '../utils/sessionLog'

const PARTS = ['すべて', 'Part1', 'Part2', 'Part3', 'Part4', 'α']
const HISTORY_MODE = '最近の学習から'
const NUMBER_MODE = '番号で指定'
const SESSION_COUNT = 5
const MAX_SELECT = 5


// ── word lookup helper（バグ修正: word文字列を優先キーに）──
async function enrichSentences(sentences) {
  const wordStrings = [...new Set(sentences.map(s => s.word).filter(Boolean))]
  if (wordStrings.length === 0) return sentences
  const wordRecords = await db.words.where('word').anyOf(wordStrings).toArray()

  // 精密マップ: "word:leapNumber" → wordObj
  const preciseMap = {}
  // フォールバックマップ: word文字列 → wordObj（最初のマッチ）
  const wordStringMap = {}
  for (const w of wordRecords) {
    const key = `${w.word}:${w.leapNumber}`
    preciseMap[key] = w
    if (!wordStringMap[w.word]) wordStringMap[w.word] = w
  }

  return sentences.map(s => {
    const matched =
      preciseMap[`${s.word}:${s.leapNumber}`] ??
      wordStringMap[s.word] ??
      null
    return { ...s, wordId: matched?.id ?? null, wordObj: matched ?? null }
  })
}

// ── パート指定でランダム出題 ──────────────────
async function fetchQuestions(part, count) {
  let query = part === 'すべて'
    ? db.warmupSentences.toCollection()
    : db.warmupSentences.where('leapPart').equals(part)

  const all = await query.toArray()
  if (all.length === 0) return []

  const shuffled = [...all].sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, count)
  return enrichSentences(selected)
}

// ── 選択した単語から出題（履歴選択モード）──────
async function fetchQuestionsForWords(selectedWordObjs) {
  const wordStrings = selectedWordObjs.map(w => w.word)
  const sentences = await db.warmupSentences.where('word').anyOf(wordStrings).toArray()
  if (sentences.length === 0) return []

  // 各単語につき例文をランダムに1つ選ぶ
  const result = []
  for (const wordObj of selectedWordObjs) {
    const matching = sentences.filter(s => s.word === wordObj.word)
    if (matching.length > 0) {
      const picked = matching[Math.floor(Math.random() * matching.length)]
      result.push({ ...picked, wordId: wordObj.id, wordObj })
    }
  }
  return result
}

// ── 番号指定でランダム出題 ────────────────────
async function fetchQuestionsForNumbers(leapNumbers) {
  const nums = leapNumbers.filter(n => !isNaN(n) && n > 0)
  if (nums.length === 0) return []
  const results = []
  for (const num of nums) {
    const sentences = await db.warmupSentences.where('leapNumber').equals(num).toArray()
    if (sentences.length > 0) {
      const picked = sentences[Math.floor(Math.random() * sentences.length)]
      results.push(picked)
    }
  }
  return enrichSentences(results)
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
function SelectScreen({ onStart, onHistorySelect }) {
  const [selectedPart, setSelectedPart] = useState('すべて')
  const [totalCount, setTotalCount] = useState(0)
  const [countLoading, setCountLoading] = useState(true)
  const [numberInputs, setNumberInputs] = useState(['', '', '', '', ''])
  const [numberError, setNumberError] = useState('')
  const navigate = useNavigate()

  const isHistoryMode = selectedPart === HISTORY_MODE
  const isNumberMode  = selectedPart === NUMBER_MODE

  useEffect(() => {
    if (isHistoryMode || isNumberMode) { setTotalCount(-1); setCountLoading(false); return }
    setCountLoading(true)
    async function load() {
      const count = selectedPart === 'すべて'
        ? await db.warmupSentences.count()
        : await db.warmupSentences.where('leapPart').equals(selectedPart).count()
      setTotalCount(count)
      setCountLoading(false)
    }
    load()
  }, [selectedPart, isHistoryMode, isNumberMode])

  function handleNumberInput(i, val) {
    // 数字のみ受け付ける
    if (val !== '' && !/^\d+$/.test(val)) return
    setNumberInputs(prev => prev.map((v, idx) => idx === i ? val : v))
    setNumberError('')
  }

  async function handleStart() {
    if (isHistoryMode) {
      onHistorySelect()
      return
    }
    if (isNumberMode) {
      const nums = numberInputs
        .map(v => parseInt(v, 10))
        .filter(n => !isNaN(n) && n > 0)
      if (nums.length === 0) {
        setNumberError('番号を1つ以上入力してください')
        return
      }
      const questions = await fetchQuestionsForNumbers(nums)
      if (questions.length === 0) {
        setNumberError('該当する例文が見つかりませんでした')
        return
      }
      onStart(questions)
      return
    }
    const questions = await fetchQuestions(selectedPart, SESSION_COUNT)
    if (questions.length === 0) return
    onStart(questions)
  }

  const validNumberCount = numberInputs.filter(v => v !== '' && !isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0).length

  const startDisabled = isNumberMode
    ? validNumberCount === 0
    : (!isHistoryMode && totalCount === 0)

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

        {!countLoading && totalCount === 0 && !isHistoryMode && !isNumberMode && (
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
            <button
              onClick={() => setSelectedPart(HISTORY_MODE)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1 ${
                isHistoryMode
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>🕐</span>
              <span>{HISTORY_MODE}</span>
            </button>
            <button
              onClick={() => { setSelectedPart(NUMBER_MODE); setNumberError('') }}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1 ${
                isNumberMode
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>🔢</span>
              <span>{NUMBER_MODE}</span>
            </button>
          </div>

          {/* 番号入力エリア */}
          {isNumberMode && (
            <div className="mt-4">
              <p className="text-slate-400 text-xs mb-3">出題するNo.を入力（最大5つ）</p>
              <div className="flex gap-2">
                {numberInputs.map((val, i) => (
                  <input
                    key={i}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={val}
                    onChange={e => handleNumberInput(i, e.target.value)}
                    placeholder={`${i + 1}`}
                    className="flex-1 min-w-0 bg-slate-800 border border-slate-600 focus:border-amber-500 rounded-xl text-center text-white font-bold py-3 text-sm outline-none transition-colors"
                  />
                ))}
              </div>
              {numberError && (
                <p className="text-red-400 text-xs mt-2">{numberError}</p>
              )}
              {validNumberCount > 0 && !numberError && (
                <p className="text-slate-600 text-xs mt-2">{validNumberCount}問を出題します</p>
              )}
            </div>
          )}

          {!isHistoryMode && !isNumberMode && totalCount > 0 && (
            <p className="text-slate-600 text-xs mt-2">{totalCount.toLocaleString()}問から出題</p>
          )}
          {isHistoryMode && (
            <p className="text-slate-600 text-xs mt-2">次の画面で単語を最大5個選択します</p>
          )}
        </div>

        <button
          onClick={handleStart}
          disabled={startDisabled}
          className="w-full py-5 text-xl font-bold bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-2xl transition-colors active:scale-95"
        >
          {isHistoryMode ? '単語を選ぶ →' : 'スタート'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// HistorySelectScreen（履歴から単語選択）
// ─────────────────────────────────────────────
function HistorySelectScreen({ onStart, onBack }) {
  const [entries, setEntries] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const allCards = await db.cards
        .filter(c => !!c.lastReviewed)
        .toArray()
      if (allCards.length === 0) { setLoading(false); return }

      // lastReviewed 降順にソート
      allCards.sort((a, b) => new Date(b.lastReviewed) - new Date(a.lastReviewed))

      const wordIds = allCards.map(c => c.wordId)
      const words = await db.words.where('id').anyOf(wordIds).toArray()
      const wordMap = Object.fromEntries(words.map(w => [w.id, w]))

      // 重複単語を除いてリスト化（最新のものを先頭に）
      const seen = new Set()
      const list = []
      for (const card of allCards) {
        const wordObj = wordMap[card.wordId]
        if (!wordObj || seen.has(wordObj.id)) continue
        seen.add(wordObj.id)
        list.push({ wordObj, lastReviewed: new Date(card.lastReviewed) })
      }

      setEntries(list)
      setLoading(false)
    }
    load()
  }, [])

  function toggleSelect(wordId) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(wordId)) {
        next.delete(wordId)
      } else {
        if (next.size >= MAX_SELECT) return prev
        next.add(wordId)
      }
      return next
    })
  }

  async function handleStart() {
    if (selected.size === 0) return
    const selectedWordObjs = entries
      .filter(e => selected.has(e.wordObj.id))
      .map(e => e.wordObj)
    const questions = await fetchQuestionsForWords(selectedWordObjs)
    if (questions.length === 0) return
    onStart(questions)
  }

  function fmtTime(date) {
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col px-4 py-8">
      <div className="max-w-sm mx-auto w-full flex flex-col h-full">

        <div className="flex items-center mb-2">
          <button onClick={onBack} className="text-slate-400 hover:text-white mr-4 text-lg">← 戻る</button>
          <div>
            <h1 className="text-xl font-bold">🕐 最近の学習から選択</h1>
            <p className="text-slate-500 text-xs mt-0.5">最大{MAX_SELECT}個まで選べます</p>
          </div>
        </div>

        <p className="text-slate-600 text-xs mb-4">
          選択中: <span className={`font-bold ${selected.size > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{selected.size}</span> / {MAX_SELECT}
        </p>

        <button
          onClick={handleStart}
          disabled={selected.size === 0}
          className="w-full py-4 text-lg font-bold bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-2xl transition-colors active:scale-95 mb-3"
        >
          スタート（{selected.size}問）
        </button>

        {loading ? (
          <p className="text-slate-600 text-center py-10">読み込み中…</p>
        ) : entries.length === 0 ? (
          <p className="text-slate-600 text-sm">まだ学習履歴がありません</p>
        ) : (
          <div className="flex flex-col gap-1 flex-1 overflow-y-auto">
            {entries.map(({ wordObj, lastReviewed }) => {
              const isSelected = selected.has(wordObj.id)
              const isDisabled = !isSelected && selected.size >= MAX_SELECT
              return (
                <button
                  key={wordObj.id}
                  onClick={() => toggleSelect(wordObj.id)}
                  disabled={isDisabled}
                  className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 active:scale-95 transition-all ${
                    isSelected
                      ? 'bg-amber-600/30 border border-amber-500/60'
                      : isDisabled
                        ? 'bg-slate-800/40 border border-transparent opacity-40'
                        : 'bg-slate-800 border border-transparent hover:bg-slate-700'
                  }`}
                >
                  <span className={`text-lg ${isSelected ? 'text-amber-400' : 'text-slate-600'}`}>
                    {isSelected ? '✓' : '○'}
                  </span>
                  <span className="font-bold flex-1 text-white">{wordObj.word}</span>
                  <span className="text-slate-500 text-xs truncate max-w-24">{wordObj.meaning}</span>
                  <span className="text-slate-600 text-xs ml-1 shrink-0">{fmtTime(lastReviewed)}</span>
                </button>
              )
            })}
          </div>
        )}
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
  const questionStartRef = useRef(Date.now())
  const sessionIdRef = useRef(null)
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
    // 問題ログ（表示時）
    questionStartRef.current = Date.now()
  }, [index, question?.wordId])

  // 答え表示時に自動 TTS
  useEffect(() => {
    if (showAnswer && question?.answerEn) {
      speak(question.answerEn, 'en-US', 0.85)
    }
  }, [showAnswer, question?.answerEn])

  // セッション管理
  useEffect(() => {
    startSession('warmup').then(id => { sessionIdRef.current = id })
    return () => { endSession(sessionIdRef.current) }
  }, []) // eslint-disable-line

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
  if (showDetail && question?.wordObj) {
    const sessionWords = questions.map(q => q.wordObj).filter(Boolean)
    const sessionIndex = sessionWords.findIndex(w => w.id === question.wordObj.id)
    return (
      <WordDetailScreen
        word={question.wordObj}
        onBack={() => setShowDetail(false)}
        sessionWords={sessionWords}
        initialIndex={sessionIndex >= 0 ? sessionIndex : index}
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
          </button>

          {!showAnswer ? (
            /* 答えを見るボタン */
            <button
              onClick={() => {
                const rt = parseFloat(((Date.now() - questionStartRef.current) / 1000).toFixed(2))
                if (question?.wordObj) addStudyLog({
                  leapNumber: question.wordObj.leapNumber,
                  word: question.wordObj.word,
                  eventType: 'studied',
                  mode: 'warmup',
                  responseTime: rt,
                })
                setShowAnswer(true)
              }}
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
  const [streakToast, setStreakToast] = useState(null)
  const [showSessionOverlay, setShowSessionOverlay] = useState(false)
  const navigate = useNavigate()
  const { recordStudy } = useUserStats()

  async function handleComplete(qs) {
    const result = await recordStudy()
    if (result.streakUpdated) setStreakToast(result.currentStreak)
    setShowSessionOverlay(true)
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
        onHistorySelect={() => setPhase('history-select')}
      />
    )
  }

  if (phase === 'history-select') {
    return (
      <HistorySelectScreen
        onStart={qs => { setQuestions(qs); setPhase('quiz') }}
        onBack={() => setPhase('select')}
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
      <>
        {showSessionOverlay && (
          <SessionCompleteOverlay
            label="セッション完了！"
            onDone={() => {
              setShowSessionOverlay(false)
              if (streakToast !== null) setPhase('streak')
            }}
          />
        )}
        <SummaryScreen
          questions={questions}
          onRetry={handleRetry}
          onHome={() => navigate('/')}
        />
      </>
    )
  }
  if (phase === 'streak') {
    return <StreakToast streak={streakToast} onDone={() => { setStreakToast(null); setPhase('summary') }} />
  }
}
