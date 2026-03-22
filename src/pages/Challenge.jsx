import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { useUserStats } from '../hooks/useUserStats'
import { findRoots } from '../utils/findRoots'
import { speak } from '../utils/speak'
import { playCorrect, playWrong } from '../utils/sound'
import WordCard from '../components/WordCard'
import WordDetailScreen from '../components/WordDetailScreen'
import StreakToast from '../components/StreakToast'
import { playChallengeClrSound } from '../utils/celebrationSounds'
import WordBadges from '../components/WordBadges'
import { addStudyLog } from '../utils/studyLog'
import { startSession, endSession } from '../utils/sessionLog'
import { incrementConsecutiveCorrect, resetConsecutiveCorrect } from '../utils/consecutiveCorrect'
import { sourceBookFilter } from '../utils/bookVersion'

const PARTS = ['Part1', 'Part2', 'Part3', 'Part4', 'α']
const GOAL = 30
const DEFAULT_TIMER_SECS = 7
const CM_DURATION = 3500 // ms per word in CM break

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return min > 0 ? `${min}分${sec}秒` : `${sec}秒`
}


function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 単語を〇〇〇〇に変換
function maskWord(word) {
  return word.replace(/[^ ]/g, '○')
}

// ---- CSS アニメーション定義 ----
const CM_STYLE = `
  @keyframes cm-progress {
    from { width: 0%; }
    to   { width: 100%; }
  }
  @keyframes cm-logo-in {
    0%   { opacity: 0; transform: scale(0.9); }
    100% { opacity: 1; transform: scale(1); }
  }
`

const CLEAR_STYLE = `
  @keyframes confetti-fall {
    0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
    100% { transform: translateY(110vh) rotate(var(--rotate, 540deg)); opacity: 0.4; }
  }
  @keyframes bounce-in {
    0%   { transform: scale(0) rotate(-12deg); opacity: 0; }
    55%  { transform: scale(1.2) rotate(4deg); }
    75%  { transform: scale(0.92); }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  @keyframes glow-text {
    0%, 100% { text-shadow: 0 0 12px #fbbf24, 0 0 35px #f59e0b, 0 0 70px #d97706; }
    50%       { text-shadow: 0 0 22px #fb923c, 0 0 55px #ef4444, 0 0 100px #dc2626; }
  }
  @keyframes star-out {
    0%   { transform: translate(0, 0) scale(1.2); opacity: 1; }
    100% { transform: translate(var(--tx), var(--ty)) scale(0.1); opacity: 0; }
  }
  @keyframes fade-in-up {
    0%   { opacity: 0; transform: translateY(20px); }
    100% { opacity: 1; transform: translateY(0); }
  }
`

