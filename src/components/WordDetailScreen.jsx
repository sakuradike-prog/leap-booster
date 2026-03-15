import { useState, useEffect } from 'react'
import { db } from '../db/database'
import { findRoots } from '../utils/findRoots'
import { speak } from '../utils/speak'
import WordCard from './WordCard'

/**
 * WordDetailScreen - 単語解説画面（全画面共通）
 *
 * Props:
 *   word   - db.words のレコード { id, word, meaning, partOfSpeech, leapNumber, leapPart, familyId, ... }
 *   onBack - 戻るボタンのコールバック
 */
export default function WordDetailScreen({ word, onBack }) {
  const [allRoots, setAllRoots] = useState([])
  const [rootsHint, setRootsHint] = useState([])
  const [familyData, setFamilyData] = useState(null)
  const [familyWords, setFamilyWords] = useState([])

  useEffect(() => {
    db.roots.toArray().then(r => setAllRoots(r)).catch(() => {})
  }, [])

  useEffect(() => {
    if (allRoots.length > 0 && word?.word) {
      setRootsHint(findRoots(word.word, allRoots))
    }
  }, [allRoots, word?.word])

  useEffect(() => {
    setFamilyData(null)
    setFamilyWords([])
    if (!word?.familyId) return
    db.wordFamilies.get(word.familyId)
      .then(fam => { if (fam) setFamilyData(fam) })
      .catch(() => {})
    db.words.where('familyId').equals(word.familyId).toArray()
      .then(ws => {
        const seen = new Set()
        const unique = ws.filter(w => {
          if (w.id === word.id) return false
          if (seen.has(w.word)) return false
          seen.add(w.word)
          return true
        })
        setFamilyWords(unique.slice(0, 8))
      })
      .catch(() => {})
  }, [word?.id, word?.familyId])

  useEffect(() => {
    if (word?.word) speak(word.word, 'en-US', 0.85)
  }, [word?.word])

  if (!word) return null

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
          No.{word.leapNumber}&nbsp;<span className="text-slate-600">{word.leapPart}</span>
        </p>
        <div className="flex justify-center mb-3">
          <WordCard
            word={word}
            textClassName="text-5xl font-black tracking-tight"
          />
        </div>
        {word.meaning && (
          <p className="text-2xl text-slate-200 font-medium mt-1">{word.meaning}</p>
        )}
        {word.partOfSpeech && (
          <p className="text-slate-600 text-sm mt-1">{word.partOfSpeech}</p>
        )}
      </div>

      {/* 発音ボタン */}
      <button
        onClick={() => speak(word.word, 'en-US', 0.75)}
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
          ← 戻る
        </button>
      </div>
    </div>
  )
}
