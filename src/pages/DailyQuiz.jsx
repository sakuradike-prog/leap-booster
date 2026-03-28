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
import { addStudyLog } from '../utils/studyLog'
import { startSession, endSession } from '../utils/sessionLog'
import { incrementConsecutiveCorrect, resetConsecutiveCorrect } from '../utils/consecutiveCorrect'
import { sourceBookFilter } from '../utils/bookVersion'
import { syncCard, syncDailyQuizHistory, syncDailyModeCompletion, fetchTodayModeCompletions } from '../utils/supabaseSync'
import { supabase } from '../lib/supabase'


const BASE_PARTS = ['Part1', 'Part2', 'Part3', 'Part4']
const ALL_PARTS  = ['Part1', 'Part2', 'Part3', 'Part4', 'α']
const QUESTIONS = 10
const SPELL_QUESTIONS = 5
const SPELL_LAST_PART_KEY = 'vocaleap_spell_last_part'
const SORT_QUESTIONS = 15

async function fetchSortQuestions(excludeLeapNums = new Set()) {
  const today = new Date()
  const [allCards, allWords, checkedEntries, capturedEntries] = await Promise.all([
    db.cards.toArray(),
    db.words.filter(sourceBookFilter).toArray(),
    db.checked_words.toArray(),
    db.captured_words.toArray(),
  ])
  const wordById = {}
  for (const w of allWords) wordById[w.id] = w
  const checkedNums = new Set(checkedEntries.map(c => c.leapNumber))
  const capturedNums = new Set(capturedEntries.map(c => c.leapNumber))

  const candidates = []
  for (const card of allCards) {
    const word = wordById[card.wordId]
    if (!word) continue
    if ((card.studyCount ?? 0) < 1) continue
    if (excludeLeapNums.has(word.leapNumber)) continue
    // クールタイム除外（連続わかった回数に応じて出題しない期間）
    const knownStreak = card.sortKnownStreak ?? 0
    if (knownStreak > 0 && card.sortLastKnownAt) {
      const daysSinceKnown = (today - new Date(card.sortLastKnownAt)) / (1000 * 60 * 60 * 24)
      const coolDays = [0, 3, 7, 14, 30][Math.min(knownStreak, 4)]
      if (daysSinceKnown < coolDays) continue
    }
    const studyCount = card.studyCount ?? 0
    const incorrectRate = studyCount > 0 ? (card.incorrectCount ?? 0) / studyCount : 0
    const lastReviewed = card.lastReviewed ? new Date(card.lastReviewed) : null
    const daysSince = lastReviewed ? (today - lastReviewed) / (1000 * 60 * 60 * 24) : 30
    const score = (incorrectRate * 3)
      + (daysSince * 0.5)
      - (studyCount * 0.2)
      + (checkedNums.has(word.leapNumber) ? 5 : 0)
      + (capturedNums.has(word.leapNumber) ? 1 : 0)
    candidates.push({ word, score })
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, SORT_QUESTIONS).map(c => c.word)
}

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

// ---- モード選択画面 ----
function ModeSelect({ onSelectMode, onBack }) {
  const today = new Date().toISOString().slice(0, 10)
  const [practiceCompleted, setPracticeCompleted] = useState(
    !!localStorage.getItem(`vocaleap_practice_daily_${today}`)
  )
  const [spellCompleted, setSpellCompleted] = useState(
    !!localStorage.getItem(`vocaleap_spell_daily_${today}`)
  )
  const [sortCompleted, setSortCompleted] = useState(
    !!localStorage.getItem(`vocaleap_sorting_daily_${today}`)
  )
  const [completeBonusEarned, setCompleteBonusEarned] = useState(
    !!localStorage.getItem(`vocaleap_complete_bonus_daily_${today}`)
  )

  useEffect(() => {
    async function checkServer() {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) return
      const completions = await fetchTodayModeCompletions(userId)
      if (completions.includes('practice')) {
        localStorage.setItem(`vocaleap_practice_daily_${today}`, '1')
        setPracticeCompleted(true)
      }
      if (completions.includes('spell')) {
        localStorage.setItem(`vocaleap_spell_daily_${today}`, '1')
        setSpellCompleted(true)
      }
      if (completions.includes('sort')) {
        localStorage.setItem(`vocaleap_sorting_daily_${today}`, '1')
        setSortCompleted(true)
      }
      if (completions.includes('complete_bonus')) {
        localStorage.setItem(`vocaleap_complete_bonus_daily_${today}`, '1')
        setCompleteBonusEarned(true)
      }
    }
    checkServer()
  }, [today])

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[600px] mx-auto px-5 py-3 flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-white text-sm active:opacity-60">← 戻る</button>
          <h1 className="text-lg font-bold">💡 Daily Quiz</h1>
        </div>
      </div>
      <div className="flex flex-col gap-4 p-4 max-w-[600px] mx-auto">
        <div className="text-center mb-2">
          <div className="text-2xl mb-1">💡</div>
          <div className="text-xl font-bold text-white">Daily Quiz</div>
          <div className="text-slate-400 text-sm">毎日初回のみポイント獲得・何度でも挑戦</div>
        </div>

        {/* 4択練習 */}
        <button
          onClick={() => onSelectMode('4choice')}
          className="w-full bg-slate-800 border border-slate-600 rounded-2xl p-4 text-left hover:border-blue-500 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📝</span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="text-white font-bold">4択練習</div>
                {practiceCompleted && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-green-400 border border-green-400 rounded px-1.5 py-0.5">本日学習済み</span>
                    <img src="/badge.png" alt="" style={{ width: 24, height: 24 }} />
                  </div>
                )}
              </div>
              <div className="text-slate-400 text-sm">英単語を見て意味を選ぶ</div>
            </div>
          </div>
        </button>

        {/* 仕分け練習 */}
        <button
          onClick={() => onSelectMode('sort')}
          className="w-full bg-slate-800 border border-slate-600 rounded-2xl p-4 text-left hover:border-amber-500 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🃏</span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="text-white font-bold">仕分け練習</div>
                {sortCompleted && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-green-400 border border-green-400 rounded px-1.5 py-0.5">本日学習済み</span>
                    <img src="/badge.png" alt="" style={{ width: 24, height: 24 }} />
                  </div>
                )}
              </div>
              <div className="text-slate-400 text-sm">学習履歴から15語を自動選出・わかる/わからない仕分け</div>
            </div>
          </div>
        </button>

        {/* スペル入力 */}
        <button
          onClick={() => onSelectMode('spell')}
          className="w-full bg-slate-800 border border-slate-600 rounded-2xl p-4 text-left hover:border-green-500 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">⌨️</span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="text-white font-bold">スペル入力</div>
                {spellCompleted && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-green-400 border border-green-400 rounded px-1.5 py-0.5">本日学習済み</span>
                    <img src="/badge.png" alt="" style={{ width: 24, height: 24 }} />
                  </div>
                )}
              </div>
              <div className="text-slate-400 text-sm">例文の空欄に単語をタイプ（5問）</div>
            </div>
          </div>
        </button>

        {completeBonusEarned && (
          <div className="w-full flex items-center gap-2 px-4 py-3 bg-amber-900/30 border border-amber-500/50 rounded-2xl">
            <span className="text-xl">🏆</span>
            <div>
              <div className="text-amber-400 font-bold text-sm">Quiz3種コンプリートボーナス獲得済み</div>
              <div className="text-amber-600 text-xs">+10pt 本日取得済み</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- パート選択画面 ----
const PRACTICE_LAST_PART_KEY = 'vocaleap_practice_last_part'

const CHECKED_MIN = 10
const VALID_PARTS = [...ALL_PARTS, '__checked__']

function PartSelect({ onStart, onBack }) {
  const [selected, setSelected] = useState(() => {
    try {
      const saved = localStorage.getItem(PRACTICE_LAST_PART_KEY)
      const parsed = saved ? JSON.parse(saved) : ['Part1']
      return parsed.filter(p => VALID_PARTS.includes(p))
    } catch {
      return ['Part1']
    }
  })
  const [wordCounts, setWordCounts] = useState({})
  const [checkedCount, setCheckedCount] = useState(0)
  const [maskMode, setMaskMode] = useState(false)

  // α単語がDBに存在する場合のみαを表示
  const PARTS = (wordCounts['α'] ?? 0) > 0 ? ALL_PARTS : BASE_PARTS

  useEffect(() => {
    async function fetchCounts() {
      const counts = {}
      for (const p of ALL_PARTS) {
        counts[p] = await db.words.where('leapPart').equals(p).and(sourceBookFilter).count()
      }
      setWordCounts(counts)
    }
    fetchCounts()
    db.checked_words.count().then(c => setCheckedCount(c)).catch(() => {})
  }, [])

  function toggle(part) {
    setSelected(prev => {
      const next = prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]
      try { localStorage.setItem(PRACTICE_LAST_PART_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  function handleStart() {
    onStart(selected, maskMode)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[600px] mx-auto px-5 py-3 flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-white text-sm active:opacity-60">← 戻る</button>
          <h1 className="text-lg font-bold">💡 4択練習</h1>
        </div>
      </div>
      <div className="flex flex-col items-center px-4 py-8">
      <p className="text-slate-400 text-sm mb-6">10問・何度でも挑戦できる</p>

      <div className="w-full max-w-sm md:max-w-[600px] flex flex-col gap-3 mb-8">
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

        {/* チェックした単語オプション */}
        <button
          onClick={() => checkedCount >= CHECKED_MIN && toggle('__checked__')}
          disabled={checkedCount < CHECKED_MIN}
          className={`flex items-center justify-between w-full py-4 px-5 rounded-xl text-lg font-bold border-2 transition-all ${
            checkedCount < CHECKED_MIN
              ? 'bg-orange-900/40 border-orange-700 text-orange-400 cursor-not-allowed'
              : selected.includes('__checked__')
                ? 'bg-blue-600 border-blue-400 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-400'
          }`}
        >
          <span>☑ チェックした単語</span>
          <span className="text-sm font-normal">
            {checkedCount < CHECKED_MIN
              ? 'チェックした単語がありません（または少なすぎます）'
              : `${checkedCount}語`}
          </span>
        </button>
      </div>

      {/* スタートボタン + 伏字チェックボックス */}
      <div className="w-full max-w-sm md:max-w-[600px] flex items-center gap-3">
        <button
          onClick={handleStart}
          disabled={selected.length === 0}
          className="flex-1 py-5 text-xl font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-2xl transition-colors"
        >
          スタート
        </button>
        <label
          className={`flex flex-col items-center justify-center gap-1 w-16 py-3 rounded-2xl cursor-pointer border-2 transition-all select-none ${
            maskMode
              ? 'bg-purple-700 border-purple-400 text-white'
              : 'bg-slate-800 border-slate-600 text-slate-400'
          }`}
        >
          <span className="text-xl">🙈</span>
          <span className="text-xs font-bold">伏字</span>
          <input
            type="checkbox"
            checked={maskMode}
            onChange={e => setMaskMode(e.target.checked)}
            className="sr-only"
          />
        </label>
      </div>
      {maskMode && (
        <p className="text-purple-300 text-xs mt-3 max-w-xs text-center">
          単語が〇〇〇〇で隠されます。音声を聞いて意味を考えよう！
        </p>
      )}
      </div>
    </div>
  )
}

// ── studyCount +1 / 不正解は incorrectCount +1 ──
async function saveStudyCountBatch(words, incorrectIds = new Set()) {
  for (const word of words) {
    if (!word?.id) continue
    try {
      const existing = await db.cards.where('wordId').equals(word.id).first()
      if (existing) {
        const updates = {
          studyCount: (existing.studyCount ?? 0) + 1,
          lastReviewed: new Date(),
        }
        if (incorrectIds.has(word.id)) {
          updates.incorrectCount = (existing.incorrectCount ?? 0) + 1
        }
        await db.cards.update(existing.id, updates)
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user?.id) syncCard(session.user.id, word.leapNumber, word.word, { ...existing, ...updates })
        })
      } else {
        const newCard = {
          wordId: word.id,
          lastReviewed: new Date(),
          correctCount: 0,
          incorrectCount: incorrectIds.has(word.id) ? 1 : 0,
          studyCount: 1,
        }
        await db.cards.add(newCard)
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user?.id) syncCard(session.user.id, word.leapNumber, word.word, newCard)
        })
      }
    } catch { /* ignore */ }
  }
}

