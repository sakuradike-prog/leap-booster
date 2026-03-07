import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import CSVImport from '../components/CSVImport'

export default function Settings() {
  const navigate = useNavigate()
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  async function handleReset() {
    await db.transaction('rw', [db.words, db.cards, db.challengeHistory, db.warmupHistory, db.userStats, db.warmupSentences], async () => {
      await Promise.all([
        db.words.clear(),
        db.cards.clear(),
        db.challengeHistory.clear(),
        db.warmupHistory.clear(),
        db.userStats.clear(),
        db.warmupSentences.clear(),
      ])
    })
    setShowResetConfirm(false)
    setResetDone(true)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white px-4 py-8">
      <div className="max-w-sm mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center mb-8">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white mr-4 text-lg">
            ← 戻る
          </button>
          <h1 className="text-2xl font-bold">⚙️ 設定</h1>
        </div>

        {/* CSVインポート */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-slate-200 mb-4 pb-2 border-b border-slate-700">
            単語データのインポート
          </h2>
          <CSVImport />
        </section>

        {/* データリセット */}
        <section>
          <h2 className="text-lg font-bold text-slate-200 mb-4 pb-2 border-b border-slate-700">
            データリセット
          </h2>

          {resetDone && (
            <div className="mb-4 p-4 bg-green-900/50 border border-green-600 rounded-xl text-green-300">
              ✅ 全データをリセットしました。
            </div>
          )}

          {!showResetConfirm ? (
            <button
              onClick={() => { setShowResetConfirm(true); setResetDone(false) }}
              className="w-full py-4 text-lg font-bold bg-red-900/50 hover:bg-red-800 border border-red-700 rounded-xl transition-colors text-red-300"
            >
              🗑️ 全データを削除する
            </button>
          ) : (
            <div className="p-4 bg-red-900/30 border border-red-700 rounded-xl">
              <p className="text-red-300 font-bold mb-4">
                本当に全データを削除しますか？<br />
                <span className="font-normal text-sm">単語・学習記録・ポイントがすべて消えます。</span>
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="flex-1 py-3 font-bold bg-red-700 hover:bg-red-600 rounded-xl transition-colors"
                >
                  削除する
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-3 font-bold bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
