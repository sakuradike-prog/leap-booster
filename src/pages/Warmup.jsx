import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { useUserStats } from '../hooks/useUserStats'
import { speak, cancelSpeech } from '../utils/speech'

const WARMUP_COUNT = 5
const STEP_DURATIONS = [3, 3, 5] // ステップ1・2・3の秒数

// ---- 単語の取得 ----
async function fetchRandomWords(count) {
  const all = await db.words.toArray()
  if (all.length === 0) return []
  return [...all].sort(() => Math.random() - 0.5).slice(0, count)
}

async function fetchWeakWords(count) {
  const cards = await db.cards.orderBy('incorrectCount').reverse().limit(count * 2).toArray()
  if (cards.length === 0) return fetchRandomWords(count)
  const ids = cards.map(c => c.wordId)
  const words = await db.words.where('id').anyOf(ids).toArray()
  return words.slice(0, count)
}

async function getSentenceForWord(word) {
  const rows = await db.warmupSentences.where('wordId').equals(word.id).toArray()
  if (rows.length > 0) {
    const pick = rows[Math.floor(Math.random() * rows.length)]
    return { sentence: pick.sentence, translation: pick.translation }
  }
  if (word.example) return { sentence: word.example, translation: '' }
  return null
}

// ---- 単語選択画面 ----
function SelectScreen({ onStart }) {
  const [mode, setMode] = useState('random')
  const [allWords, setAllWords] = useState([])
  const [picked, setPicked] = useState([])
  const [search, setSearch] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const navigate = useNavigate()

  useEffect(() => { db.words.count().then(setWordCount) }, [])
  useEffect(() => {
    if (mode === 'pick') db.words.orderBy('leapNumber').toArray().then(setAllWords)
  }, [mode])

  const filtered = allWords.filter(w =>
    w.word.toLowerCase().includes(search.toLowerCase()) || w.meaning.includes(search)
  )

  function togglePick(word) {
    setPicked(prev =>
      prev.find(w => w.id === word.id)
        ? prev.filter(w => w.id !== word.id)
        : prev.length < WARMUP_COUNT ? [...prev, word] : prev
    )
  }

  async function handleStart() {
    let words = []
    if (mode === 'random') words = await fetchRandomWords(WARMUP_COUNT)
    else if (mode === 'weak') words = await fetchWeakWords(WARMUP_COUNT)
    else words = picked
    if (words.length === 0) return
    const items = await Promise.all(
      words.map(async w => ({ word: w, sent: await getSentenceForWord(w) }))
    )
    onStart(items)
  }

  const canStart = wordCount > 0 && (mode !== 'pick' || picked.length > 0)

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col px-4 py-8">
      <div className="max-w-sm mx-auto w-full">
        <div className="flex items-center mb-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white mr-4">← 戻る</button>
          <h1 className="text-2xl font-bold">⚡ 瞬間英作文</h1>
        </div>

        {wordCount === 0 && (
          <div className="mb-6 p-4 bg-amber-900/30 border border-amber-700 rounded-xl text-amber-300 text-sm">
            ⚠️ 単語データがありません。設定からCSVをインポートしてください。
          </div>
        )}

        <div className="flex flex-col gap-3 mb-8">
          {[
            { id: 'random', icon: '🎲', label: 'ランダム',   sub: `全単語からランダムに${WARMUP_COUNT}問` },
            { id: 'weak',   icon: '💪', label: '苦手な単語', sub: '不正解が多い単語を優先' },
            { id: 'pick',   icon: '🔍', label: '単語を選ぶ', sub: `${WARMUP_COUNT}語まで手動選択` },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setMode(opt.id)}
              className={`flex items-center gap-4 w-full py-4 px-5 rounded-xl border-2 transition-all text-left ${
                mode === opt.id
                  ? 'bg-amber-600 border-amber-400'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <span className="text-2xl">{opt.icon}</span>
              <span>
                <div className="font-bold">{opt.label}</div>
                <div className="text-sm opacity-70">{opt.sub}</div>
              </span>
            </button>
          ))}
        </div>

        {mode === 'pick' && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-400 text-sm">選択中: {picked.length} / {WARMUP_COUNT}</span>
              {picked.length > 0 && (
                <button onClick={() => setPicked([])} className="text-xs text-slate-500 hover:text-slate-300">クリア</button>
              )}
            </div>
            <input
              type="text"
              placeholder="単語・意味で検索"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 mb-3 focus:outline-none focus:border-amber-500"
            />
            <div className="max-h-64 overflow-y-auto flex flex-col gap-2 pr-1">
              {filtered.slice(0, 100).map(w => {
                const sel = !!picked.find(p => p.id === w.id)
                return (
                  <button
                    key={w.id}
                    onClick={() => togglePick(w)}
                    className={`flex justify-between items-center w-full px-4 py-3 rounded-xl text-left transition-colors ${
                      sel ? 'bg-amber-600 text-white'
                        : picked.length >= WARMUP_COUNT ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <span className="font-bold">{w.word}</span>
                    <span className="text-sm opacity-70 ml-2 truncate">{w.meaning}</span>
                  </button>
                )
              })}
              {filtered.length === 0 && <p className="text-slate-500 text-sm text-center py-4">見つかりませんでした</p>}
            </div>
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={!canStart}
          className="w-full py-5 text-xl font-bold bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-2xl transition-colors"
        >
          スタート
        </button>
      </div>
    </div>
  )
}