// 単語を〇〇〇〇に変換（スペースは保持）
function maskWord(word) {
  return word.replace(/[^ ]/g, '○')
}

// ── スペル入力用: 語幹・語尾分離ロジック ──────────────────────────────

/** 例文内で原形に対応する出現形を検索 */
function findInflectedForm(sentence, baseWord) {
  if (!sentence || !baseWord) return null
  const escaped = baseWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 直接マッチ（offer→offered, run→running）
  let m = sentence.match(new RegExp(`\\b${escaped}\\w*`, 'i'))
  if (m) return m[0]
  // 語末変化マッチ（y→i: ability→abilities, e削除: achieve→achieved）
  if (baseWord.length > 3) {
    const stem = baseWord.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    m = sentence.match(new RegExp(`\\b${stem}\\w+`, 'i'))
    if (m) return m[0]
  }
  return null
}

/** 出現形から語尾（suffix）を抽出 */
function extractSuffix(baseWord, inflectedForm) {
  const base = baseWord.toLowerCase()
  const inf = inflectedForm.toLowerCase()
  if (inf === base) return ''
  // パターン1: offer→offered（直接プレフィックス）
  if (inf.startsWith(base)) return inf.slice(base.length)
  // パターン2: run→running（子音重複: base + last_char + suffix）
  if (inf.startsWith(base + base[base.length - 1])) return inf.slice(base.length + 1)
  // パターン3: ability→abilities / achieve→achieved（語末1文字変化）
  if (base.length > 1 && inf.startsWith(base.slice(0, -1))) return inf.slice(base.length - 1)
  return ''
}

/** 例文内の出現形を __SPLIT__ に置換し、語尾を返す */
function buildSpellDisplay(sentence, baseWord) {
  const inflected = findInflectedForm(sentence, baseWord)
  if (!inflected) return { parts: [sentence], suffix: '', inflected: baseWord }
  const suffix = extractSuffix(baseWord, inflected)
  const escaped = inflected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = sentence.replace(new RegExp(`\\b${escaped}\\b`, 'i'), '\x00').split('\x00')
  return { parts, suffix, inflected }
}

/** 語幹伏せ字の JSX レンダリング（正解後は緑でワード表示） */
function SpellSentence({ sentence, baseWord, revealWord }) {
  const { parts, suffix } = buildSpellDisplay(sentence, baseWord)
  if (parts.length === 1) return <span>{sentence}</span>
  return (
    <>
      <span>{parts[0]}</span>
      <span className="inline-flex items-baseline">
        <span className={`font-mono font-bold border-b-2 px-0.5 ${
          revealWord ? 'text-green-400 border-green-400' : 'text-slate-200 border-slate-400'
        }`}>
          {revealWord ? revealWord : '_'.repeat(baseWord.length)}
        </span>
        <span className={revealWord ? 'text-green-400 font-bold' : 'text-white'}>{suffix}</span>
      </span>
      <span>{parts[1]}</span>
    </>
  )
}