// ---- 語族セクション（出題中の折りたたみ表示） ----
function WordFamilySection({ word }) {
  const [family, setFamily] = useState(null)
  const [members, setMembers] = useState([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
    setFamily(null)
    setMembers([])
    if (!word?.familyId) return

    async function fetchFamily() {
      const fam = await db.wordFamilies.get(word.familyId)
      if (!fam) return
      const siblings = await db.words
        .where('familyId').equals(word.familyId)
        .sortBy('leapNumber')
      setFamily(fam)
      setMembers(siblings)
    }
    fetchFamily()
  }, [word?.id, word?.familyId])

  if (!family) return null

  return (
    <div className="w-full max-w-sm md:max-w-[600px] mt-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 rounded-xl bg-slate-700/60 hover:bg-slate-700 transition-colors text-sm"
      >
        <span className="flex items-center gap-2 text-blue-300 font-semibold">
          <span>🧬</span>
          <span>語族 [{family.root}] {family.rootMeaning}</span>
        </span>
        <span className="text-slate-400">{open ? '▲' : '▼'} {members.length}語</span>
      </button>

      {open && (
        <div className="mt-1 px-4 py-3 bg-slate-800/80 rounded-xl flex flex-wrap gap-2">
          {members.map(m => (
            <span
              key={m.id}
              className={`px-2 py-1 rounded-lg text-sm font-mono ${
                m.id === word.id
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-slate-700 text-slate-300'
              }`}
            >
              <span className="text-slate-500 text-xs mr-1">#{m.leapNumber}</span>
              {m.word}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- デイリーチャレンジ開始画面 ----
function DailyStartScreen({ onStart, timerSecs, alreadyDone, alphaCount }) {
  const [includeAlpha, setIncludeAlpha] = useState(false)
  const navigate = useNavigate()
  const hasAlpha = alphaCount > 0

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[600px] mx-auto px-5 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm active:opacity-60">← 戻る</button>
          <h1 className="text-lg font-bold">📖 30問チャレンジ</h1>
        </div>
      </div>
      <div className="flex flex-col items-center px-4 py-8">
      <p className="text-slate-400 text-sm mb-0.5">1日1回・ノーミス30問クリア</p>
      <p className="text-slate-400 text-sm mb-1">Part1〜4全体から出題</p>
      <p className="text-slate-500 text-sm mb-6">⏱ 1問 {timerSecs} 秒・時間切れで終了</p>

      {alreadyDone && (
        <div className="w-full max-w-sm md:max-w-[600px] mb-5 px-4 py-3 bg-amber-900/30 border border-amber-700 rounded-xl text-amber-300 text-sm text-center">
          今日はすでにクリア済みです。明日また挑戦しよう！
        </div>
      )}

      {/* ポイント説明 */}
      <div className="w-full max-w-sm md:max-w-[600px] bg-slate-800 rounded-xl px-4 py-4 mb-4 text-sm">
        <div className="text-slate-400 font-bold mb-3">ポイント計算</div>
        <div className="flex justify-between mb-1">
          <span className="text-slate-300">通常単語 1問正解</span>
          <span className="text-blue-400 font-bold">+1pt</span>
        </div>
        <div className="flex justify-between mb-1">
          <span className="text-slate-300">捕獲済み単語 1問正解</span>
          <span className="text-cyan-400 font-bold">+2pt</span>
        </div>
        {includeAlpha && (
          <div className="flex justify-between mb-1">
            <span className="text-slate-300">αあり 全問クリアボーナス</span>
            <span className="text-purple-400 font-bold">+15pt</span>
          </div>
        )}
      </div>

      {/* αチェックボックス（α単語がDBに存在する場合のみ表示） */}
      {hasAlpha && (
        <div className="w-full max-w-sm md:max-w-[600px] mb-5">
          <label className={`flex items-center gap-3 px-4 py-4 bg-slate-800 border-2 rounded-xl cursor-pointer transition-all ${
            includeAlpha ? 'border-purple-500 bg-purple-900/20' : 'border-slate-600'
          } ${alreadyDone ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
              type="checkbox"
              checked={includeAlpha}
              onChange={e => !alreadyDone && setIncludeAlpha(e.target.checked)}
              className="w-5 h-5 accent-purple-500"
              disabled={alreadyDone}
            />
            <div>
              <div className="font-bold text-base text-white">α（300語）を含める</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {includeAlpha ? 'Part1〜4 + α（300語）から出題' : 'クリア時に+15ポイント'}
              </div>
            </div>
          </label>
        </div>
      )}

      <button
        onClick={() => onStart(includeAlpha)}
        disabled={alreadyDone}
        className="w-full max-w-sm md:max-w-[600px] py-5 text-xl font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-2xl transition-colors"
      >
        スタート
      </button>
      </div>
    </div>
  )
}

// ---- CMブレイク ----
// props:
//   words         - 直前10問の単語配列
//   timings       - [{word, timeRemaining}] 各問のわかる押下時の残り秒数
//   blockNumber   - 1(10問後) or 2(20問後) or 3(クリア後レビュー)
//   onContinue    - 次のブロックへ進む
//   onHonestEnd   - (未使用・後方互換のため残す)
//   continueLabel - 続行ボタンのラベル（省略時はデフォルト）
function CMBreak({ words, timings, blockNumber, onContinue, onHonestEnd, continueLabel }) {
  // phase: 'intro' → 'slideshow' → 'choice'
  const [phase, setPhase] = useState('intro')
  const navigate = useNavigate()
  const [introOpacity, setIntroOpacity] = useState(1)
  const [idx, setIdx] = useState(0)
  const [familyData, setFamilyData] = useState(null)
  const [familyWords, setFamilyWords] = useState([])  // 同語族の単語リスト
  const [allRoots, setAllRoots] = useState([])
  const [rootsHint, setRootsHint] = useState([])
  const [selectedWord, setSelectedWord] = useState(null)

  // 語源データをDB から一括取得（マウント時1回）
  useEffect(() => {
    db.roots.toArray().then(r => setAllRoots(r)).catch(() => {})
  }, []) // eslint-disable-line

  const word = words[Math.min(idx, words.length - 1)]
  const nextQuestionNum = blockNumber * 10 + 1 // 11 or 21

  // 一番「怪しかった」単語（わかるを押すのが一番遅かった = timeRemaining最小）
  const suspiciousWord = useMemo(() => {
    if (!timings || timings.length === 0) return words[0]
    return timings.reduce((min, t) =>
      t.timeRemaining < min.timeRemaining ? t : min
    ).word
  }, [timings, words])

  // ---- イントロ: 1.5s表示 → 1s フェードアウト → slideshow ----
  useEffect(() => {
    if (phase !== 'intro') return
    setIntroOpacity(1)
    let t1, t2
    t1 = setTimeout(() => {
      setIntroOpacity(0)
      t2 = setTimeout(() => {
        setPhase('slideshow')
      }, 1000)
    }, 1500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [phase])

  // ※スライドショーフェーズは WordDetailScreen に委譲したため、
  //   語族・語源・読み上げの useEffect はここでは不要（二重実行防止）

  function handleAdvance() {
    if (phase !== 'slideshow') return
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    if (idx + 1 >= words.length) {
      setPhase('choice')
    } else {
      setIdx(idx + 1)
    }
  }

  function handleRepeat() {
    setIdx(0)
    setPhase('slideshow')
  }

  // ---- イントロ画面 ----
  if (phase === 'intro') {
    return (
      <div
        className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center"
        style={{ opacity: introOpacity, transition: 'opacity 1s ease' }}
      >
        <style>{CM_STYLE}</style>
        <div
          className="text-center"
          style={{
            animationName: 'cm-logo-in',
            animationDuration: '0.5s',
            animationFillMode: 'both',
          }}
        >
          <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.25em] mb-5">
            ここで
          </p>
          <h1
            className="text-7xl font-black tracking-tight"
            style={{
              color: '#fbbf24',
              textShadow: '0 0 18px #f59e0b, 0 0 45px #d97706',
            }}
          >
            CM Break
          </h1>
          <p className="text-slate-500 text-sm mt-5">
            直前の{words.length}問を振り返ります
          </p>
        </div>
      </div>
    )
  }

  // ---- 3択画面 ----
  if (phase === 'choice') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6 py-8">
        <style>{CM_STYLE}</style>
        <h2 className="text-xl font-bold text-slate-200 mb-2">CM Break 終了</h2>
        <p className="text-slate-500 text-sm mb-8">次のアクションを選んでください</p>

        <div className="w-full max-w-sm md:max-w-[600px] flex flex-col gap-4">
          {/* 繰り返す */}
          <button
            onClick={handleRepeat}
            className="w-full py-4 px-5 text-base font-bold bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl transition-colors text-left"
          >
            🔁 CM Breakをもう一度繰り返す
          </button>

          {/* 次のブロックへ */}
          <button
            onClick={onContinue}
            className="w-full py-4 px-5 text-base font-bold bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors text-left"
          >
            ▶️ {continueLabel ?? `${nextQuestionNum}問目に進む`}
          </button>

          {/* 終了してホームへ */}
          <button
            onClick={() => navigate('/')}
            className="w-full py-4 px-5 text-base font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors text-left text-slate-400 hover:text-slate-200"
          >
            🏠 終了してホームへ
          </button>
        </div>

        {/* 怪しい単語のヒント表示 */}
        {suspiciousWord && (
          <p className="text-slate-700 text-xs mt-8 text-center">
            一番あやしい単語：
            <span className="text-slate-500 font-bold ml-1">{suspiciousWord.word}</span>
          </p>
        )}
      </div>
    )
  }

  // ---- スライドショー → 共通 WordDetailScreen ----
  // 「終了する」で choice 画面へ遷移
  return (
    <WordDetailScreen
      word={words[0]}
      sessionWords={words}
      initialIndex={0}
      backLabel="終了する"
      backAsLink={true}
      onBack={() => {
        try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
        setPhase('choice')
      }}
    />
  )
}

// ---- 出題画面（2段階4択制） ----
// words は {word, choices, correctIdx}[] の配列
function Quiz({ words, timerSecs, onClear, onTimeout, onHonestEnd }) {
  const [current, setCurrent] = useState(0)
  const [streak, setStreak] = useState(0)
  const [flipping, setFlipping] = useState(false)
  const [timeLeft, setTimeLeft] = useState(timerSecs)
  const [choicesVisible, setChoicesVisible] = useState(false) // 2段階制
  const [selectedChoice, setSelectedChoice] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [cmData, setCMData] = useState(null)
  const [wordRevealed, setWordRevealed] = useState(false)
  const [showMaskAnnouncement, setShowMaskAnnouncement] = useState(false)
  const navigate = useNavigate()

  const doneRef = useRef(false)
  const blockTimingsRef = useRef([])
  const capturedTimeLeftRef = useRef(timerSecs)
  const choicesRef = useRef(null)
  const questionStartRef = useRef(Date.now())
  const sessionIdRef = useRef(null)

  const question = words[current]
  const word = question?.word

  const counterColor =
    streak >= 28 ? 'text-red-400' :
    streak >= 20 ? 'text-amber-400' :
    'text-blue-400'
  const urgentTimer = timeLeft <= 3

  // 問題が変わるたびにリセット
  useEffect(() => {
    setChoicesVisible(false)
    setSelectedChoice(null)
    setRevealed(false)
    setWordRevealed(false)
    capturedTimeLeftRef.current = timerSecs
    // 問題表示ログ
    questionStartRef.current = Date.now()
    const _q = words[current]
    if (_q?.word) addStudyLog({ leapNumber: _q.word.leapNumber, word: _q.word.word, eventType: 'studied', mode: 'challenge' })
  }, [current, timerSecs])

  // タイマー（CMブレイク中・アナウンス中は停止）
  useEffect(() => {
    if (cmData) return
    if (showMaskAnnouncement) return
    doneRef.current = false
    setTimeLeft(timerSecs)

    const timerId = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerId)
          if (!doneRef.current) {
            doneRef.current = true
            handleTimeoutInternal()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timerId)
  }, [current, cmData, showMaskAnnouncement]) // eslint-disable-line

  // 問題表示時に単語を読み上げ（アナウンス中は停止）
  useEffect(() => {
    if (cmData) return
    if (showMaskAnnouncement) return
    if (word?.word) speak(word.word, 'en-US', 0.85)
    return () => {
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    }
  }, [current, cmData, showMaskAnnouncement]) // eslint-disable-line

  // セッション管理
  useEffect(() => {
    startSession('challenge').then(id => { sessionIdRef.current = id })
    return () => { endSession(sessionIdRef.current) }
  }, []) // eslint-disable-line

  async function handleTimeoutInternal() {
    const existing = await db.cards.where('wordId').equals(word.id).first()
    if (existing) {
      await db.cards.update(existing.id, {
        incorrectCount: (existing.incorrectCount ?? 0) + 1,
        studyCount: (existing.studyCount ?? 0) + 1,
        lastReviewed: new Date(),
      })
    } else {
      await db.cards.add({
        wordId: word.id, lastReviewed: new Date(),
        correctCount: 0, incorrectCount: 1, studyCount: 1,
      })
    }
    resetConsecutiveCorrect()
    addStudyLog({
      leapNumber: word.leapNumber,
      word: word.word,
      eventType: 'incorrect',
      mode: 'challenge',
      responseTime: parseFloat(((Date.now() - questionStartRef.current) / 1000).toFixed(2)),
    })
    onTimeout(word, streak)
  }

  // Stage 1：「4択を表示」タップ
  function handleReveal() {
    if (doneRef.current) return
    capturedTimeLeftRef.current = timeLeft
    setChoicesVisible(true)
    // 選択肢Dが画面外に出ないよう少し遅延してスクロール
    setTimeout(() => {
      choicesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 60)
  }

  // Stage 2：選択肢タップ
  async function handleAnswer(choiceIdx) {
    if (doneRef.current || revealed) return
    doneRef.current = true
    setSelectedChoice(choiceIdx)
    setRevealed(true)

    const isCorrect = choiceIdx === question.correctIdx

    // 押した瞬間に音を鳴らす
    if (isCorrect) {
      playCorrect()
      incrementConsecutiveCorrect()
      addStudyLog({
        leapNumber: word.leapNumber,
        word: word.word,
        eventType: 'correct',
        mode: 'challenge',
        responseTime: parseFloat(((Date.now() - questionStartRef.current) / 1000).toFixed(2)),
      })
    } else {
      playWrong()
      resetConsecutiveCorrect()
      addStudyLog({
        leapNumber: word.leapNumber,
        word: word.word,
        eventType: 'incorrect',
        mode: 'challenge',
        responseTime: parseFloat(((Date.now() - questionStartRef.current) / 1000).toFixed(2)),
      })
    }

    if (isCorrect) {
      const existing = await db.cards.where('wordId').equals(word.id).first()
      if (existing) {
        await db.cards.update(existing.id, {
          correctCount: (existing.correctCount ?? 0) + 1,
          studyCount: (existing.studyCount ?? 0) + 1,
          lastReviewed: new Date(),
        })
      } else {
        await db.cards.add({
          wordId: word.id, lastReviewed: new Date(),
          correctCount: 1, incorrectCount: 0, studyCount: 1,
        })
      }

      const next = streak + 1
      blockTimingsRef.current.push({ word, timeRemaining: capturedTimeLeftRef.current })

      if (next >= GOAL) {
        const lastWords   = blockTimingsRef.current.map(t => t.word)
        const lastTimings = [...blockTimingsRef.current]
        setTimeout(() => onClear(lastWords, lastTimings), 600)
        return
      }

      setTimeout(() => {
        setStreak(next)
        setCurrent(prev => (prev + 1) % words.length)
        setFlipping(false)

        if (next === 10 || next === 20) {
          const lastTen = words.slice(next - 10, next).map(q => q.word)
          const timings = [...blockTimingsRef.current]
          blockTimingsRef.current = []
          setCMData({ words: lastTen, timings, blockNumber: next / 10 })
        }
      }, 700)
    } else {
      // 不正解 → 記録してからチャレンジ終了
      setTimeout(async () => {
        await handleTimeoutInternal()
      }, 900)
    }
  }

  // 伏字アナウンスオーバーレイ
  if (showMaskAnnouncement) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6 text-center">
        <div
          style={{
            animation: 'bounce-in 0.5s both',
          }}
        >
          <div className="text-7xl mb-6">🙈</div>
          <h2 className="text-2xl font-black mb-3 text-purple-300">最後の10問！</h2>
          <p className="text-white text-lg font-bold leading-relaxed mb-2">
            英単語が伏字になるよ！
          </p>
          <p className="text-slate-400 text-sm">
            音声を聞いて意味を考えよう
          </p>
          <div className="mt-8 flex gap-1 justify-center">
            {[0,1,2].map(i => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-purple-400"
                style={{ animation: `pulse 1s ${i * 0.3}s infinite` }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // CMブレイク中
  if (cmData) {
    return (
      <CMBreak
        words={cmData.words}
        timings={cmData.timings}
        blockNumber={cmData.blockNumber}
        timerSecs={timerSecs}
        onContinue={() => {
          if (cmData.blockNumber === 2) {
            // 21問目突入 → 伏字アナウンスを2.5秒表示してから出題へ
            setCMData(null)
            setShowMaskAnnouncement(true)
            setTimeout(() => setShowMaskAnnouncement(false), 3500)
          } else {
            setCMData(null)
          }
        }}
        onHonestEnd={(suspiciousWord) => {
          setCMData(null)
          onHonestEnd(suspiciousWord, streak)
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center px-4 py-6 select-none">
      {/* 連続正解カウンター */}
      <div className="text-center mb-3">
        <div className={`text-7xl font-black tabular-nums ${counterColor} transition-colors duration-300`}>
          {streak}
        </div>
        <div className="text-slate-500 text-lg">/ {GOAL}</div>
      </div>

      {/* 正解進捗バー */}
      <div className="w-full max-w-sm md:max-w-[600px] h-2 bg-slate-700 rounded-full mb-4 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            streak >= 28 ? 'bg-red-500' : streak >= 20 ? 'bg-amber-500' : 'bg-blue-500'
          }`}
          style={{ width: `${(streak / GOAL) * 100}%` }}
        />
      </div>

      {/* タイマー */}
      <div className="w-full max-w-sm md:max-w-[600px] mb-4">
        <div className={`text-center text-2xl font-black mb-2 transition-colors ${
          urgentTimer ? 'text-red-400 animate-pulse' : 'text-slate-400'
        }`}>
          あと {timeLeft} 秒
        </div>
        <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ease-linear duration-1000 ${
              urgentTimer ? 'bg-red-500' : 'bg-amber-400'
            }`}
            style={{ width: `${(timeLeft / timerSecs) * 100}%` }}
          />
        </div>
      </div>

      {/* 単語カード */}
      <div className={`w-full max-w-sm md:max-w-[600px] rounded-3xl px-6 py-5 mb-3 text-center transition-opacity duration-150 ${
        flipping ? 'opacity-0' : 'opacity-100'
      } ${streak >= 20 ? 'bg-purple-950/70 border border-purple-800' : 'bg-slate-800'}`}>
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-slate-500 text-sm">No. {word.leapNumber} ({word.leapPart})</span>
          <WordBadges isCaptured={question.isCaptured} />
        </div>
        {/* 伏字モード：streak >= 20 */}
        <div
          className="font-black tracking-tight leading-tight mb-1"
          style={streak >= 20 && !wordRevealed ? {
            fontSize: word.word.length <= 5  ? '2.25rem'
              : word.word.length <= 8  ? '1.875rem'
              : word.word.length <= 11 ? '1.5rem'
              : word.word.length <= 15 ? '1.25rem' : '1rem',
            letterSpacing: '0.05em',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            color: '#c4b5fd',
          } : {
            fontSize: word.word.length <= 10 ? '3rem'
              : word.word.length <= 13 ? '2.25rem'
              : word.word.length <= 17 ? '1.75rem'
              : word.word.length <= 21 ? '1.375rem' : '1.125rem',
            maxWidth: '100%',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {streak >= 20 && !wordRevealed ? maskWord(word.word) : word.word}
        </div>
        <div className="text-slate-500 text-sm mt-1">{word.partOfSpeech}</div>
        {streak >= 20 && !wordRevealed && (
          <button
            onClick={() => setWordRevealed(true)}
            className="mt-2 text-xs text-purple-400 hover:text-purple-200 bg-purple-900/50 hover:bg-purple-900 px-4 py-1.5 rounded-full transition-colors"
          >
            単語を表示
          </button>
        )}
      </div>

      {/* 語族セクション */}
      <div className={`w-full flex justify-center transition-opacity duration-150 ${
        flipping ? 'opacity-0' : 'opacity-100'
      }`}>
        <WordFamilySection word={word} />
      </div>

      {/* ボタンエリア */}
      <div ref={choicesRef} className="w-full max-w-sm md:max-w-[600px] mt-4 flex flex-col gap-2">
        {!choicesVisible ? (
          /* Stage 1 */
          <>
            <button
              onClick={handleReveal}
              className="w-full py-5 text-xl font-bold bg-slate-700 hover:bg-slate-600 border-2 border-slate-500 rounded-2xl transition-colors active:scale-95"
            >
              💡 4択を表示
            </button>
            <p className="text-center text-slate-600 text-xs mt-1">頭の中で意味を考えてからタップ</p>
          </>
        ) : (
          /* Stage 2：4択 */
          question.choices.map((choice, i) => {
            let cls = 'bg-slate-800 border-slate-700 hover:bg-slate-700 active:scale-95'
            if (revealed) {
              if (i === question.correctIdx) cls = 'bg-green-800 border-green-500'
              else if (i === selectedChoice) cls = 'bg-red-900 border-red-600'
              else cls = 'bg-slate-800 border-slate-700 opacity-40'
            }
            return (
              <button
                key={i}
                onClick={() => handleAnswer(i)}
                disabled={revealed}
                className={`w-full py-3 px-4 border-2 rounded-xl text-left transition-all ${cls}`}
              >
                <span className="text-slate-400 font-bold text-sm mr-2">{['A', 'B', 'C', 'D'][i]}</span>
                <span className="text-white font-bold text-base">{choice}</span>
              </button>
            )
          })
        )}
      </div>

      {/* 中断ボタン */}
      <button
        onClick={() => navigate('/')}
        className="mt-5 text-slate-600 hover:text-slate-400 text-sm transition-colors"
      >
        ホームへ
      </button>
    </div>
  )
}

// ---- 終了画面（時間切れ・正直終了 共通） ----
// reason: 'timeout' | 'honest'
function TimeoutScreen({ word, streak, reason, earnedPoints, capturedCount, onRetry, onHome, onWordDetail }) {
  const isHonest = reason === 'honest'
  const normalCount = streak - capturedCount

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center px-4 text-center">
      <div className="text-5xl mb-4">{isHonest ? '🙏' : '⏰'}</div>
      <p className="text-slate-400 text-xl font-bold mb-1">{word.leapPart} &nbsp;No.{word.leapNumber}</p>
      <button
        onClick={onWordDetail}
        className="mb-3 active:opacity-70 transition-opacity"
        title="タップして単語詳細を見る"
      >
        <WordCard word={word} textClassName="text-6xl font-black" />
      </button>
      <p
        onClick={onWordDetail}
        className="text-slate-200 text-xl font-medium mb-1 cursor-pointer active:opacity-70"
      >
        {word.meaning}
      </p>
      <p className="text-slate-500 text-xs mb-4">タップして詳細を見る →</p>
      <p className="text-slate-600 text-sm mb-4">
        {isHonest
          ? `ブロック正解 ${streak} 問で終了`
          : `連続正解 ${streak} 問でストップ`}
      </p>

      {/* ポイント獲得 */}
      {earnedPoints > 0 && (
        <div className="w-full max-w-sm md:max-w-[600px] bg-blue-900/40 border border-blue-700 rounded-2xl px-6 py-4 mb-4">
          <p className="text-blue-300 text-xs font-bold uppercase tracking-wider mb-2">獲得ポイント</p>
          <div className="text-4xl font-black text-blue-400 mb-2">+{earnedPoints} pt</div>
          <div className="flex justify-center gap-4 text-xs text-slate-400">
            {normalCount > 0 && <span>通常 {normalCount}問 × 1pt</span>}
            {capturedCount > 0 && <span className="text-cyan-400">🎯捕獲済 {capturedCount}問 × 2pt</span>}
          </div>
        </div>
      )}

      <div className="w-full max-w-sm md:max-w-[600px] bg-amber-900/30 border border-amber-700 rounded-2xl px-6 py-5 mb-8">
        {isHonest ? (
          <>
            <p className="text-amber-200 text-lg font-bold leading-relaxed">
              正直に教えてくれてありがとう。
            </p>
            <p className="text-amber-300 text-base mt-2">
              かならずLEAPを開いて確認しましょう！
            </p>
          </>
        ) : (
          <>
            <p className="text-amber-200 text-lg font-bold leading-relaxed">
              かならずLEAPを開いて<br />内容を確認しましょう。
            </p>
            <p className="text-amber-300 text-base mt-2">
              例文の音読も忘れずに！
            </p>
          </>
        )}
      </div>

      <div className="w-full max-w-sm md:max-w-[600px] flex flex-col gap-4">
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

// ---- 大量紙吹雪（120枚） ----
function HeavyConfetti() {
  const colors = [
    '#3b82f6', '#f59e0b', '#10b981', '#ef4444',
    '#8b5cf6', '#f97316', '#ec4899', '#06b6d4', '#84cc16',
  ]
  const pieces = useMemo(() => Array.from({ length: 120 }, (_, i) => ({
    id: i,
    left: `${(Math.random() * 100).toFixed(1)}%`,
    delay: `${(Math.random() * 3).toFixed(2)}s`,
    duration: `${(2 + Math.random() * 2.5).toFixed(2)}s`,
    color: colors[i % colors.length],
    size: `${(5 + Math.random() * 11).toFixed(1)}px`,
    rotate: `${Math.random() > 0.5 ? '' : '-'}${(200 + Math.random() * 400).toFixed(0)}deg`,
    borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '2px' : '0',
  })), []) // eslint-disable-line

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {pieces.map(p => (
        <div
          key={p.id}
          className="absolute top-0"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.borderRadius,
            animationName: 'confetti-fall',
            animationDelay: p.delay,
            animationDuration: p.duration,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
            '--rotate': p.rotate,
          }}
        />
      ))}
    </div>
  )
}

// ---- スター放射演出 ----
function StarBurst() {
  const EMOJIS = ['⭐', '✨', '🌟', '💥', '🎊']
  const stars = useMemo(() => Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * 360
    const dist = 100 + Math.random() * 160
    const tx = (Math.cos((angle * Math.PI) / 180) * dist).toFixed(1)
    const ty = (Math.sin((angle * Math.PI) / 180) * dist).toFixed(1)
    return {
      id: i,
      tx,
      ty,
      delay: `${(Math.random() * 2.5).toFixed(2)}s`,
      emoji: EMOJIS[i % EMOJIS.length],
    }
  }), []) // eslint-disable-line

  return (
    <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-0">
      {stars.map(s => (
        <div
          key={s.id}
          className="absolute text-3xl"
          style={{
            '--tx': `${s.tx}px`,
            '--ty': `${s.ty}px`,
            animationName: 'star-out',
            animationDuration: '2.2s',
            animationDelay: s.delay,
            animationTimingFunction: 'ease-out',
            animationIterationCount: 'infinite',
          }}
        >
          {s.emoji}
        </div>
      ))}
    </div>
  )
}

// ---- クリア画面（ポイント内訳アニメーション） ----
function ClearScreen({ parts, elapsed, earnedPoints, capturedCount, normalCount, includeAlpha, cmWords, cmTimings, onRetry, onHome }) {
  const [displayPoints, setDisplayPoints] = useState(0)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showButtons, setShowButtons] = useState(false)
  const [showCM, setShowCM] = useState(false)
  const rafRef = useRef(null)

  useEffect(() => {
    if (showCM) return
    playChallengeClrSound()
    speak('Congratulations! Perfect score!', 'en-US', 0.9)

    // 内訳を先に表示
    const t1 = setTimeout(() => setShowBreakdown(true), 400)
    // カウントアップアニメーション (0 → earnedPoints over 1.4s)
    const t2 = setTimeout(() => {
      const target = earnedPoints ?? 0
      const DURATION = 1400
      const startTime = Date.now()
      function tick() {
        const elapsed2 = Date.now() - startTime
        const progress = Math.min(1, elapsed2 / DURATION)
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplayPoints(Math.round(eased * target))
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }, 700)
    const t3 = setTimeout(() => setShowButtons(true), 3800)

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    }
  }, [showCM]) // eslint-disable-line

  const now = new Date()
  const dateStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ` +
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  if (showCM && cmWords && cmWords.length > 0) {
    return (
      <CMBreak
        words={cmWords}
        timings={cmTimings ?? []}
        blockNumber={3}
        onContinue={() => setShowCM(false)}
        continueLabel="クリア画面に戻る"
        onHonestEnd={() => setShowCM(false)}
      />
    )
  }

  const normalPts = normalCount ?? 0
  const capPts = (capturedCount ?? 0) * 2
  const alphaPts = includeAlpha ? 15 : 0
  const capCount = capturedCount ?? 0
  const normCount = normalCount ?? 0

  return (
    <div className="min-h-screen text-white flex flex-col items-center justify-center px-4 text-center overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0a0a1a 0%, #0f172a 60%, #050510 100%)' }}>
      <style>{`
        ${CLEAR_STYLE}
        @keyframes clrTrophy {
          0%   { transform: scale(0) rotate(-20deg); opacity: 0; }
          55%  { transform: scale(1.3) rotate(5deg);  opacity: 1; }
          72%  { transform: scale(0.88) rotate(-3deg); }
          86%  { transform: scale(1.08) rotate(2deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes clrTitle {
          from { opacity: 0; transform: translateY(24px) scale(.92); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes clrRow {
          from { opacity: 0; transform: translateX(-20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes clrTotal {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          80%  { transform: scale(0.93); }
          100% { transform: scale(1); }
        }
        @keyframes clrGlow {
          0%,100% { text-shadow: 0 0 20px rgba(251,191,36,.8), 0 0 50px rgba(251,191,36,.4); }
          50%      { text-shadow: 0 0 40px rgba(251,191,36,1),  0 0 90px rgba(251,191,36,.6); }
        }
        @keyframes clrPulseBox {
          0%,100% { box-shadow: 0 0 0 2px rgba(251,191,36,.4), 0 0 30px rgba(251,191,36,.2); }
          50%      { box-shadow: 0 0 0 3px rgba(251,191,36,.7), 0 0 60px rgba(251,191,36,.4); }
        }
      `}</style>
      <HeavyConfetti />
      <StarBurst />

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm md:max-w-[600px]">
        {/* トロフィー */}
        <div style={{ fontSize: 88, lineHeight: 1, animation: 'clrTrophy .65s cubic-bezier(0.34,1.56,0.64,1) both' }}>
          🏆
        </div>

        {/* タイトル */}
        <h1 className="text-4xl font-black mt-3 mb-1"
          style={{ color: '#fbbf24', animation: 'clrTitle .4s ease-out .25s both, clrGlow 2s ease-in-out 1s infinite' }}>
          30問クリア！！！
        </h1>
        <p className="text-slate-400 text-sm mb-1">{parts.includes('α') ? 'Part1〜α' : 'Part1〜4'}</p>
        {elapsed != null && (
          <p className="text-slate-500 text-xs mb-4">
            ⏱ {formatElapsed(elapsed)} &nbsp;·&nbsp; {dateStr}
          </p>
        )}

        {/* ポイント内訳ボックス */}
        {showBreakdown && (
          <div className="w-full rounded-2xl mb-5 overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(251,191,36,.25)', animation: 'clrPulseBox 2s ease-in-out 1s infinite' }}>
            {/* 通常単語 */}
            <div className="flex justify-between items-center px-5 py-3 border-b border-white/5"
              style={{ animation: 'clrRow .35s ease-out .1s both', opacity: 0 }}>
              <span className="text-slate-300 text-sm">通常単語 <span className="text-slate-500">{normCount}問 × 1pt</span></span>
              <span className="font-bold text-white">+{normalPts}pt</span>
            </div>
            {/* 捕獲済み */}
            {capCount > 0 && (
              <div className="flex justify-between items-center px-5 py-3 border-b border-white/5"
                style={{ animation: 'clrRow .35s ease-out .25s both', opacity: 0 }}>
                <div className="text-left">
                  <div className="text-cyan-300 text-sm">捕獲済み単語 <span className="text-slate-500">{capCount}問 × 2pt</span></div>
                  <div className="text-xs text-cyan-500/70">🎯 捕獲ボーナス +{capCount}pt！</div>
                </div>
                <span className="font-bold text-cyan-300">+{capPts}pt</span>
              </div>
            )}
            {/* αボーナス */}
            {includeAlpha && (
              <div className="flex justify-between items-center px-5 py-3 border-b border-white/5"
                style={{ animation: 'clrRow .35s ease-out .4s both', opacity: 0 }}>
                <div className="text-left">
                  <div className="text-purple-300 text-sm">α Part クリアボーナス</div>
                </div>
                <span className="font-bold text-purple-300">+{alphaPts}pt</span>
              </div>
            )}
            {/* 合計 */}
            <div className="flex justify-between items-center px-5 py-4"
              style={{ background: 'rgba(251,191,36,0.08)' }}>
              <span className="text-slate-300 font-bold">合計</span>
              <span className="font-black text-3xl"
                style={{
                  fontFamily: "'Bebas Neue', system-ui, sans-serif",
                  color: '#fbbf24',
                  animation: 'clrTotal .45s cubic-bezier(0.34,1.56,0.64,1) .65s both',
                }}>
                +{displayPoints}pt
              </span>
            </div>
          </div>
        )}

        {/* ボタン */}
        {showButtons ? (
          <div className="flex flex-col gap-3 w-full"
            style={{ animation: 'fade-in-up .4s ease-out both' }}>
            {cmWords && cmWords.length > 0 && (
              <button
                onClick={() => setShowCM(true)}
                className="w-full py-4 text-lg font-bold bg-amber-600 hover:bg-amber-500 rounded-2xl transition-colors"
              >
                📺 CM Breakを見る
              </button>
            )}
            <button
              onClick={onHome}
              className="w-full py-4 text-lg font-bold bg-slate-700 hover:bg-slate-600 rounded-2xl transition-colors"
            >
              ホームへ
            </button>
          </div>
        ) : (
          <div className="h-14 flex items-center">
            <p className="text-slate-600 text-xs animate-pulse">集計中…</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- メイン ----
export default function Challenge() {
  const [phase, setPhase] = useState('select')
  const [words, setWords] = useState([])
  const [selectedParts, setSelectedParts] = useState([])
  const [includeAlpha, setIncludeAlpha] = useState(false)
  const [alreadyDone, setAlreadyDone] = useState(false)
  const [alphaCount, setAlphaCount] = useState(0)
  const [timeoutWord, setTimeoutWord] = useState(null)
  const [timeoutStreak, setTimeoutStreak] = useState(0)
  const [timeoutReason, setTimeoutReason] = useState('timeout') // 'timeout' | 'honest'
  const [showTimeoutDetail, setShowTimeoutDetail] = useState(false)
  const [elapsed, setElapsed] = useState(null)
  const [earnedPoints, setEarnedPoints] = useState(0)
  const [capturedWordCount, setCapturedWordCount] = useState(0)
  const [normalWordCount, setNormalWordCount] = useState(0)
  const [clearWords, setClearWords] = useState([])
  const [clearTimings, setClearTimings] = useState([])
  const [timerSecs] = useState(DEFAULT_TIMER_SECS)
  const [streakToast, setStreakToast] = useState(null)
  const [timeoutEarnedPoints, setTimeoutEarnedPoints] = useState(0)
  const [timeoutCapturedCount, setTimeoutCapturedCount] = useState(0)
  const startTimeRef = useRef(null)
  const { stats, recordChallengeClear, recordStudy, addPoints } = useUserStats()
  const navigate = useNavigate()

  // 今日クリア済みか確認（Supabase同期済みの stats を使用）
  useEffect(() => {
    if (stats?.challengeLastDate && isSameDay(new Date(stats.challengeLastDate), new Date())) {
      setAlreadyDone(true)
    }
  }, [stats])

  // α単語数をDBから取得
  useEffect(() => {
    db.words.where('leapPart').equals('α').count()
      .then(n => setAlphaCount(n))
      .catch(() => {})
  }, [])

  async function handleStart(incAlpha) {
    const useAlpha = incAlpha
    setIncludeAlpha(useAlpha)
    const parts = useAlpha
      ? ['Part1', 'Part2', 'Part3', 'Part4', 'α']
      : ['Part1', 'Part2', 'Part3', 'Part4']

    const allWords = await db.words.where('leapPart').anyOf(parts).and(sourceBookFilter).toArray()
    if (allWords.length === 0) return

    const shuffled = shuffle(allWords)
    let pool = [...shuffled]
    while (pool.length < GOAL) {
      pool = [...pool, ...shuffle(allWords)]
    }
    pool = pool.slice(0, GOAL)

    const allMeanings = allWords.map(w => w.meaning)
    const capturedEntries = await db.captured_words.toArray()
    const capturedNums = new Set(capturedEntries.map(c => c.leapNumber))
    const questions = pool.map(word => {
      const wrongs = shuffle(allMeanings.filter(m => m !== word.meaning)).slice(0, 3)
      const correctIdx = Math.floor(Math.random() * 4)
      const choices = [...wrongs]
      choices.splice(correctIdx, 0, word.meaning)
      return { word, choices, correctIdx, isCaptured: capturedNums.has(word.leapNumber) }
    })

    setSelectedParts(parts)
    setWords(questions)
    startTimeRef.current = Date.now()
    setPhase('playing')
  }

  async function handleClear(lastWords, lastTimings) {
    const ms = startTimeRef.current ? Date.now() - startTimeRef.current : null
    setElapsed(ms)
    setClearWords(lastWords ?? [])
    setClearTimings(lastTimings ?? [])

    // ポイント計算: 捕獲済み単語=2pt, 通常=1pt, αクリアボーナス=+15pt
    const capturedEntries = await db.captured_words.toArray()
    const capturedNums = new Set(capturedEntries.map(c => c.leapNumber))
    let pts = 0
    let cCount = 0
    for (const q of words) {
      if (capturedNums.has(q.word.leapNumber)) {
        pts += 2
        cCount++
      } else {
        pts += 1
      }
    }
    if (includeAlpha) pts += 15

    setCapturedWordCount(cCount)
    setNormalWordCount(words.length - cCount)
    setEarnedPoints(pts)
    await recordChallengeClear(pts)
    await db.challengeHistory.add({
      date: new Date(),
      parts: selectedParts,
      result: GOAL,
      cleared: true,
    })
    setAlreadyDone(true)
    setPhase('clear')
  }

  // 時間切れ・正直終了の共通ポイント計算（words[0..streak-1] が正解済み）
  async function calcAndSaveTimeoutPoints(streak) {
    const answeredQuestions = words.slice(0, streak)
    let pts = 0, cCount = 0
    for (const q of answeredQuestions) {
      if (q.isCaptured) { pts += 2; cCount++ } else { pts += 1 }
    }
    if (pts > 0) await addPoints(pts)
    setTimeoutEarnedPoints(pts)
    setTimeoutCapturedCount(cCount)
  }

  // 時間切れ終了
  async function handleTimeout(word, streak) {
    await calcAndSaveTimeoutPoints(streak)
    await db.challengeHistory.add({
      date: new Date(),
      parts: selectedParts,
      result: streak,
      cleared: false,
    })
    const studyResult = await recordStudy()
    if (studyResult.streakUpdated) setStreakToast(studyResult.currentStreak)
    setTimeoutWord(word)
    setTimeoutStreak(streak)
    setTimeoutReason('timeout')
    setPhase('timeout')
  }

  // 正直終了（CMブレイク3択から）
  async function handleHonestEnd(word, streak) {
    await calcAndSaveTimeoutPoints(streak)
    await db.challengeHistory.add({
      date: new Date(),
      parts: selectedParts,
      result: streak,
      cleared: false,
    })
    const studyResult = await recordStudy()
    if (studyResult.streakUpdated) setStreakToast(studyResult.currentStreak)
    setTimeoutWord(word)
    setTimeoutStreak(streak)
    setTimeoutReason('honest')
    setPhase('timeout')
  }

  if (phase === 'select') {
    return <DailyStartScreen onStart={handleStart} timerSecs={timerSecs} alreadyDone={alreadyDone} alphaCount={alphaCount} />
  }
  if (phase === 'playing') {
    return (
      <Quiz
        words={words}
        timerSecs={timerSecs}
        onClear={handleClear}
        onTimeout={handleTimeout}
        onHonestEnd={handleHonestEnd}
      />
    )
  }
  if (phase === 'timeout') {
    if (showTimeoutDetail && timeoutWord) {
      return (
        <WordDetailScreen
          word={timeoutWord}
          onBack={() => setShowTimeoutDetail(false)}
        />
      )
    }
    return (
      <TimeoutScreen
        word={timeoutWord}
        streak={timeoutStreak}
        reason={timeoutReason}
        earnedPoints={timeoutEarnedPoints}
        capturedCount={timeoutCapturedCount}
        onRetry={() => setPhase('select')}
        onHome={() => navigate('/')}
        onWordDetail={() => setShowTimeoutDetail(true)}
      />
    )
  }
  if (phase === 'clear') {
    return (
      <ClearScreen
        parts={selectedParts}
        elapsed={elapsed}
        earnedPoints={earnedPoints}
        capturedCount={capturedWordCount}
        normalCount={normalWordCount}
        includeAlpha={includeAlpha}
        cmWords={clearWords}
        cmTimings={clearTimings}
        onRetry={() => setPhase('select')}
        onHome={() => navigate('/')}
      />
    )
  }
  if (streakToast !== null) {
    return <StreakToast streak={streakToast} onDone={() => setStreakToast(null)} />
  }
}
