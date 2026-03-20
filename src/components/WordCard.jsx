import { useState, useEffect } from 'react'
import { db } from '../db/database'
import WordBadges from './WordBadges'

/**
 * WordCard - フリップアニメーション付き単語表示コンポーネント（隠し要素）
 *
 * Props:
 *   word          - 単語オブジェクト { id, word, ... }
 *   textClassName - 表面の単語テキストに適用する className（フォントサイズは文字長で自動調整）
 *   isCaptured    - 捕獲済みバッジを表示するか
 */

/** 文字数に応じてフォントサイズを調整（画面右切れ防止） */
function adaptiveFontSize(str) {
  const len = str?.length ?? 0
  if (len <= 10) return '3rem'      // text-5xl
  if (len <= 13) return '2.25rem'   // text-4xl
  if (len <= 17) return '1.75rem'   // text-[28px]
  return '1.375rem'                 // text-[22px]
}

export default function WordCard({ word, textClassName = 'text-5xl font-black tracking-tight', isCaptured = false }) {
  const [flipped, setFlipped] = useState(false)
  const [studyCount, setStudyCount] = useState(0)
  const [incorrectCount, setIncorrectCount] = useState(0)

  useEffect(() => {
    setFlipped(false)
    if (!word?.id) return
    db.cards.where('wordId').equals(word.id).first()
      .then(c => {
        setStudyCount(c?.studyCount ?? 0)
        setIncorrectCount(c?.incorrectCount ?? 0)
      })
      .catch(() => {})
  }, [word?.id])

  const isBadge = studyCount >= 100

  return (
    <div
      onClick={() => setFlipped(v => !v)}
      style={{ perspective: '800px', display: 'inline-block', cursor: 'pointer' }}
    >
      <div
        style={{
          transition: 'transform 0.4s ease',
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          position: 'relative',
        }}
      >
        {/* 表面: 単語テキスト + バッジ */}
        <div
          className="relative flex flex-col items-center"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', maxWidth: '100%' }}
        >
          <span
            className={textClassName}
            style={{
              fontSize: adaptiveFontSize(word.word),
              overflowWrap: 'break-word',
              wordBreak: 'break-word',
              maxWidth: '100%',
              display: 'block',
              textAlign: 'center',
            }}
          >
            {word.word}
          </span>
          {isBadge && (
            <img
              src="/badge.png"
              alt=""
              className="absolute pointer-events-none"
              style={{ width: 28, height: 28, top: -8, right: -28 }}
            />
          )}
          <WordBadges isCaptured={isCaptured} />
        </div>

        {/* 裏面: 学習統計パネル */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 border border-slate-600 rounded-xl px-5 py-3 text-center"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            minWidth: '200px',
            minHeight: '72px',
          }}
        >
          <p className="text-slate-400 text-xs mb-1">あなたはこの単語に</p>
          <p className="font-black text-xl text-white mb-1">
            <span className="text-amber-400">{studyCount.toLocaleString()}</span>
            <span className="text-slate-300 font-normal text-sm ml-1">回 出会いました</span>
          </p>
          <p className="text-slate-500 text-xs">
            うち <span className="text-red-400 font-bold">{incorrectCount}</span> 回 間違えました
          </p>
        </div>
      </div>
    </div>
  )
}
