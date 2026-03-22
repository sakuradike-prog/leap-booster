import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import WordDetailScreen from '../components/WordDetailScreen'

const PARTS = ['Part1', 'Part2', 'Part3', 'Part4', 'α']

export default function HeatmapPage() {
  const navigate = useNavigate()
  const [wordsByPart, setWordsByPart] = useState({})
  const [capturedMap, setCapturedMap] = useState({}) // leapNumber → memo
  const [loading, setLoading] = useState(true)
  const [selectedWord, setSelectedWord] = useState(null)
  // { id: word.id, bright: bool } | null
  const [flashing, setFlashing] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    async function load() {
      const [allWords, capturedEntries] = await Promise.all([
        db.words.orderBy('leapNumber').toArray(),
        db.captured_words.toArray(),
      ])

      const byPart = {}
      for (const p of PARTS) {
        byPart[p] = allWords.filter(w => w.leapPart === p)
      }
      setWordsByPart(byPart)

      const capMap = {}
      for (const c of capturedEntries) {
        capMap[c.leapNumber] = c.memo
      }
      setCapturedMap(capMap)
      setLoading(false)
    }
    load()
  }, [])

  if (selectedWord) {
    return (
      <WordDetailScreen
        word={selectedWord}
        onBack={() => setSelectedWord(null)}
      />
    )
  }

  const totalWords = Object.values(wordsByPart).reduce((s, a) => s + a.length, 0)
  const capturedCount = Object.keys(capturedMap).length

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[600px] mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white text-sm active:opacity-60">← 戻る</button>
            <h1 className="text-lg font-bold">単語収集ヒートマップ</h1>
          </div>
          <button onClick={() => navigate('/capture')} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold rounded-lg transition-colors">
            ＋ 捕獲する
          </button>
        </div>
      </div>
      <div className="max-w-[600px] mx-auto px-4 py-6">
        <p className="text-slate-400 text-xs mb-4">
          {totalWords.toLocaleString()}語中 <span className="text-cyan-400 font-bold">{capturedCount}語</span> 捕獲済み
        </p>

        {/* 凡例 */}
        <div className="flex gap-4 mb-5 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-cyan-400" />
            <span>捕獲済み</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-slate-700" />
            <span>未捕獲</span>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">読み込み中...</div>
        ) : (
          <div className="flex flex-col gap-5">
            {PARTS.map(part => {
              const words = wordsByPart[part] ?? []
              if (words.length === 0) return null
              const partCaptured = words.filter(w => capturedMap[w.leapNumber] !== undefined).length

              return (
                <div key={part}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{part}</span>
                    <span className="text-xs text-slate-600">
                      {partCaptured}/{words.length}語
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {words.map(word => {
                      const isCaptured = capturedMap[word.leapNumber] !== undefined
                      return (
                        <button
                          key={word.id}
                          onClick={() => {
                            if (flashing !== null) return
                            let bright = true
                            let count = 0
                            setFlashing({ id: word.id, bright })
                            const interval = setInterval(() => {
                              count++
                              bright = !bright
                              if (count >= 6) {
                                clearInterval(interval)
                                timerRef.current = null
                                setFlashing(null)
                                setSelectedWord(word)
                              } else {
                                setFlashing({ id: word.id, bright })
                              }
                            }, 150)
                            timerRef.current = interval
                          }}
                          title={isCaptured ? `${word.word} — ${capturedMap[word.leapNumber]}` : word.word}
                          className="w-[10px] h-[10px] rounded-sm"
                          style={{
                            backgroundColor: flashing?.id === word.id
                              ? (flashing.bright ? '#ffffff' : '#64748b')
                              : (isCaptured ? '#22d3ee' : '#334155'),
                            boxShadow: flashing?.id === word.id && flashing.bright
                              ? '0 0 6px rgba(255,255,255,0.9)'
                              : isCaptured ? '0 0 3px rgba(34,211,238,0.5)' : 'none',
                            transition: 'background-color 0.08s, box-shadow 0.08s',
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-8 pb-4">
          <button
            onClick={() => navigate('/capture')}
            className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold text-lg transition-colors"
          >
            🎯 ＋ 単語を捕獲する
          </button>
        </div>
      </div>
    </div>
  )
}
