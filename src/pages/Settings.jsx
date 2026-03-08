import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { importCSVFromUrl } from '../utils/importFromCSV'

const WORD_LISTS = [
  { id: 'new', label: 'LEAP改訂版（2300語）', file: '/data/leap_words.csv' },
  { id: 'old', label: 'LEAP旧版（1935語）', file: '/data/leap_words_old.csv' },
]

export default function Settings() {
  const navigate = useNavigate()
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  // 単語リスト切り替え
  const [showListConfirm, setShowListConfirm] = useState(false)
  const [pendingList, setPendingList] = useState(null)
  const [listSwitching, setListSwitching] = useState(false)
  const [listSwitchDone, setListSwitchDone] = useState(false)
  const [listSwitchError, setListSwitchError] = useState(null)

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

  function requestListSwitch(list) {
    setPendingList(list)
    setShowListConfirm(true)
    setListSwitchDone(false)
    setListSwitchError(null)
  }

  async function confirmListSwitch() {
    if (!pendingList) return
    setShowListConfirm(false)
    setListSwitching(true)
    setListSwitchError(null)
    try {
      await importCSVFromUrl(pendingList.file, true)
      setListSwitchDone(true)
    } catch (err) {
      setListSwitchError(err.message)
    } finally {
      setListSwitching(false)
    }
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

        {/* 単語リスト切り替え */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-slate-200 mb-4 pb-2 border-b border-slate-700">
            使用する単語リスト
          </h2>

          {listSwitchDone && (
            <div className="mb-4 p-4 bg-green-900/50 border border-green-600 rounded-xl text-green-300">
              ✅ 単語リストを切り替えました。
            </div>
          )}
          {listSwitchError && (
            <div className="mb-4 p-4 bg-red-900/50 border border-red-600 rounded-xl text-red-300">
              ❌ {listSwitchError}
            </div>
          )}

          {listSwitching ? (
            <div className="p-4 bg-slate-800 rounded-xl text-slate-300 text-center">
              ⏳ 単語データを読み込み中...
            </div>
          ) : showListConfirm ? (
            <div className="p-4 bg-amber-900/30 border border-amber-700 rounded-xl">
              <p className="text-amber-300 font-bold mb-2">単語リストを切り替えますか？</p>
              <p className="text-amber-200 text-sm mb-4">
                単語リストを切り替えると学習履歴がリセットされます。よろしいですか？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={confirmListSwitch}
                  className="flex-1 py-3 font-bold bg-amber-600 hover:bg-amber-500 rounded-xl transition-colors"
                >
                  OK
                </button>
                <button
                  onClick={() => setShowListConfirm(false)}
                  className="flex-1 py-3 font-bold bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {WORD_LISTS.map(list => (
                <button
                  key={list.id}
                  onClick={() => requestListSwitch(list)}
                  className="w-full py-4 text-base font-bold bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl transition-colors text-left px-5"
                >
                  📚 {list.label}
                </button>
              ))}
              <p className="text-xs text-slate-500 mt-1">
                ※ 切り替えると学習履歴がリセットされます
              </p>
            </div>
          )}
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