// ---- タイマーバー ----
function TimerBar({ duration }) {
  return (
    <div className="absolute bottom-12 left-6 right-6 h-1 bg-slate-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-amber-500 rounded-full"
        style={{ animation: `timerShrink ${duration}s linear forwards` }}
      />
      <style>{`@keyframes timerShrink { from{width:100%} to{width:0%} }`}</style>
    </div>
  )
}

// ---- ウォームアップ画面 ----
function WarmupScreen({ items, onComplete }) {
  const [index, setIndex] = useState(0)
  const [step, setStep]   = useState(0)
  const [visible, setVisible] = useState(true)
  const timerRef = useRef(null)

  const total = items.length
  const item  = items[index]

  const advance = useCallback(() => {
    clearTimeout(timerRef.current)
    if (step < 2) {
      setStep(s => s + 1)
    } else {
      cancelSpeech()
      if (index + 1 >= total) { onComplete(); return }
      setVisible(false)
      setTimeout(() => { setIndex(i => i + 1); setStep(0); setVisible(true) }, 200)
    }
  }, [step, index, total, onComplete])

  // タイマー
  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(advance, STEP_DURATIONS[step] * 1000)
    return () => clearTimeout(timerRef.current)
  }, [step, index, advance])

  // 音声読み上げ（ステップ2）
  useEffect(() => {
    if (step === 2 && item.sent?.sentence) speak(item.sent.sentence)
    return () => { if (step === 2) cancelSpeech() }
  }, [step, index])

  return (
    <div
      className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6 cursor-pointer select-none relative"
      onClick={advance}
    >
      {/* 進捗 */}
      <div className="absolute top-6 right-6 text-slate-500 text-lg font-bold tabular-nums">
        {index + 1} / {total}
      </div>
      {/* ステップドット */}
      <div className="absolute top-6 left-6 flex gap-2">
        {[0,1,2].map(s => (
          <div key={s} className={`w-2.5 h-2.5 rounded-full transition-colors ${s <= step ? 'bg-amber-400' : 'bg-slate-700'}`} />
        ))}
      </div>

      {/* コンテンツ */}
      <div className={`text-center transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="text-6xl font-black tracking-tight mb-2">{item.word.word}</div>
        <div className="text-slate-500 text-lg mb-8">{item.word.partOfSpeech}</div>

        {step >= 1 && (
          <div className="text-3xl text-amber-400 font-bold mb-8">{item.word.meaning}</div>
        )}

        {step === 2 && item.sent && (
          <div className="max-w-md">
            <div className="text-2xl text-slate-200 leading-relaxed mb-3">
              🔊 {item.sent.sentence}
            </div>
            {item.sent.translation && (
              <div className="text-slate-500 text-lg">{item.sent.translation}</div>
            )}
          </div>
        )}
        {step === 2 && !item.sent && (
          <div className="text-slate-600 text-lg">（例文なし）</div>
        )}
      </div>

      <TimerBar key={`${index}-${step}`} duration={STEP_DURATIONS[step]} />
      <p className="absolute bottom-5 text-slate-700 text-sm">タップで次へ</p>
    </div>
  )
}

// ---- 完了画面 ----
function CompleteScreen({ onRetry, onHome }) {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center px-4 text-center">
      <div className="text-7xl mb-4">⚡</div>
      <h1 className="text-3xl font-black text-amber-400 mb-2">ウォームアップ完了！</h1>
      <p className="text-slate-400 mb-1">+3ポイント獲得</p>
      <p className="text-slate-600 text-sm mb-10">今日も頑張りました</p>
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button onClick={onRetry} className="w-full py-5 text-xl font-bold bg-amber-600 hover:bg-amber-500 rounded-2xl transition-colors">
          もう一度
        </button>
        <button onClick={onHome} className="w-full py-5 text-xl font-bold bg-slate-700 hover:bg-slate-600 rounded-2xl transition-colors">
          ホームへ
        </button>
      </div>
    </div>
  )
}

// ---- メイン ----
export default function Warmup() {
  const [phase, setPhase] = useState('select')
  const [items, setItems] = useState([])
  const navigate = useNavigate()
  const { recordStudy } = useUserStats()

  async function addWarmupPoints() {
    const s = await db.userStats.get(1)
    if (s) await db.userStats.update(1, { totalPoints: (s.totalPoints ?? 0) + 3 })
  }

  async function handleComplete() {
    await recordStudy()
    await addWarmupPoints()
    await Promise.all(
      items.map(({ word }) => db.warmupHistory.add({ date: new Date(), wordId: word.id, completed: true }))
    )
    setPhase('complete')
  }

  if (phase === 'select')   return <SelectScreen onStart={items => { setItems(items); setPhase('playing') }} />
  if (phase === 'playing')  return <WarmupScreen items={items} onComplete={handleComplete} />
  if (phase === 'complete') return <CompleteScreen onRetry={() => setPhase('select')} onHome={() => navigate('/')} />
}
