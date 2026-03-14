import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { useUserStats } from '../hooks/useUserStats'
import { findRoots } from '../utils/findRoots'

const PARTS = ['Part1', 'Part2', 'Part3', 'Part4', 'α']
const GOAL = 30
const DEFAULT_TIMER_SECS = 7
const CM_DURATION = 3500 // ms per word in CM break

// ---- ヘルパー関数 ----
function getTimerSecs() {
  const stored = localStorage.getItem('challengeTimerSecs')
  const parsed = parseInt(stored, 10)
  return (!isNaN(parsed) && parsed >= 3 && parsed <= 15) ? parsed : DEFAULT_TIMER_SECS
}

function getLastParts() {
  try {
    const stored = localStorage.getItem('challengeLastParts')
    if (!stored) return ['Part1']
    const parts = JSON.parse(stored)
    if (Array.isArray(parts) && parts.length > 0 && parts.every(p => PARTS.includes(p))) {
      return parts
    }
  } catch { /* ignore */ }
  return ['Part1']
}

function saveLastParts(parts) {
  try {
    localStorage.setItem('challengeLastParts', JSON.stringify(parts))
  } catch { /* ignore */ }
}

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return min > 0 ? `${min}分${sec}秒` : `${sec}秒`
}

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

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
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
    <div className="w-full max-w-sm mt-3">
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

