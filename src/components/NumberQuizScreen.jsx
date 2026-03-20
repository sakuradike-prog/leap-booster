import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'

/**
 * NumberQuizScreen - 単語No.クイズ画面
 *
 * Props:
 *   startWord - クイズを開始する基点の単語（この単語の「次のNo.」がクイズ対象）
 *   onBack    - 「← 解説に戻る」コールバック
 */
export default function NumberQuizScreen({ startWord, onBack }) {
  const navigate = useNavigate()
  const [allWords, setAllWords] = useState([])
  const [leftIdx, setLeftIdx] = useState(0)
  const [hint1Shown, setHint1Shown] = useState(false)
  const [hint2Shown, setHint2Shown] = useState(false)
  const [answerShown, setAnswerShown] = useState(false)
  const [originWord, setOriginWord] = useState(startWord)

  useEffect(() => {
    db.words.orderBy('leapNumber').toArray().then(words => {
      // leapNumberで重複除去（同じ番号が複数Partに存在するため）
      const seen = new Set()
      const unique = words.filter(w => {
        if (seen.has(w.leapNumber)) return false
        seen.add(w.leapNumber)
        return true
      })
      setAllWords(unique)
      let idx = unique.findIndex(w => w.id === startWord.id)
      if (idx < 0) idx = unique.findIndex(w => w.leapNumber === startWord.leapNumber)
      setLeftIdx(idx >= 0 ? idx : 0)
    })
  }, []) // eslint-disable-line

  function advanceToNext() {
    const nextLeftIdx = (leftIdx + 1) % allWords.length
    setLeftIdx(nextLeftIdx)
    setHint1Shown(false)
    setHint2Shown(false)
    setAnswerShown(false)
  }

  if (allWords.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        読み込み中...
      </div>
    )
  }

  const leftWord = allWords[leftIdx]
  const quizIdx = (leftIdx + 1) % allWords.length
  const quizWord = allWords[quizIdx]

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* 2カラムメインエリア */}
      <div className="flex-1 flex">
        {/* 左カラム: 現在の単語 */}
        <div className="w-2/5 border-r border-slate-800 flex flex-col justify-center px-4 py-8">
          <p className="text-slate-500 text-xs mb-2">No.{leftWord.leapNumber}</p>
          <p className="text-2xl font-black text-white break-all">{leftWord.word}</p>
        </div>

        {/* 右カラム: クイズ */}
        <div className="flex-1 flex flex-col px-4 py-8 gap-4">
          <p className="text-slate-300 text-sm font-bold">
            No.{quizWord.leapNumber} の単語は？
          </p>

          {/* ヒント1 */}
          <div>
            {!hint1Shown ? (
              <button
                onClick={() => setHint1Shown(true)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-bold text-slate-300 transition-colors active:scale-95"
              >
                ヒント1を見る
              </button>
            ) : (
              <div className="px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm">
                <p className="text-slate-500 text-xs mb-1">ヒント1</p>
                <p className="text-white font-bold">
                  頭文字は「{quizWord.word?.[0]?.toUpperCase()}」
                </p>
              </div>
            )}
          </div>

          {/* ヒント2 */}
          <div>
            {!hint2Shown ? (
              <button
                onClick={() => setHint2Shown(true)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-bold text-slate-300 transition-colors active:scale-95"
              >
                ヒント2を見る
              </button>
            ) : (
              <div className="px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm">
                <p className="text-slate-500 text-xs mb-1">ヒント2</p>
                <p className="text-white font-bold">{quizWord.meaning}</p>
              </div>
            )}
          </div>

          {/* 答えを見る */}
          <div>
            {!answerShown ? (
              <button
                onClick={() => setAnswerShown(true)}
                className="w-full py-3 bg-blue-700 hover:bg-blue-600 rounded-xl text-sm font-bold text-white transition-colors active:scale-95"
              >
                答えを見る
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="px-4 py-3 bg-green-900/40 border border-green-700/50 rounded-xl text-center">
                  <p className="text-green-300 text-xl font-black">{quizWord.word}</p>
                </div>
                <button
                  onClick={advanceToNext}
                  className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-bold text-white transition-colors active:scale-95"
                >
                  No.{allWords[(quizIdx + 1) % allWords.length].leapNumber} のクイズへ →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ナビゲーション */}
      <div className="border-t border-slate-800 px-4 py-4 flex flex-col gap-2">
        <button
          onClick={onBack}
          className="w-full py-3 text-slate-400 hover:text-white text-sm transition-colors active:opacity-60"
        >
          ← No.{originWord.leapNumber} の解説に戻る
        </button>
        <button
          onClick={() => navigate('/')}
          className="w-full py-3 text-slate-600 hover:text-slate-400 text-sm transition-colors active:opacity-60"
        >
          ホームへ戻る
        </button>
      </div>
    </div>
  )
}
