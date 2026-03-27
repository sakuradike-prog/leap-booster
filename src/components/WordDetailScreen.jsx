import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { findRoots } from '../utils/findRoots'
import { speak } from '../utils/speak'
import { syncCheckedWord, deleteCheckedWord } from '../utils/supabaseSync'
import { supabase } from '../lib/supabase'
import WordCard from './WordCard'
import NumberQuizScreen from './NumberQuizScreen'

/**
 * WordDetailScreen - 単語解説画面（全画面共通）
 *
 * Props:
 *   word          - db.words のレコード（sessionWords未使用時の単一単語）
 *   onBack        - 戻るボタンのコールバック
 *   sessionWords  - セッション中の単語配列（前後ナビゲーション用、省略可）
 *   initialIndex  - sessionWords の初期インデックス（デフォルト 0）
 */
export default function WordDetailScreen({ word, onBack, sessionWords = null, initialIndex = 0, backLabel = '← 戻る', backAsLink = false }) {
  const navigate = useNavigate()

  // セッションナビゲーション（前の単語・次の単語）
  const [sessionIdx, setSessionIdx] = useState(initialIndex)
  const baseWord = sessionWords ? sessionWords[sessionIdx] : word

  // 内部ナビゲーションスタック（語源タップで別単語へ遷移）
  const [wordStack, setWordStack] = useState([baseWord])
  const currentWord = wordStack[wordStack.length - 1]
  const isAtBase = wordStack.length === 1

  const [allRoots, setAllRoots] = useState([])
  const [rootsHint, setRootsHint] = useState([])
  const [familyData, setFamilyData] = useState(null)
  const [familyWords, setFamilyWords] = useState([])
  const [capturedEntry, setCapturedEntry] = useState(null)
  const [isChecked, setIsChecked] = useState(false)

  // 例文
  const [examples, setExamples] = useState([])
  const [showExamples, setShowExamples] = useState(false)
  const examplesRef = useRef(null)

  // 語源タップパネル
  const [selectedRoot, setSelectedRoot] = useState(null)
  const [rootWords, setRootWords] = useState([])
  const [rootWordsLoading, setRootWordsLoading] = useState(false)

  // No.クイズ画面
  const [showNumberQuiz, setShowNumberQuiz] = useState(false)

  // セッションインデックスが変わったらwordStackをリセット
  useEffect(() => {
    const newBase = sessionWords ? sessionWords[sessionIdx] : word
    setWordStack([newBase])
    setSelectedRoot(null)
    setRootWords([])
  }, [sessionIdx]) // eslint-disable-line

  // 外側の word prop が変わったらスタックをリセット（sessionWords未使用時）
  useEffect(() => {
    if (!sessionWords) {
      setWordStack([word])
      setSelectedRoot(null)
      setRootWords([])
    }
  }, [word?.id]) // eslint-disable-line

  useEffect(() => {
    db.roots.toArray().then(r => setAllRoots(r)).catch(() => {})
  }, [])

  useEffect(() => {
    if (allRoots.length > 0 && currentWord?.word) {
      setRootsHint(findRoots(currentWord.word, allRoots))
      setSelectedRoot(null)
      setRootWords([])
    }
  }, [allRoots, currentWord?.word])

  useEffect(() => {
    setFamilyData(null)
    setFamilyWords([])
    if (!currentWord?.familyId) return
    db.wordFamilies.get(currentWord.familyId)
      .then(fam => { if (fam) setFamilyData(fam) })
      .catch(() => {})
    db.words.where('familyId').equals(currentWord.familyId).toArray()
      .then(ws => {
        const seen = new Set()
        const unique = ws.filter(w => {
          if (w.id === currentWord.id) return false
          if (seen.has(w.word)) return false
          seen.add(w.word)
          return true
        })
        setFamilyWords(unique.slice(0, 8))
      })
      .catch(() => {})
  }, [currentWord?.id, currentWord?.familyId])

  useEffect(() => {
    if (currentWord?.word) speak(currentWord.word, 'en-US', 0.85)
  }, [currentWord?.word])

  // 捕獲済みチェック
  useEffect(() => {
    setCapturedEntry(null)
    if (!currentWord?.leapNumber) return
    db.captured_words.where('leapNumber').equals(currentWord.leapNumber).first()
      .then(c => setCapturedEntry(c ?? null))
      .catch(() => {})
  }, [currentWord?.leapNumber])

  // チェック状態をIndexedDBからロード
  useEffect(() => {
    setIsChecked(false)
    if (!currentWord?.leapNumber) return
    db.checked_words.where('leapNumber').equals(currentWord.leapNumber).first()
      .then(c => setIsChecked(!!c))
      .catch(() => {})
  }, [currentWord?.leapNumber])

  async function handleToggleCheck() {
    if (!currentWord?.leapNumber) return
    const newState = !isChecked
    setIsChecked(newState)
    if (newState) {
      await db.checked_words.add({
        leapNumber: currentWord.leapNumber,
        word: currentWord.word ?? '',
        checkedAt: new Date(),
      }).catch(() => {})
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.id) syncCheckedWord(session.user.id, currentWord.leapNumber, currentWord.word)
      })
    } else {
      const existing = await db.checked_words.where('leapNumber').equals(currentWord.leapNumber).first().catch(() => null)
      if (existing) await db.checked_words.delete(existing.id).catch(() => {})
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.id) deleteCheckedWord(session.user.id, currentWord.leapNumber)
      })
    }
    // 親コンポーネントのバッジ表示を即時更新するためのイベント
    window.dispatchEvent(new CustomEvent('vocaleap:checked'))
  }

  useEffect(() => {
    setExamples([])
    setShowExamples(false)
    if (!currentWord?.word) return
    db.warmupSentences.where('word').equals(currentWord.word).toArray()
      .then(rows => setExamples(rows))
      .catch(() => {})
  }, [currentWord?.word])

  function handleMeaningClick() {
    if (examples.length === 0) return
    setShowExamples(v => {
      if (!v) setTimeout(() => examplesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
      return !v
    })
  }

  async function handleRootTap(rootEntry) {
    if (selectedRoot?.root === rootEntry.root) {
      setSelectedRoot(null)
      setRootWords([])
      return
    }
    setSelectedRoot(rootEntry)
    setRootWords([])
    setRootWordsLoading(true)
    try {
      const allWords = await db.words.toArray()
      const matched = allWords.filter(w =>
        w.id !== currentWord.id &&
        findRoots(w.word, allRoots).some(r => r.root === rootEntry.root)
      )
      matched.sort((a, b) => {
        if (a.leapPart < b.leapPart) return -1
        if (a.leapPart > b.leapPart) return 1
        return (a.leapNumber || 0) - (b.leapNumber || 0)
      })
      setRootWords(matched.slice(0, 20))
    } finally {
      setRootWordsLoading(false)
    }
  }

  function handleWordSelect(w) {
    setSelectedRoot(null)
    setRootWords([])
    setWordStack(prev => [...prev, w])
  }

  function handleBack() {
    if (selectedRoot) {
      setSelectedRoot(null)
      setRootWords([])
      return
    }
    if (wordStack.length > 1) {
      setWordStack(prev => prev.slice(0, -1))
    } else {
      onBack()
    }
  }

  if (!currentWord) return null

  if (showNumberQuiz) {
    return (
      <NumberQuizScreen
        startWord={currentWord}
        onBack={() => setShowNumberQuiz(false)}
      />
    )
  }

  const canPrev = sessionWords && sessionIdx > 0 && isAtBase && !selectedRoot
  const canNext = sessionWords && sessionIdx < sessionWords.length - 1 && isAtBase && !selectedRoot

  return (
    <div className="min-h-screen bg-slate-950">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[600px] mx-auto px-5 py-3 flex items-center justify-between">
          <button
            onClick={handleBack}
            className={backAsLink
              ? 'text-slate-500 hover:text-slate-300 text-sm active:opacity-60 underline underline-offset-2'
              : 'text-slate-400 hover:text-white text-base active:opacity-60'
            }
          >
            {backLabel}
          </button>
          {sessionWords && (
            <span className="text-slate-600 text-xs tabular-nums">
              {sessionIdx + 1} / {sessionWords.length}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-sm md:max-w-[600px] mx-auto text-white flex flex-col px-5 py-6 overflow-y-auto">

        {/* 単語（WordCard フリップ） */}
        <div className="text-center mb-5">
          <div className="flex items-center justify-center gap-2 mb-3">
            <p className="text-slate-500 text-base font-bold">
              <button
                onClick={() => setShowNumberQuiz(true)}
                className="active:opacity-60 transition-opacity"
              >No.{currentWord.leapNumber}</button>&nbsp;<span className="text-slate-600">{currentWord.leapPart}</span>
            </p>
            {capturedEntry && (
              <button
                onClick={() => navigate('/capture')}
                className="text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 rounded px-1.5 py-0.5 font-bold"
                style={{ filter: 'drop-shadow(0 0 4px rgba(6,182,212,0.4))' }}
              >
                🎯 捕獲済
              </button>
            )}
          </div>
          {capturedEntry && (
            <p className="text-xs text-cyan-500/70 mb-2">{capturedEntry.memo}</p>
          )}
          <div className="flex items-center justify-center gap-4 mb-3">
            <WordCard
              word={currentWord}
              textClassName="text-5xl font-black tracking-tight"
            />
            {/* チェックボタン（大型） */}
            <button
              onClick={handleToggleCheck}
              className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-150 active:scale-90 ${
                isChecked
                  ? 'bg-amber-400 shadow-[0_0_14px_3px_rgba(251,191,36,0.55)]'
                  : 'bg-slate-800 border-2 border-slate-600 hover:border-slate-400'
              }`}
              title={isChecked ? 'チェックを外す' : 'チェックする'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke={isChecked ? 'white' : '#475569'}
                strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          </div>
          {currentWord.meaning && (
            <p
              onClick={handleMeaningClick}
              className={`text-2xl text-slate-200 font-medium mt-1 ${examples.length > 0 ? 'cursor-pointer active:opacity-70' : ''}`}
            >
              {currentWord.meaning}
              {examples.length > 0 && (
                <span className="ml-2 text-sm text-amber-400/70">{showExamples ? '▲' : '▼ 例文'}</span>
              )}
            </p>
          )}
          {currentWord.partOfSpeech && (
            <p className="text-slate-600 text-sm mt-1">{currentWord.partOfSpeech}</p>
          )}
        </div>

        {/* 発音ボタン */}
        <button
          onClick={() => speak(currentWord.word, 'en-US', 0.75)}
          className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 text-sm font-bold mb-4 transition-colors active:scale-95"
        >
          🔊 読み上げ
        </button>

        {/* 例文セクション */}
        {showExamples && examples.length > 0 && (
          <div ref={examplesRef} className="mb-3 flex flex-col gap-3">
            {examples.map((ex, i) => (
              <div key={i} className="bg-amber-900/20 border border-amber-800/40 rounded-xl text-sm overflow-hidden">
                <button
                  onClick={() => speak(ex.answerEn, 'en-US', 0.8)}
                  className="w-full flex items-start justify-between gap-2 px-4 pt-3 pb-2 text-left active:bg-amber-800/20 transition-colors"
                >
                  <span className="text-amber-100 font-bold leading-snug flex-1">{ex.answerEn}</span>
                  <span className="text-amber-400 text-base shrink-0 mt-0.5">🔊</span>
                </button>
                <p className="text-amber-300/80 text-xs px-4 pb-3">{ex.questionJa}</p>
              </div>
            ))}
          </div>
        )}

        {/* 語源ヒント */}
        {rootsHint.length > 0 && (
          <div className="px-4 py-3 bg-purple-900/30 border border-purple-800/50 rounded-xl text-purple-300 text-sm mb-3">
            <div className="flex flex-wrap items-center justify-center gap-1">
              <span className="text-purple-500">🔤 語源:</span>
              {rootsHint.map((r, i) => (
                <span key={r.root} className="inline-flex items-center gap-1">
                  {i > 0 && <span className="text-purple-700">+</span>}
                  <button
                    onClick={() => handleRootTap(r)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg transition-colors active:scale-95 ${
                      selectedRoot?.root === r.root
                        ? 'bg-purple-600/60 text-purple-100'
                        : 'bg-purple-900/40 hover:bg-purple-800/60 text-purple-300'
                    }`}
                  >
                    <span className="font-bold">{r.root}</span>
                    <span className="text-purple-400 text-xs">({r.meaning})</span>
                  </button>
                </span>
              ))}
            </div>

            {/* 同語源の単語リスト */}
            {selectedRoot && (
              <div className="mt-3 pt-2 border-t border-purple-800/40">
                <p className="text-purple-400 text-xs mb-2 text-center">
                  「{selectedRoot.root}」を含む単語
                </p>
                {rootWordsLoading ? (
                  <p className="text-center text-purple-500 text-xs py-2">読み込み中...</p>
                ) : rootWords.length === 0 ? (
                  <p className="text-center text-purple-500 text-xs py-2">他に見つかりませんでした</p>
                ) : (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {rootWords.map(rw => (
                      <button
                        key={rw.id}
                        onClick={() => handleWordSelect(rw)}
                        className="inline-flex items-center gap-1 text-xs bg-purple-900/50 hover:bg-purple-700/60 border border-purple-800/50 rounded-lg px-2.5 py-1.5 transition-colors active:scale-95"
                      >
                        <span className="font-bold text-purple-200">{rw.word}</span>
                        <span className="text-purple-500">{rw.partOfSpeech}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
                  <button
                    key={fw.id}
                    onClick={() => handleWordSelect(fw)}
                    className="text-xs bg-blue-900/50 hover:bg-blue-700/60 rounded-lg px-2 py-1 active:scale-95 transition-colors"
                  >
                    <span className="font-bold text-blue-200">{fw.word}</span>
                    <span className="text-blue-500 ml-1">{fw.partOfSpeech}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 前の単語・次の単語ナビゲーション */}
        {sessionWords && isAtBase && (
          <div className="flex gap-3 mt-2 mb-2">
            <button
              onClick={() => setSessionIdx(i => i - 1)}
              disabled={!canPrev}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-25 rounded-xl text-sm font-bold transition-colors active:scale-95"
            >
              ← 前の単語
            </button>
            <button
              onClick={() => setSessionIdx(i => i + 1)}
              disabled={!canNext}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-25 rounded-xl text-sm font-bold transition-colors active:scale-95"
            >
              次の単語 →
            </button>
          </div>
        )}

        <div className="mt-auto pt-4">
          {backAsLink ? (
            <button
              onClick={handleBack}
              className="w-full py-3 text-slate-500 hover:text-slate-300 text-sm underline underline-offset-2 transition-colors active:opacity-60"
            >
              {backLabel}
            </button>
          ) : (
            <button
              onClick={handleBack}
              className="w-full py-4 bg-amber-600 hover:bg-amber-500 rounded-xl text-white text-base font-bold transition-colors active:scale-95"
            >
              {backLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