// warmupSentences からスペル練習用問題を取得
async function fetchSpellQuestions(parts) {
  const hasChecked = parts.includes('__checked__')
  const regularParts = parts.filter(p => p !== '__checked__')
  let combined = []

  if (hasChecked) {
    const checkedEntries = await db.checked_words.toArray()
    const leapNums = checkedEntries.map(c => c.leapNumber)
    if (leapNums.length > 0) {
      const all = await db.warmupSentences.toArray()
      combined = [...combined, ...all.filter(s => leapNums.includes(s.leapNumber))]
    }
  }

  if (regularParts.length > 0) {
    for (const part of regularParts) {
      const rows = await db.warmupSentences.where('leapPart').equals(part).toArray()
      combined = [...combined, ...rows]
    }
  }

  // バージョンフィルタ：現在の単語帳に存在する単語文字列のみに絞る
  // ※ 旧版と改訂版では同じ leapNumber に別の単語が割り当てられる場合があるため、
  //    leapNumber ではなく word 文字列でマッチングする
  const validWords = await db.words.filter(sourceBookFilter).toArray()
  const validWordStrings = new Set(validWords.map(w => w.word))
  const versionFiltered = combined.filter(s => s.word && validWordStrings.has(s.word))

  // 重複除去（同じ leapNumber + exampleIndex）
  const seen = new Set()
  const deduped = versionFiltered.filter(s => {
    const key = `${s.leapNumber}-${s.exampleIndex ?? 0}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 同じ単語が1セッションで2度出ないよう word 文字列単位で1件に絞る
  // ※ leapNumber は旧版・改訂版で別の単語に使いまわされる可能性があるため word で判定
  const seenWords = new Set()
  const wordDeduped = deduped.filter(s => {
    if (!s.word || seenWords.has(s.word)) return false
    seenWords.add(s.word)
    return true
  })

  if (wordDeduped.length === 0) return []

  const shuffled = [...wordDeduped].sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, SPELL_QUESTIONS)

  // wordObj を付与（解説スライドショー用）
  const wordStrings = [...new Set(selected.map(s => s.word).filter(Boolean))]
  const wordRecords = await db.words.where('word').anyOf(wordStrings).and(sourceBookFilter).toArray()
  const preciseMap = {}
  const wordStringMap = {}
  for (const w of wordRecords) {
    preciseMap[`${w.word}:${w.leapNumber}`] = w
    if (!wordStringMap[w.word]) wordStringMap[w.word] = w
  }

  return selected.map(s => ({
    ...s,
    wordObj: preciseMap[`${s.word}:${s.leapNumber}`] ?? wordStringMap[s.word] ?? null,
  }))
}

// ---- 出題画面 ----
function QuizScreen({ questions, onFinish, onHome, maskMode }) {
  const [qIdx, setQIdx] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [choicesVisible, setChoicesVisible] = useState(false)
  const [timeLimit] = useState(getQuizTimerSecs)
  const [timeLeft, setTimeLeft] = useState(() => getQuizTimerSecs())
  const [scoreDisplay, setScoreDisplay] = useState(0)
  const [wordRevealed, setWordRevealed] = useState(false)

  const scoreRef = useRef(0)
  const revealedRef = useRef(false)
  const choicesRef = useRef(null)
  const incorrectIdsRef = useRef(new Set())
  const questionStartRef = useRef(Date.now())
  const sessionIdRef = useRef(null)

  const q = questions[qIdx]

  useEffect(() => {
    revealedRef.current = false
    setSelectedChoice(null)
    setRevealed(false)
    setChoicesVisible(false)
    setWordRevealed(false)
    setTimeLeft(timeLimit)
    speak(questions[qIdx].word.word, 'en-US', 0.85)

    // 問題表示ログ
    questionStartRef.current = Date.now()
    const _q = questions[qIdx]
    if (_q?.word) addStudyLog({ leapNumber: _q.word.leapNumber, word: _q.word.word, eventType: 'studied', mode: 'practice' })

    const timerId = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerId)
          if (!revealedRef.current) {
            revealedRef.current = true
            incorrectIdsRef.current.add(questions[qIdx].word.id)
            setChoicesVisible(true)
            setSelectedChoice(-1)
            setRevealed(true)
            resetConsecutiveCorrect()
            addStudyLog({
              leapNumber: questions[qIdx].word.leapNumber,
              word: questions[qIdx].word.word,
              eventType: 'incorrect',
              mode: 'practice',
              responseTime: parseFloat(((Date.now() - questionStartRef.current) / 1000).toFixed(2)),
            })
            setTimeout(() => advance(qIdx), 1500)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timerId)
  }, [qIdx]) // eslint-disable-line

  // セッション管理
  useEffect(() => {
    startSession('practice').then(id => { sessionIdRef.current = id })
    return () => { endSession(sessionIdRef.current) }
  }, []) // eslint-disable-line

  async function advance(currentQIdx) {
    const nextIdx = currentQIdx + 1
    if (nextIdx >= questions.length) {
      // 全問終了 → 全単語の学習履歴を保存（不正解は incorrectCount +1）
      await saveStudyCountBatch(questions.map(q => q.word), incorrectIdsRef.current)
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
      incrementConsecutiveCorrect()
      addStudyLog({
        leapNumber: q.word.leapNumber,
        word: q.word.word,
        eventType: 'correct',
        mode: 'practice',
        responseTime: parseFloat(((Date.now() - questionStartRef.current) / 1000).toFixed(2)),
      })
      scoreRef.current += 1
      setScoreDisplay(s => s + 1)
    } else {
      playWrong()
      resetConsecutiveCorrect()
      addStudyLog({
        leapNumber: q.word.leapNumber,
        word: q.word.word,
        eventType: 'incorrect',
        mode: 'practice',
        responseTime: parseFloat(((Date.now() - questionStartRef.current) / 1000).toFixed(2)),
      })
      incorrectIdsRef.current.add(q.word.id)
    }
    setSelectedChoice(choiceIdx)
    setRevealed(true)
    setTimeout(() => advance(qIdx), 1200)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center px-4 py-6">
      {/* 進捗 + タイマー */}
      <div className="w-full max-w-sm md:max-w-[600px] mb-4">
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
        className="w-full max-w-sm md:max-w-[600px] bg-slate-800 rounded-2xl px-6 py-6 text-center mb-6 active:opacity-70 transition-opacity"
        onClick={() => speak(q.word.word, 'en-US', 0.85)}
      >
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="text-slate-500 text-sm">{q.word.leapPart} No.{q.word.leapNumber}</span>
          <WordBadges isCaptured={q.isCaptured} />
        </div>
        <div
          className="font-black tracking-tight mb-1 leading-tight"
          style={maskMode && !wordRevealed ? {
            // 伏字: ○は幅広いので文字数に応じて小さめに設定
            fontSize: q.word.word.length <= 5  ? '2.25rem'
              : q.word.word.length <= 8  ? '1.875rem'
              : q.word.word.length <= 11 ? '1.5rem'
              : q.word.word.length <= 15 ? '1.25rem' : '1rem',
            letterSpacing: '0.05em',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          } : {
            fontSize: q.word.word.length <= 10 ? '3rem'
              : q.word.word.length <= 13 ? '2.25rem'
              : q.word.word.length <= 17 ? '1.75rem'
              : q.word.word.length <= 21 ? '1.375rem' : '1.125rem',
            maxWidth: '100%',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {maskMode && !wordRevealed ? maskWord(q.word.word) : q.word.word}
        </div>
        <div className="text-slate-500 text-sm mt-1">{q.word.partOfSpeech}</div>
        {maskMode && !wordRevealed && (
          <button
            onClick={e => { e.stopPropagation(); setWordRevealed(true) }}
            className="mt-3 text-xs text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 active:bg-slate-500 px-4 py-1.5 rounded-full transition-colors"
          >
            単語を表示
          </button>
        )}
      </div>

      {!choicesVisible ? (
        <div className="w-full max-w-sm md:max-w-[600px]">
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
              await saveStudyCountBatch(questions.slice(0, qIdx + 1).map(q => q.word), incorrectIdsRef.current)
              onHome()
            }}
            className="w-full mt-3 py-3 text-slate-500 hover:text-slate-300 text-sm transition-colors"
          >
            終了してメニューへ
          </button>
        </div>
      ) : (
        <div ref={choicesRef} className="w-full max-w-sm md:max-w-[600px] flex flex-col gap-3">
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
function ResultScreen({ score, earnedPoints = 0, onReview, onHome }) {
  const emoji =
    score === QUESTIONS ? '🎉' :
    score >= 8 ? '😄' :
    score >= 5 ? '👍' : '💪'

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center px-4 text-center">
      <div className="text-7xl mb-4">{emoji}</div>
      <h2 className="text-5xl font-black text-blue-400 mb-1">{score} / {QUESTIONS}</h2>
      <p className="text-slate-400 mb-4">正解数</p>

      {earnedPoints > 0 && (
        <div className="mb-6 px-5 py-3 bg-yellow-500/20 border border-yellow-500/50 rounded-2xl w-full max-w-sm md:max-w-[600px]">
          <p className="text-yellow-300 font-bold text-lg">🪙 +{earnedPoints}pt 獲得！</p>
          <p className="text-yellow-500/80 text-xs mt-0.5">今日の初回クリア達成</p>
        </div>
      )}

      <div className="w-full max-w-sm md:max-w-[600px] flex flex-col gap-4">
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

// ---- スペル入力：パート選択画面 ----
function SpellPartSelect({ onStart, onBack }) {
  const [selected, setSelected] = useState(() => {
    try {
      const saved = localStorage.getItem(SPELL_LAST_PART_KEY)
      const parsed = saved ? JSON.parse(saved) : ['Part1']
      return parsed.filter(p => VALID_PARTS.includes(p))
    } catch {
      return ['Part1']
    }
  })
  const [wordCounts, setWordCounts] = useState({})
  const [checkedCount, setCheckedCount] = useState(0)

  const PARTS = (wordCounts['α'] ?? 0) > 0 ? ALL_PARTS : BASE_PARTS

  useEffect(() => {
    async function fetchCounts() {
      const counts = {}
      for (const p of ALL_PARTS) {
        counts[p] = await db.words.where('leapPart').equals(p).and(sourceBookFilter).count()
      }
      setWordCounts(counts)
    }
    fetchCounts()
    db.checked_words.count().then(c => setCheckedCount(c)).catch(() => {})
  }, [])

  function toggle(part) {
    setSelected(prev => {
      const next = prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]
      try { localStorage.setItem(SPELL_LAST_PART_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[600px] mx-auto px-5 py-3 flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-white text-sm active:opacity-60">← 戻る</button>
          <h1 className="text-lg font-bold">⌨️ スペル入力</h1>
        </div>
      </div>
      <div className="flex flex-col items-center px-4 py-8">
        <p className="text-slate-400 text-sm mb-6">5問1セット・タイマーなし・自分のペースで</p>

        <div className="w-full max-w-sm md:max-w-[600px] flex flex-col gap-3 mb-8">
          {PARTS.map(part => (
            <button
              key={part}
              onClick={() => toggle(part)}
              className={`flex items-center justify-between w-full py-4 px-5 rounded-xl text-lg font-bold border-2 transition-all ${
                selected.includes(part)
                  ? 'bg-green-700 border-green-400 text-white'
                  : 'bg-slate-800 border-slate-600 text-slate-400'
              }`}
            >
              <span>{part}</span>
              <span className="text-sm font-normal">
                {wordCounts[part] !== undefined ? `${wordCounts[part]}語` : '…'}
              </span>
            </button>
          ))}

          <button
            onClick={() => checkedCount >= CHECKED_MIN && toggle('__checked__')}
            disabled={checkedCount < CHECKED_MIN}
            className={`flex items-center justify-between w-full py-4 px-5 rounded-xl text-lg font-bold border-2 transition-all ${
              checkedCount < CHECKED_MIN
                ? 'bg-orange-900/40 border-orange-700 text-orange-400 cursor-not-allowed'
                : selected.includes('__checked__')
                  ? 'bg-green-700 border-green-400 text-white'
                  : 'bg-slate-800 border-slate-600 text-slate-400'
            }`}
          >
            <span>☑ チェックした単語</span>
            <span className="text-sm font-normal">
              {checkedCount < CHECKED_MIN
                ? 'チェックした単語がありません（または少なすぎます）'
                : `${checkedCount}語`}
            </span>
          </button>
        </div>

        <button
          onClick={() => onStart(selected)}
          disabled={selected.length === 0}
          className="w-full max-w-sm md:max-w-[600px] py-5 text-xl font-bold bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-2xl transition-colors"
        >
          スタート
        </button>
      </div>
    </div>
  )
}

// ---- スペル入力：問題画面 ----
// spellCorrectCount / spellIncorrectCount を cards テーブルに保存
async function saveSpellResults(questions, correctIdSet) {
  for (const q of questions) {
    const wordObj = q.wordObj
    if (!wordObj?.id) continue
    const isCorrect = correctIdSet.has(wordObj.id)
    try {
      const existing = await db.cards.where('wordId').equals(wordObj.id).first()
      if (existing) {
        const updates = {
          studyCount: (existing.studyCount ?? 0) + 1,
          lastReviewed: new Date(),
          spellCorrectCount:   (existing.spellCorrectCount   ?? 0) + (isCorrect ? 1 : 0),
          spellIncorrectCount: (existing.spellIncorrectCount ?? 0) + (isCorrect ? 0 : 1),
        }
        await db.cards.update(existing.id, updates)
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user?.id) syncCard(session.user.id, wordObj.leapNumber, wordObj.word, { ...existing, ...updates })
        })
      } else {
        const newCard = {
          wordId: wordObj.id,
          lastReviewed: new Date(),
          correctCount: 0,
          incorrectCount: 0,
          studyCount: 1,
          spellCorrectCount:   isCorrect ? 1 : 0,
          spellIncorrectCount: isCorrect ? 0 : 1,
        }
        await db.cards.add(newCard)
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user?.id) syncCard(session.user.id, wordObj.leapNumber, wordObj.word, newCard)
        })
      }
    } catch { /* ignore */ }
  }
}

function SpellQuizScreen({ questions, onFinish, onHome }) {
  const [qIdx, setQIdx] = useState(0)
  const [inputVal, setInputVal] = useState('')
  const [inputSubmitted, setInputSubmitted] = useState('')  // 送信時の値を保持
  const [status, setStatus] = useState('input') // 'input' | 'correct' | 'incorrect'
  const [showJa, setShowJa] = useState(false)
  const [scoreDisplay, setScoreDisplay] = useState(0)

  const inputRef = useRef(null)
  const scoreRef = useRef(0)
  const correctIdsRef = useRef(new Set())
  const wrongAnswersRef = useRef([])
  const questionStartRef = useRef(Date.now())
  const sessionIdRef = useRef(null)

  const q = questions[qIdx]
  const { parts: sentParts, suffix, inflected } = buildSpellDisplay(q?.answerEn ?? '', q?.word ?? '')

  // 問題切り替え時
  useEffect(() => {
    setInputVal('')
    setInputSubmitted('')
    setStatus('input')
    setShowJa(false)
    questionStartRef.current = Date.now()
    if (q?.answerEn) speak(q.answerEn, 'en-US', 0.85)
    const leapNum = q?.leapNumber ?? q?.wordObj?.leapNumber
    if (leapNum && q?.word) addStudyLog({ leapNumber: leapNum, word: q.word, eventType: 'studied', mode: 'spell' })
    setTimeout(() => inputRef.current?.focus(), 700)
  }, [qIdx]) // eslint-disable-line

  useEffect(() => {
    startSession('spell').then(id => { sessionIdRef.current = id })
    return () => { endSession(sessionIdRef.current) }
  }, []) // eslint-disable-line

  function handleSubmit() {
    if (status !== 'input' || inputVal.trim() === '') return
    const normalized = inputVal.trim().toLowerCase()
    const correct = (q.word ?? '').replace(/\s*[~〜].*/g, '').trim().toLowerCase()
    const isCorrect = normalized === correct
    const leapNum = q.leapNumber ?? q.wordObj?.leapNumber
    const rt = parseFloat(((Date.now() - questionStartRef.current) / 1000).toFixed(2))

    setInputSubmitted(inputVal)

    if (isCorrect) {
      playCorrect()
      scoreRef.current += 1
      setScoreDisplay(s => s + 1)
      incrementConsecutiveCorrect()
      if (q.wordObj?.id) correctIdsRef.current.add(q.wordObj.id)
      if (leapNum) addStudyLog({ leapNumber: leapNum, word: q.word, eventType: 'correct', mode: 'spell', responseTime: rt })
      setStatus('correct')
      // 正解→1.5秒後に自動進行
      setTimeout(() => advanceTo(qIdx + 1), 1500)
    } else {
      playWrong()
      resetConsecutiveCorrect()
      wrongAnswersRef.current.push({ word: q.word, inflected: inflected ?? q.word, yourInput: inputVal.trim(), wordObj: q.wordObj ?? null })
      if (leapNum) addStudyLog({ leapNumber: leapNum, word: q.word, eventType: 'incorrect', mode: 'spell', responseTime: rt })
      setStatus('incorrect')
    }
  }

  function handleSkip() {
    if (status !== 'input') return
    const leapNum = q.leapNumber ?? q.wordObj?.leapNumber
    const rt = parseFloat(((Date.now() - questionStartRef.current) / 1000).toFixed(2))
    wrongAnswersRef.current.push({ word: q.word, inflected: inflected ?? q.word, yourInput: '', wordObj: q.wordObj ?? null })
    if (leapNum) addStudyLog({ leapNumber: leapNum, word: q.word, eventType: 'incorrect', mode: 'spell', responseTime: rt })
    playWrong()
    resetConsecutiveCorrect()
    setInputSubmitted('')
    setStatus('incorrect')
  }

  async function advanceTo(nextIdx) {
    if (nextIdx >= questions.length) {
      await saveSpellResults(questions, correctIdsRef.current)
      onFinish({ score: scoreRef.current, total: questions.length, wrongAnswers: wrongAnswersRef.current })
    } else {
      setQIdx(nextIdx)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center px-4 py-6">
      {/* 進捗 */}
      <div className="w-full max-w-sm md:max-w-[600px] mb-4">
        <div className="flex justify-between text-sm text-slate-400 mb-2">
          <span className="font-bold">スペル入力練習</span>
          <span>{qIdx + 1} / {questions.length}</span>
        </div>
        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-300"
            style={{ width: `${(qIdx / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* 例文カード */}
      <div className="w-full max-w-sm md:max-w-[600px] bg-slate-800 rounded-2xl px-6 py-5 mb-4">
        <div className="text-xs text-slate-500 mb-1">{q.leapPart} No.{q.leapNumber}</div>
        <p className="text-xl leading-relaxed text-white mb-4">
          <SpellSentence
            sentence={q.answerEn ?? ''}
            baseWord={q.word ?? ''}
            revealWord={status !== 'input' ? q.word : null}
          />
        </p>

        {/* もう一度読み上げ */}
        <button
          onClick={() => q?.answerEn && speak(q.answerEn, 'en-US', 0.85)}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm active:opacity-60 transition-colors"
        >
          <span>🔊</span><span>もう一度読み上げ</span>
        </button>
      </div>

      {/* 日本語訳トグル */}
      {q?.questionJa && (
        <div className="w-full max-w-sm md:max-w-[600px] mb-4">
          {showJa ? (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3">
              <div className="flex justify-between items-center">
                <p className="text-slate-200 text-sm leading-relaxed">{q.questionJa}</p>
                <button onClick={() => setShowJa(false)} className="text-slate-500 text-xs ml-3 shrink-0">隠す</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowJa(true)}
              className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-300 border border-slate-800 hover:border-slate-600 rounded-xl transition-colors"
            >
              日本語訳を見る
            </button>
          )}
        </div>
      )}

      {/* 入力エリア */}
      <div className="w-full max-w-sm md:max-w-[600px]">
        {/* 正解フィードバック（status !== 'input' のみ表示） */}
        {status !== 'input' && (
          <div className={`rounded-xl px-5 py-4 mb-4 ${
            status === 'correct' ? 'bg-green-900/50 border border-green-600' : 'bg-red-900/50 border border-red-600'
          }`}>
            {status === 'correct' ? (
              <div className="text-green-300 font-bold">✅ 正解！</div>
            ) : (
              <>
                <div className="text-red-300 font-bold mb-1">❌ 不正解</div>
                <div className="text-white font-bold">正解: <span className="font-mono">{q.word}</span></div>
                {inputSubmitted && (
                  <div className="text-slate-400 text-sm mt-1">あなたの入力: <span className="font-mono">{inputSubmitted}</span></div>
                )}
              </>
            )}
          </div>
        )}

        {/* 入力フォーム（iOSキーボード維持のため常にDOMに保持） */}
        <div
          className="flex gap-2 mb-3"
          style={status !== 'input' ? { opacity: 0, pointerEvents: 'none' } : {}}
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="原形を入力..."
            className="flex-1 bg-slate-800 border border-slate-600 focus:border-green-500 rounded-xl px-4 py-4 text-white text-lg font-mono outline-none transition-colors"
          />
          <button
            onClick={handleSubmit}
            disabled={inputVal.trim() === ''}
            className="px-6 py-4 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl font-bold transition-colors active:scale-95"
          >
            送信
          </button>
        </div>

        {status === 'input' ? (
          <div className="flex gap-2">
            <button
              onClick={handleSkip}
              className="flex-1 py-3 text-slate-500 hover:text-slate-300 text-sm border border-slate-800 hover:border-slate-600 rounded-xl transition-colors"
            >
              わからない
            </button>
            <button
              onClick={async () => {
                await saveSpellResults(questions.slice(0, qIdx + 1), correctIdsRef.current)
                onHome()
              }}
              className="flex-1 py-3 text-slate-500 hover:text-slate-300 text-sm border border-slate-800 hover:border-slate-600 rounded-xl transition-colors"
            >
              ホームへ戻る
            </button>
          </div>
        ) : (
          <>
            {/* 不正解時のみ手動「次へ」ボタン（正解時は自動進行） */}
            {status === 'incorrect' && (
              <button
                onClick={() => advanceTo(qIdx + 1)}
                className="w-full py-5 text-xl font-bold bg-blue-600 hover:bg-blue-500 rounded-2xl transition-colors active:scale-95"
              >
                {qIdx + 1 >= questions.length ? '結果を見る →' : '次へ →'}
              </button>
            )}
            {status === 'correct' && (
              <div className="text-center text-slate-500 text-sm animate-pulse">次の問題へ移動中...</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---- スペル入力：完了画面 ----
function SpellSummaryScreen({ score, total, wrongAnswers, earnedPoints = 0, onRetry, onHome }) {
  const [detailWord, setDetailWord] = useState(null)
  const [detailWords, setDetailWords] = useState([])

  if (detailWord) {
    return (
      <WordDetailScreen
        word={detailWord}
        sessionWords={detailWords}
        initialIndex={detailWords.findIndex(w => w.id === detailWord.id)}
        backLabel="結果に戻る"
        backAsLink={true}
        onBack={() => setDetailWord(null)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col px-4 py-8">
      <div className="max-w-[600px] mx-auto w-full">
        <h1 className="text-2xl font-bold text-white mb-1">お疲れ様でした！</h1>
        <p className="text-4xl font-black text-green-400 mb-4">{total}問中 {score}問 正解</p>

        {earnedPoints > 0 && (
          <div className="mb-6 px-5 py-3 bg-yellow-500/20 border border-yellow-500/50 rounded-2xl">
            <p className="text-yellow-300 font-bold text-lg">🪙 +{earnedPoints}pt 獲得！</p>
            <p className="text-yellow-500/80 text-xs mt-0.5">今日の初回クリア達成</p>
          </div>
        )}

        {wrongAnswers.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-slate-700" />
              <span className="text-slate-400 text-sm">間違えた単語（タップで解説）</span>
              <div className="flex-1 h-px bg-slate-700" />
            </div>
            <div className="flex flex-col gap-2">
              {wrongAnswers.map((w, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (!w.wordObj) return
                    const allObjs = wrongAnswers.map(a => a.wordObj).filter(Boolean)
                    setDetailWords(allObjs)
                    setDetailWord(w.wordObj)
                  }}
                  className={`w-full text-left bg-slate-800 rounded-xl px-4 py-3 transition-colors ${w.wordObj ? 'hover:bg-slate-700 active:bg-slate-600' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono font-bold text-white">{w.word}</span>
                      {w.inflected && w.inflected !== w.word && (
                        <span className="text-slate-400 font-normal text-sm ml-1">（{w.inflected}）</span>
                      )}
                    </div>
                    {w.wordObj && <span className="text-slate-500 text-xs">解説 →</span>}
                  </div>
                  {w.yourInput ? (
                    <div className="text-slate-400 text-sm mt-0.5">あなたの入力: <span className="font-mono">{w.yourInput}</span></div>
                  ) : (
                    <div className="text-slate-500 text-sm mt-0.5">スキップ</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onRetry}
            className="flex-1 py-5 text-lg font-bold bg-green-600 hover:bg-green-500 rounded-2xl transition-colors active:scale-95"
          >
            もう一度
          </button>
          <button
            onClick={onHome}
            className="flex-1 py-5 text-lg font-bold bg-slate-700 hover:bg-slate-600 rounded-2xl transition-colors active:scale-95"
          >
            ホームへ戻る
          </button>
        </div>
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

// ─────────────────────────────────────────────
// SortingScreen（仕分け練習 - 複数セッション対応）
// ─────────────────────────────────────────────
function SortingScreen({ initialQuestions, onFinish, onHome }) {
  const [questions, setQuestions] = useState(initialQuestions)
  const [knownSet, setKnownSet] = useState(new Set())
  const [sessionPhase, setSessionPhase] = useState('playing') // 'playing' | 'result'
  const [countdown, setCountdown] = useState(null) // null = 非アクティブ
  const [cumulativeUnknown, setCumulativeUnknown] = useState([])
  const [cumulativeKnown, setCumulativeKnown] = useState([])
  const [excludedNums, setExcludedNums] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const endingRef = useRef(false)
  const handleContinueRef = useRef(null)

  const unknownWords = questions.filter((_, i) => !knownSet.has(i))
  const knownWords   = questions.filter((_, i) => knownSet.has(i))

  function toggle(i) {
    if (sessionPhase !== 'playing') return
    setKnownSet(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  // 全語にわかるが押されたら自動で完了画面へ
  useEffect(() => {
    if (sessionPhase === 'playing' && questions.length > 0 && knownSet.size === questions.length) {
      setSessionPhase('result')
    }
  }, [knownSet.size, questions.length, sessionPhase])

  // result フェーズ開始時: countdownリセット（playing時はnullに戻す）
  useEffect(() => {
    if (sessionPhase !== 'result') {
      setCountdown(null)
      return
    }
    setCountdown(5)
    const id = setInterval(() => setCountdown(c => (c !== null ? c - 1 : null)), 1000)
    return () => clearInterval(id)
  }, [sessionPhase])

  // countdown が厳密に 0 になったとき自動進行（null や負数では発火しない）
  useEffect(() => {
    if (countdown === 0 && sessionPhase === 'result') {
      handleContinueRef.current?.()
    }
  }, [countdown, sessionPhase])

  async function recordSession(sessionUnknown, sessionKnown) {
    const now = new Date()
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id ?? null
    for (const word of sessionUnknown) {
      const card = await db.cards.where('wordId').equals(word.id).first()
      if (card) {
        const next = {
          sortUnknownCount: (card.sortUnknownCount ?? 0) + 1,
          sortKnownStreak: 0,
          sortLastKnownAt: null,
          lastReviewed: now,
        }
        await db.cards.update(card.id, next).catch(() => {})
        if (userId) syncCard(userId, word.leapNumber, word.word, { ...card, ...next })
      }
      // 出題記録 + 不正解記録の両方を残す
      addStudyLog({ leapNumber: word.leapNumber, word: word.word, eventType: 'studied', mode: 'sorting' })
      addStudyLog({ leapNumber: word.leapNumber, word: word.word, eventType: 'incorrect', mode: 'sorting' })
    }
    for (const word of sessionKnown) {
      const card = await db.cards.where('wordId').equals(word.id).first()
      if (card) {
        const newStreak = (card.sortKnownStreak ?? 0) + 1
        const next = {
          sortKnownCount: (card.sortKnownCount ?? 0) + 1,
          sortKnownStreak: newStreak,
          sortLastKnownAt: now,
          lastReviewed: now,
        }
        await db.cards.update(card.id, next).catch(() => {})
        if (userId) syncCard(userId, word.leapNumber, word.word, { ...card, ...next })
      }
      addStudyLog({ leapNumber: word.leapNumber, word: word.word, eventType: 'studied', mode: 'sorting' })
    }
  }

  async function handleContinue() {
    if (endingRef.current) return
    endingRef.current = true
    setLoading(true)
    await recordSession(unknownWords, knownWords)
    const newCumUnknown = [...cumulativeUnknown, ...unknownWords]
    const newCumKnown   = [...cumulativeKnown, ...knownWords]
    // 出題中の全語にわかるが押されたら終了（仕様: 全語わかったらセッション終了）
    if (unknownWords.length === 0) {
      onFinish({ cumulativeUnknown: newCumUnknown, cumulativeKnown: newCumKnown })
      return
    }
    const newExcluded = new Set([...excludedNums, ...unknownWords.map(w => w.leapNumber)])
    const newQs = await fetchSortQuestions(newExcluded)
    if (newQs.length === 0) {
      onFinish({ cumulativeUnknown: newCumUnknown, cumulativeKnown: newCumKnown })
      return
    }
    setCumulativeUnknown(newCumUnknown)
    setCumulativeKnown(newCumKnown)
    setExcludedNums(newExcluded)
    setQuestions(newQs)
    setKnownSet(new Set())
    endingRef.current = false
    setSessionPhase('playing')
    setLoading(false)
  }
  handleContinueRef.current = handleContinue

  async function handleEnd() {
    if (endingRef.current) return
    endingRef.current = true
    await recordSession(unknownWords, knownWords)
    onFinish({
      cumulativeUnknown: [...cumulativeUnknown, ...unknownWords],
      cumulativeKnown:   [...cumulativeKnown, ...knownWords],
    })
  }

  // ── 結果画面（5秒カウントダウン→自動で次のラウンド） ──
  if (sessionPhase === 'result') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center px-4">
        <div className="max-w-[600px] w-full text-center">
          <h2 className="text-2xl font-bold text-amber-400 mb-6">仕分け完了！</h2>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 mb-6">
            <div className="text-white text-lg mb-3">
              わかった: <span className="text-green-400 font-bold">{knownWords.length}語</span>
              <span className="text-slate-500 mx-2">/</span>
              わからなかった: <span className="text-red-400 font-bold">{unknownWords.length}語</span>
            </div>
            {loading ? (
              <div className="text-slate-400 text-sm">次の単語を選出中...</div>
            ) : (
              <div className="text-slate-400 text-sm">
                次の出題まで <span className="text-white font-bold text-2xl">{countdown ?? 5}</span> 秒
              </div>
            )}
          </div>
          <button
            onClick={handleEnd}
            disabled={loading}
            className="text-slate-400 text-sm underline active:opacity-60 disabled:opacity-30"
          >
            いったん終了
          </button>
        </div>
      </div>
    )
  }

  // ── 練習画面 ──
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800/60 px-4 py-2">
        <div className="max-w-[600px] mx-auto flex items-center justify-between">
          <div className="text-sm font-bold text-white">15単語仕分け</div>
          <div className="text-sm text-slate-400">
            わかった: <span className="text-white font-bold">{knownSet.size}</span>/{questions.length}
          </div>
          <button
            onClick={() => setSessionPhase('result')}
            className="px-4 py-1.5 text-sm font-bold bg-amber-600 hover:bg-amber-500 rounded-lg transition-colors active:scale-95"
          >
            完了
          </button>
        </div>
        <div className="max-w-[600px] mx-auto text-center text-xs text-slate-500 mt-0.5">
          わかる単語をタップして伏せよう
        </div>
      </div>

      <div className="flex-1 px-3 py-3 max-w-[600px] mx-auto w-full">
        <div className="grid grid-cols-3 gap-2">
          {questions.map((word, i) => {
            const isKnown = knownSet.has(i)
            return (
              <button
                key={i}
                onClick={() => toggle(i)}
                className="relative rounded-xl border text-xs font-semibold transition-all active:scale-95 min-h-[56px] flex items-center justify-center"
                style={{
                  backgroundColor: isKnown ? 'rgba(22,101,52,0.6)' : 'rgba(30,41,59,0.9)',
                  borderColor: isKnown ? 'rgba(34,197,94,0.5)' : 'rgba(71,85,105,0.8)',
                }}
              >
                {isKnown ? (
                  <span className="text-green-400 text-3xl font-bold">✓</span>
                ) : (
                  <span className="px-2 break-all text-center leading-tight text-white">
                    {word.word}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="pb-6 text-center">
        <button
          onClick={handleEnd}
          className="text-slate-500 text-xs underline active:opacity-60"
        >
          いったん終了
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// SortingEndScreen（終了画面）
// ─────────────────────────────────────────────
function SortingEndScreen({ cumulativeUnknown, earnedPoints, completeBonusPts, onHome }) {
  const [detailWord, setDetailWord] = useState(null)

  if (detailWord) {
    return (
      <WordDetailScreen
        word={detailWord}
        sessionWords={cumulativeUnknown}
        initialIndex={cumulativeUnknown.findIndex(w => w.id === detailWord.id)}
        onBack={() => setDetailWord(null)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col px-4 py-8">
      <div className="max-w-[600px] mx-auto w-full">
        <h1 className="text-2xl font-bold text-amber-400 mb-1">お疲れ様でした！</h1>
        {earnedPoints > 0 && (
          <div className="flex items-center gap-1.5 mb-1">
            <img src="/badge.png" alt="" style={{ width: 20, height: 20 }} />
            <span className="text-green-400 text-sm font-bold">+1ポイント獲得！</span>
          </div>
        )}
        {completeBonusPts > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xl">🏆</span>
            <span className="text-amber-400 text-sm font-bold">Quiz3種コンプリートボーナス +10pt！</span>
          </div>
        )}
        <p className="text-slate-400 text-sm mb-6">
          わからなかった単語: 計{cumulativeUnknown.length}語
        </p>

        {cumulativeUnknown.length > 0 && (
          <div className="mb-8">
            <div className="text-slate-500 text-xs mb-3">── わからなかった単語 ──────────────</div>
            <div className="flex flex-col gap-2">
              {cumulativeUnknown.map((word, i) => (
                <button
                  key={i}
                  onClick={() => setDetailWord(word)}
                  className="w-full text-left px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl hover:border-blue-500 transition-colors active:scale-95"
                >
                  <span className="text-white font-medium">{word.word}</span>
                  <span className="text-slate-400 text-sm ml-3">{word.meaning}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {cumulativeUnknown.length === 0 && (
          <p className="text-green-400 text-lg font-bold mb-8">全問わかった！素晴らしい！🎉</p>
        )}

        <button
          onClick={onHome}
          className="w-full py-5 text-lg font-bold bg-slate-700 hover:bg-slate-600 rounded-2xl transition-colors active:scale-95"
        >
          ホームへ戻る
        </button>
      </div>
    </div>
  )
}

// デイリーポイント判定（今日まだ取得していなければ 1、取得済みなら 0）
async function claimDailyPoint(storageKey, userId) {
  const today = new Date().toISOString().slice(0, 10)
  const localKey = `${storageKey}_${today}`
  // ローカルに記録済みならスキップ
  if (localStorage.getItem(localKey)) return 0
  // サーバー確認（ログイン中のみ）：別デバイスで済ませた場合も0点
  if (userId) {
    const mode = storageKey === 'vocaleap_practice_daily' ? 'practice'
               : storageKey === 'vocaleap_spell_daily' ? 'spell'
               : 'sort'
    const completions = await fetchTodayModeCompletions(userId)
    if (completions.includes(mode)) {
      localStorage.setItem(localKey, '1')
      return 0
    }
  }
  localStorage.setItem(localKey, '1')
  return 1
}

// ---- メイン ----
export default function DailyQuiz() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('mode-select')
  const [questions, setQuestions] = useState([])
  const [score, setScore] = useState(0)
  const [reviewWords, setReviewWords] = useState([])
  const [selectedParts, setSelectedParts] = useState([])
  const [streakToast, setStreakToast] = useState(null)
  const [showSessionOverlay, setShowSessionOverlay] = useState(false)
  const [maskMode, setMaskMode] = useState(false)
  const [spellQuestions, setSpellQuestions] = useState([])
  const [spellResult, setSpellResult] = useState({ score: 0, total: 0, wrongAnswers: [] })
  const [sortInitialQuestions, setSortInitialQuestions] = useState([])
  const [sortResult, setSortResult] = useState({ cumulativeUnknown: [] })
  const [earnedPoints, setEarnedPoints] = useState(0)
  const [completeBonusPts, setCompleteBonusPts] = useState(0)
  const [showBonusOverlay, setShowBonusOverlay] = useState(false)
  const preStreakPhaseRef = useRef('result')
  const { recordDailyQuiz } = useUserStats()

  async function checkAndClaimCompleteBonus(userId) {
    const today = new Date().toISOString().slice(0, 10)
    const bonusKey = `vocaleap_complete_bonus_daily_${today}`
    if (localStorage.getItem(bonusKey)) return 0
    const allDone = localStorage.getItem(`vocaleap_practice_daily_${today}`)
                 && localStorage.getItem(`vocaleap_spell_daily_${today}`)
                 && localStorage.getItem(`vocaleap_sorting_daily_${today}`)
    if (!allDone) return 0
    localStorage.setItem(bonusKey, '1')
    if (userId) syncDailyModeCompletion(userId, new Date(), 'complete_bonus')
    const result = await recordDailyQuiz(10)
    if (result.streakUpdated) setStreakToast(result.currentStreak)
    return 10
  }

  async function handleSortStart() {
    const qs = await fetchSortQuestions()
    if (qs.length === 0) {
      alert('まずは4択練習やチャレンジで単語を学習してください')
      return
    }
    setSortInitialQuestions(qs)
    setPhase('sort-playing')
  }

  async function handleSortFinish({ cumulativeUnknown, cumulativeKnown }) {
    setSortResult({ cumulativeUnknown })
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id ?? null
    const pts = await claimDailyPoint('vocaleap_sorting_daily', userId)
    setEarnedPoints(pts)
    const result = await recordDailyQuiz(pts)
    if (result.streakUpdated) setStreakToast(result.currentStreak)
    db.dailyQuizHistory.add({ date: new Date() }).catch(() => {})
    if (userId) {
      syncDailyQuizHistory(userId, new Date())
      if (pts > 0) syncDailyModeCompletion(userId, new Date(), 'sort')
    }
    const bonus = await checkAndClaimCompleteBonus(userId)
    setCompleteBonusPts(bonus)
    preStreakPhaseRef.current = 'sort-end'
    setShowSessionOverlay(true)
    setPhase('sort-end')
  }

  async function handleSpellStart(parts) {
    const qs = await fetchSpellQuestions(parts)
    if (qs.length === 0) return
    setSpellQuestions(qs)
    setPhase('spell-playing')
  }

  async function handleSpellFinish(res) {
    setSpellResult({ score: res.score, total: res.total ?? SPELL_QUESTIONS, wrongAnswers: res.wrongAnswers ?? [] })
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id ?? null
    const pts = await claimDailyPoint('vocaleap_spell_daily', userId)
    setEarnedPoints(pts)
    const result = await recordDailyQuiz(pts)
    if (result.streakUpdated) setStreakToast(result.currentStreak)
    db.dailyQuizHistory.add({ date: new Date() }).catch(() => {})
    if (userId) {
      syncDailyQuizHistory(userId, new Date())
      if (pts > 0) syncDailyModeCompletion(userId, new Date(), 'spell')
    }
    const bonus = await checkAndClaimCompleteBonus(userId)
    setCompleteBonusPts(bonus)
    preStreakPhaseRef.current = 'spell-result'
    setShowSessionOverlay(true)
    setPhase('spell-result')
  }

  async function handleStart(parts, mask = false) {
    setMaskMode(mask)

    const hasChecked = parts.includes('__checked__')
    const regularParts = parts.filter(p => p !== '__checked__')

    let combined = []

    // チェックした単語を取得
    if (hasChecked) {
      const checkedEntries = await db.checked_words.toArray()
      const leapNums = checkedEntries.map(c => c.leapNumber)
      if (leapNums.length > 0) {
        const checkedWords = await db.words.where('leapNumber').anyOf(leapNums).and(sourceBookFilter).toArray()
        combined = [...combined, ...checkedWords]
      }
    }

    // 通常パートの単語を取得
    if (regularParts.length > 0) {
      const regularWords = await db.words.where('leapPart').anyOf(regularParts).and(sourceBookFilter).toArray()
      combined = [...combined, ...regularWords]
    }

    // 重複を除去（チェック単語と通常パートで被る場合）
    const seen = new Set()
    const deduped = combined.filter(w => {
      if (seen.has(w.id)) return false
      seen.add(w.id)
      return true
    })

    if (deduped.length < 4) return

    const pool = shuffle(deduped).slice(0, QUESTIONS)
    const allMeanings = deduped.map(w => w.meaning)

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
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id ?? null
    const pts = await claimDailyPoint('vocaleap_practice_daily', userId)
    setEarnedPoints(pts)
    const result = await recordDailyQuiz(pts)
    if (result.streakUpdated) setStreakToast(result.currentStreak)
    db.dailyQuizHistory.add({ date: new Date() }).catch(() => {})
    if (userId) {
      syncDailyQuizHistory(userId, new Date())
      if (pts > 0) syncDailyModeCompletion(userId, new Date(), 'practice')
    }
    const bonus = await checkAndClaimCompleteBonus(userId)
    setCompleteBonusPts(bonus)
    preStreakPhaseRef.current = 'result'
    setShowSessionOverlay(true)
    setPhase('result')
  }

  if (phase === 'mode-select') {
    return <ModeSelect
      onSelectMode={(mode) => {
        if (mode === 'spell') setPhase('spell-select')
        else if (mode === 'sort') handleSortStart()
        else setPhase('select')
      }}
      onBack={() => navigate('/')}
    />
  }
  if (phase === 'sort-playing') {
    return <SortingScreen initialQuestions={sortInitialQuestions} onFinish={handleSortFinish} onHome={() => navigate('/')} />
  }
  if (phase === 'sort-end') {
    return (
      <>
        {showSessionOverlay && (
          <SessionCompleteOverlay
            label="セッション完了！"
            onDone={() => {
              setShowSessionOverlay(false)
              if (completeBonusPts > 0) { setShowBonusOverlay(true) }
              else if (streakToast !== null) { setPhase('sort-streak') }
            }}
          />
        )}
        {showBonusOverlay && (
          <SessionCompleteOverlay
            label={'🏆 コンプリートボーナス\n+10pt！'}
            onDone={() => {
              setShowBonusOverlay(false)
              if (streakToast !== null) { setPhase('sort-streak') }
            }}
          />
        )}
        <SortingEndScreen
          cumulativeUnknown={sortResult.cumulativeUnknown}
          earnedPoints={earnedPoints}
          completeBonusPts={completeBonusPts}
          onHome={() => navigate('/')}
        />
      </>
    )
  }
  if (phase === 'sort-streak') {
    return <StreakToast streak={streakToast} onDone={() => { setStreakToast(null); setPhase('sort-end') }} />
  }
  if (phase === 'spell-select') {
    return <SpellPartSelect onStart={handleSpellStart} onBack={() => setPhase('mode-select')} />
  }
  if (phase === 'spell-playing') {
    return <SpellQuizScreen questions={spellQuestions} onFinish={handleSpellFinish} onHome={() => navigate('/')} />
  }
  if (phase === 'spell-result') {
    return (
      <>
        {showSessionOverlay && (
          <SessionCompleteOverlay
            label="セッション完了！"
            onDone={() => {
              setShowSessionOverlay(false)
              if (completeBonusPts > 0) { setShowBonusOverlay(true) }
              else if (streakToast !== null) { setPhase('spell-streak') }
            }}
          />
        )}
        {showBonusOverlay && (
          <SessionCompleteOverlay
            label={'🏆 コンプリートボーナス\n+10pt！'}
            onDone={() => {
              setShowBonusOverlay(false)
              if (streakToast !== null) { setPhase('spell-streak') }
            }}
          />
        )}
        <SpellSummaryScreen
          score={spellResult.score}
          total={spellResult.total}
          wrongAnswers={spellResult.wrongAnswers}
          earnedPoints={earnedPoints}
          onRetry={() => handleSpellStart(spellQuestions.map(q => q.leapPart).filter((v, i, a) => a.indexOf(v) === i))}
          onHome={() => navigate('/')}
        />
      </>
    )
  }
  if (phase === 'spell-streak') {
    return <StreakToast streak={streakToast} onDone={() => { setStreakToast(null); setPhase('spell-result') }} />
  }
  if (phase === 'select') {
    return <PartSelect onStart={handleStart} onBack={() => setPhase('mode-select')} />
  }
  if (phase === 'playing') {
    return <QuizScreen questions={questions} onFinish={handleFinish} onHome={() => navigate('/')} maskMode={maskMode} />
  }
  if (phase === 'result') {
    return (
      <>
        {showSessionOverlay && (
          <SessionCompleteOverlay
            label="セッション完了！"
            onDone={() => {
              setShowSessionOverlay(false)
              if (completeBonusPts > 0) { setShowBonusOverlay(true) }
              else if (streakToast !== null) { setPhase('streak') }
            }}
          />
        )}
        {showBonusOverlay && (
          <SessionCompleteOverlay
            label={'🏆 コンプリートボーナス\n+10pt！'}
            onDone={() => {
              setShowBonusOverlay(false)
              if (streakToast !== null) { setPhase('streak') }
            }}
          />
        )}
        <ResultScreen
          score={score}
          earnedPoints={earnedPoints}
          onReview={() => setPhase('review')}
          onHome={() => navigate('/')}
        />
      </>
    )
  }
  if (phase === 'streak') {
    return <StreakToast streak={streakToast} onDone={() => { setStreakToast(null); setPhase(preStreakPhaseRef.current) }} />
  }
  if (phase === 'review') {
    return <ReviewSlideshow words={reviewWords} onHome={() => navigate('/')} />
  }
  return null
}
