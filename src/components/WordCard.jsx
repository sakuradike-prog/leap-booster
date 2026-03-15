import { useState, useEffect } from 'react'
import { db } from '../db/database'

/**
 * WordCard - フリップアニメーション付き単語表示コンポーネント（隠し要素）
 *
 * Props:
 *   word          - 単語オブジェクト { id, word, ... }
 *   textClassName - 表面の単語テキストに適用する className
 */
export default function WordCard({ word, textClassName = 'text-5xl font-black tracking-tight' }) {
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
          className="relative"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
        >
          <span className={textClassName}>{word.word}</span>
          {isBadge && (
            <img
              src="/badge.png"
              alt=""
              className="absolute pointer-events-none"
              style={{ width: 28, height: 28, top: -8, right: -28 }}
            />
          )}
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