// ---- パート選択画面 ----
function PartSelect({ onStart, timerSecs }) {
  const [selected, setSelected] = useState(getLastParts)
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

  const totalWords = PARTS
    .filter(p => selected.includes(p))
    .reduce((s, p) => s + (wordCounts[p] ?? 0), 0)

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">📖 30問チャレンジ</h1>
      <p className="text-slate-400 mb-2">出題するパートを選んでください</p>
      <p className="text-slate-500 text-sm mb-8">⏱ 1問 {timerSecs} 秒・時間切れで終了</p>

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
          ? '⚠️ 単語データがありません。設定からインポートしてください。'
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

// ---- CMブレイク ----
// props:
//   words       - 直前10問の単語配列
//   timings     - [{word, timeRemaining}] 各問のわかる押下時の残り秒数
//   blockNumber - 1(10問後) or 2(20問後)
//   timerSecs   - タイマー設定値（参考用）
//   onContinue  - 次のブロックへ進む
//   onHonestEnd - 正直終了(word) を渡す
function CMBreak({ words, timings, blockNumber, onContinue, onHonestEnd }) {
  // phase: 'intro' → 'slideshow' → 'choice'
  const [phase, setPhase] = useState('intro')
  const [introOpacity, setIntroOpacity] = useState(1)
  const [idx, setIdx] = useState(0)
  const [familyData, setFamilyData] = useState(null)
  const [familyWords, setFamilyWords] = useState([])  // 同語族の単語リスト
  const [allRoots, setAllRoots] = useState([])
  const [rootsHint, setRootsHint] = useState([])

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

  // ---- スライドショー: 語族取得 + 語源マッチング + 同語族単語取得 ----
  useEffect(() => {
    if (phase !== 'slideshow') return
    setFamilyData(null)
    setFamilyWords([])
    setRootsHint([])
    if (word?.familyId) {
      db.wordFamilies.get(word.familyId)
        .then(fam => { if (fam) setFamilyData(fam) })
        .catch(() => {})
      // 同語族の単語を取得（自分以外・最大8件）
      db.words.where('familyId').equals(word.familyId).toArray()
        .then(ws => setFamilyWords(ws.filter(w => w.id !== word.id).slice(0, 8)))
        .catch(() => {})
    }
    if (allRoots.length > 0) {
      setRootsHint(findRoots(word.word, allRoots))
    }
  }, [idx, phase, allRoots]) // eslint-disable-line

  // ---- スライドショー: 単語表示時に自動読み上げ（自動進行なし） ----
  useEffect(() => {
    if (phase !== 'slideshow') return
    speak(word.word, 'en-US', 0.85)
    return () => {
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    }
  }, [idx, phase]) // eslint-disable-line

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

        <div className="w-full max-w-sm flex flex-col gap-4">
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
            ▶️ {nextQuestionNum}問目に進む
          </button>

          {/* 正直終了 */}
          <button
            onClick={() => onHonestEnd(suspiciousWord)}
            className="w-full py-4 px-5 text-base font-bold bg-slate-800 hover:bg-red-900/40 border border-slate-700 hover:border-red-700/60 rounded-xl transition-colors text-left text-slate-400 hover:text-slate-200"
          >
            🙏 やっぱり間違ってたので正直に終了
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

  // ---- スライドショー画面 ----
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col px-5 py-6 select-none overflow-y-auto">
      <style>{CM_STYLE}</style>

      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">📺 CM Break</p>
        <p className="text-slate-600 text-xs tabular-nums">{idx + 1} / {words.length}</p>
      </div>

      {/* 単語情報 */}
      <div className="text-center mb-5">
        <p className="text-slate-500 text-base font-bold mb-2">
          No.{word.leapNumber} &nbsp;<span className="text-slate-600">{word.leapPart}</span>
        </p>
        <p className="text-6xl font-black mb-4 leading-tight tracking-tight">
          {word.word}
        </p>
        <p className="text-2xl text-slate-200 font-medium mb-1">{word.meaning}</p>
        {word.partOfSpeech && (
          <p className="text-slate-600 text-sm">{word.partOfSpeech}</p>
        )}
      </div>

      {/* 語源ヒント */}
      {rootsHint.length > 0 && (
        <div className="px-4 py-3 bg-purple-900/30 border border-purple-800/50 rounded-xl text-purple-300 text-sm mb-3 w-full text-center">
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

      {/* 語族ヒント + 同語族の単語 */}
      {familyData && (
        <div className="px-4 py-3 bg-blue-900/30 border border-blue-800/50 rounded-xl text-blue-300 text-sm mb-3 w-full">
          <p className="text-center mb-2">
            🧬 語族: <span className="font-bold">[{familyData.root}]</span>
            {familyData.rootMeaning && <span className="text-blue-400"> — {familyData.rootMeaning}</span>}
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

      {/* ボタン群 */}
      <div className="mt-auto pt-5 flex flex-col gap-3">
        {/* もう一度発音 */}
        <button
          onClick={() => speak(word.word, 'en-US', 0.75)}
          className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 text-sm font-bold transition-colors active:scale-95"
        >
          🔊 もう一度発音
        </button>

        {/* 次の単語へ */}
        <button
          onClick={handleAdvance}
          className="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-xl text-white text-base font-bold transition-colors active:scale-95"
        >
          次の単語へ →
        </button>

        {/* スキップ（終了メニューへ） */}
        <button
          onClick={() => {
            try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
            setPhase('choice')
          }}
          className="w-full py-3 bg-transparent border border-slate-800 rounded-xl text-slate-600 hover:text-slate-400 hover:border-slate-600 text-sm transition-colors"
        >
          スキップして終了メニューへ
        </button>
      </div>
    </div>
  )
}

// ---- 出題画面 ----
function Quiz({ words, timerSecs, onClear, onTimeout, onHonestEnd }) {
  const [current, setCurrent] = useState(0)
  const [streak, setStreak] = useState(0)
  const [flipping, setFlipping] = useState(false)
  const [timeLeft, setTimeLeft] = useState(timerSecs)
  // CMブレイク用: null or {words, timings, blockNumber}
  const [cmData, setCMData] = useState(null)
  const navigate = useNavigate()

  const doneRef = useRef(false)
  // 今のブロックで各問のわかる押下時の残り秒数を記録
  const blockTimingsRef = useRef([])

  const word = words[current]

  const counterColor =
    streak >= 28 ? 'text-red-400' :
    streak >= 20 ? 'text-amber-400' :
    'text-blue-400'

  const urgentTimer = timeLeft <= 3

  // タイマー（CMブレイク中は停止）
  useEffect(() => {
    if (cmData) return

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
  }, [current, cmData]) // eslint-disable-line

  async function handleTimeoutInternal() {
    const existing = await db.cards.where('wordId').equals(word.id).first()
    if (existing) {
      await db.cards.update(existing.id, {
        incorrectCount: (existing.incorrectCount ?? 0) + 1,
        lastReviewed: new Date(),
      })
    } else {
      await db.cards.add({
        wordId: word.id,
        lastReviewed: new Date(),
        correctCount: 0,
        incorrectCount: 1,
      })
    }
    onTimeout(word, streak)
  }

  async function handleKnow() {
    if (doneRef.current) return
    doneRef.current = true

    // わかるを押した瞬間の残り秒数を記録（一番遅かった単語の特定に使用）
    const capturedTimeLeft = timeLeft

    const existing = await db.cards.where('wordId').equals(word.id).first()
    if (existing) {
      await db.cards.update(existing.id, {
        correctCount: (existing.correctCount ?? 0) + 1,
        lastReviewed: new Date(),
      })
    } else {
      await db.cards.add({
        wordId: word.id,
        lastReviewed: new Date(),
        correctCount: 1,
        incorrectCount: 0,
      })
    }

    const next = streak + 1

    // タイミングを記録
    blockTimingsRef.current.push({ word: words[current], timeRemaining: capturedTimeLeft })

    if (next >= GOAL) {
      onClear()
      return
    }

    setFlipping(true)
    setTimeout(() => {
      setStreak(next)
      setCurrent(prev => (prev + 1) % words.length)
      setFlipping(false)

      // 10問目・20問目でCMブレイク突入
      if (next === 10 || next === 20) {
        const lastTen = words.slice(next - 10, next)
        const timings = [...blockTimingsRef.current]
        blockTimingsRef.current = [] // 次のブロック用にリセット
        setCMData({ words: lastTen, timings, blockNumber: next / 10 })
      }
    }, 180)
  }

  // CMブレイク中の表示
  if (cmData) {
    return (
      <CMBreak
        words={cmData.words}
        timings={cmData.timings}
        blockNumber={cmData.blockNumber}
        timerSecs={timerSecs}
        onContinue={() => setCMData(null)}
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
      <div className="w-full max-w-sm h-2 bg-slate-700 rounded-full mb-4 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            streak >= 28 ? 'bg-red-500' : streak >= 20 ? 'bg-amber-500' : 'bg-blue-500'
          }`}
          style={{ width: `${(streak / GOAL) * 100}%` }}
        />
      </div>

      {/* タイマー */}
      <div className="w-full max-w-sm mb-5">
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
      <div className={`w-full max-w-sm bg-slate-800 rounded-3xl p-8 mb-3 text-center transition-opacity duration-150 ${
        flipping ? 'opacity-0' : 'opacity-100'
      }`}>
        <div className="text-slate-500 text-sm mb-2">
          No. {word.leapNumber} ({word.leapPart})
        </div>
        <div className="text-5xl font-black tracking-tight mb-3">{word.word}</div>
        <div className="text-slate-500 text-sm">{word.partOfSpeech}</div>
      </div>

      {/* 語族セクション */}
      <div className={`w-full flex justify-center transition-opacity duration-150 ${
        flipping ? 'opacity-0' : 'opacity-100'
      }`}>
        <WordFamilySection word={word} />
      </div>

      {/* わかるボタン */}
      <div className="w-full max-w-sm mt-5">
        <button
          onClick={handleKnow}
          className="w-full py-6 text-2xl font-bold bg-blue-600 hover:bg-blue-500 rounded-2xl transition-colors active:scale-95"
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

// ---- 終了画面（時間切れ・正直終了 共通） ----
// reason: 'timeout' | 'honest'
function TimeoutScreen({ word, streak, reason, onRetry, onHome }) {
  const isHonest = reason === 'honest'

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center px-4 text-center">
      <div className="text-5xl mb-4">{isHonest ? '🙏' : '⏰'}</div>
      <p className="text-slate-400 text-xl font-bold mb-1">{word.leapPart} &nbsp;No.{word.leapNumber}</p>
      <p className="text-6xl font-black mb-6">{word.word}</p>
      <p className="text-slate-600 text-sm mb-8">
        {isHonest
          ? `ブロック正解 ${streak} 問で終了`
          : `連続正解 ${streak} 問でストップ`}
      </p>

      <div className="w-full max-w-sm bg-amber-900/30 border border-amber-700 rounded-2xl px-6 py-5 mb-8">
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

      <div className="w-full max-w-sm flex flex-col gap-4">
        <button
          onClick={onRetry}
          className="w-full py-5 text-xl font-bold bg-blue-600 hover:bg-blue-500 rounded-2xl transition-colors"
        >
          もう一度チャレンジ
        </button>
        <button
          onClick={onHome}
          className="w-full py-5 text-xl font-bold bg-slate-700 hover:bg-slate-600 rounded-2xl transition-colors"
        >
          中断してホームへ
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

// ---- クリア画面（派手演出） ----
function ClearScreen({ parts, elapsed, onRetry, onHome }) {
  const [showButtons, setShowButtons] = useState(false)

  useEffect(() => {
    speak('Congratulations! Perfect score!', 'en-US', 0.9)
    const t = setTimeout(() => setShowButtons(true), 3000)
    return () => {
      clearTimeout(t)
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    }
  }, [])

  const now = new Date()
  const dateStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ` +
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center px-4 text-center overflow-hidden">
      <style>{CLEAR_STYLE}</style>
      <HeavyConfetti />
      <StarBurst />

      <div className="relative z-10 flex flex-col items-center">
        <div
          style={{
            animationName: 'bounce-in',
            animationDuration: '0.8s',
            animationFillMode: 'both',
          }}
        >
          <span className="text-9xl select-none">🏆</span>
        </div>

        <h1
          className="text-5xl font-black mt-4 mb-3"
          style={{
            animationName: 'bounce-in, glow-text',
            animationDuration: '0.8s, 2.5s',
            animationDelay: '0.15s, 1s',
            animationFillMode: 'both, none',
            animationIterationCount: '1, infinite',
            color: '#fbbf24',
          }}
        >
          🎉 30問クリア！！！
        </h1>

        <p className="text-slate-300 text-lg mb-1">+10ポイント獲得 🎊</p>
        <p className="text-slate-400 text-sm mb-1">{parts.join(' + ')}</p>

        {elapsed != null && (
          <p className="text-slate-400 text-sm mb-1">
            ⏱ クリアタイム：
            <span className="font-bold text-blue-300">{formatElapsed(elapsed)}</span>
          </p>
        )}

        <p className="text-slate-600 text-xs mb-10">{dateStr}</p>

        {showButtons ? (
          <div
            className="flex flex-col gap-4 w-full max-w-xs"
            style={{
              animationName: 'fade-in-up',
              animationDuration: '0.5s',
              animationFillMode: 'both',
            }}
          >
            <button
              onClick={onRetry}
              className="w-full py-5 text-xl font-bold bg-blue-600 hover:bg-blue-500 rounded-2xl transition-colors"
            >
              もう一度チャレンジ
            </button>
            <button
              onClick={onHome}
              className="w-full py-5 text-xl font-bold bg-slate-700 hover:bg-slate-600 rounded-2xl transition-colors"
            >
              ホームへ
            </button>
          </div>
        ) : (
          <div className="h-28 flex items-center">
            <p className="text-slate-600 text-sm animate-pulse">もう少しお待ちください…</p>
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
  const [timeoutWord, setTimeoutWord] = useState(null)
  const [timeoutStreak, setTimeoutStreak] = useState(0)
  const [timeoutReason, setTimeoutReason] = useState('timeout') // 'timeout' | 'honest'
  const [elapsed, setElapsed] = useState(null)
  const [timerSecs] = useState(getTimerSecs)
  const startTimeRef = useRef(null)
  const { recordChallengeClear } = useUserStats()
  const navigate = useNavigate()

  async function handleStart(parts) {
    saveLastParts(parts)

    const allWords = await db.words
      .where('leapPart')
      .anyOf(parts)
      .toArray()

    if (allWords.length === 0) return

    const shuffled = shuffle(allWords)
    let pool = shuffled
    while (pool.length < GOAL) {
      pool = [...pool, ...shuffle(allWords)]
    }

    setSelectedParts(parts)
    setWords(pool)
    startTimeRef.current = Date.now()
    setPhase('playing')
  }

  async function handleClear() {
    const ms = startTimeRef.current ? Date.now() - startTimeRef.current : null
    setElapsed(ms)
    await recordChallengeClear()
    await db.challengeHistory.add({
      date: new Date(),
      parts: selectedParts,
      result: GOAL,
      cleared: true,
    })
    setPhase('clear')
  }

  // 時間切れ終了
  async function handleTimeout(word, streak) {
    await db.challengeHistory.add({
      date: new Date(),
      parts: selectedParts,
      result: streak,
      cleared: false,
    })
    setTimeoutWord(word)
    setTimeoutStreak(streak)
    setTimeoutReason('timeout')
    setPhase('timeout')
  }

  // 正直終了（CMブレイク3択から）
  async function handleHonestEnd(word, streak) {
    await db.challengeHistory.add({
      date: new Date(),
      parts: selectedParts,
      result: streak,
      cleared: false,
    })
    setTimeoutWord(word)
    setTimeoutStreak(streak)
    setTimeoutReason('honest')
    setPhase('timeout')
  }

  if (phase === 'select') {
    return <PartSelect onStart={handleStart} timerSecs={timerSecs} />
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
    return (
      <TimeoutScreen
        word={timeoutWord}
        streak={timeoutStreak}
        reason={timeoutReason}
        onRetry={() => setPhase('select')}
        onHome={() => navigate('/')}
      />
    )
  }
  if (phase === 'clear') {
    return (
      <ClearScreen
        parts={selectedParts}
        elapsed={elapsed}
        onRetry={() => setPhase('select')}
        onHome={() => navigate('/')}
      />
    )
  }
}
