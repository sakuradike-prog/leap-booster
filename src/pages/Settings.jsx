import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { importCSVFromUrl } from '../utils/importFromCSV'
import { loadExamples } from '../utils/loadExamples'

const WORD_LISTS = [
  { id: 'new', label: 'LEAP改訂版（2300語）', file: '/data/leap_words.csv' },
  { id: 'old', label: 'LEAP旧版（1935語）', file: '/data/leap_words_old.csv' },
]

const ALPHA_CSV = '/data/leap_alpha.csv'

function getStoredTimer() {
  const v = parseInt(localStorage.getItem('quizTimerSecs'), 10)
  return (!isNaN(v) && v >= 3 && v <= 15) ? v : 10
}

function getBoolSetting(key) {
  return localStorage.getItem(key) !== 'false'
}

// トグルスイッチ
function Toggle({ enabled, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none ${
        enabled ? 'bg-blue-500' : 'bg-slate-600'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  // タイマー設定
  const [challengeTimer, setChallengeTimer] = useState(getStoredTimer)
  function handleTimerChange(val) {
    const n = parseInt(val, 10)
    setChallengeTimer(n)
    localStorage.setItem('quizTimerSecs', String(n))
  }

  // サウンド設定
  const [soundEnabled, setSoundEnabled] = useState(() => getBoolSetting('soundEnabled'))
  function handleSoundToggle(val) {
    setSoundEnabled(val)
    localStorage.setItem('soundEnabled', String(val))
  }

  // 読み上げ設定
  const [speechEnabled, setSpeechEnabled] = useState(() => getBoolSetting('speechEnabled'))
  function handleSpeechToggle(val) {
    setSpeechEnabled(val)
    localStorage.setItem('speechEnabled', String(val))
  }

  // 単語リスト切り替え
  const [showListConfirm, setShowListConfirm] = useState(false)
  const [pendingList, setPendingList] = useState(null)
  const [listSwitching, setListSwitching] = useState(false)
  const [listSwitchDone, setListSwitchDone] = useState(false)
  const [listSwitchError, setListSwitchError] = useState(null)

  // αパート追加
  const [alphaAdding, setAlphaAdding] = useState(false)
  const [alphaDone, setAlphaDone] = useState(false)
  const [alphaError, setAlphaError] = useState(null)

  async function handleAddAlpha() {
    setAlphaAdding(true)
    setAlphaDone(false)
    setAlphaError(null)
    try {
      await importCSVFromUrl(ALPHA_CSV, false)
      setAlphaDone(true)
    } catch (err) {
      setAlphaError(err.message)
    } finally {
      setAlphaAdding(false)
    }
  }

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
      await loadExamples()
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

        {/* サウンド・読み上げ設定 */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-slate-200 mb-4 pb-2 border-b border-slate-700">
            🔊 サウンド・読み上げ
          </h2>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-slate-200 font-semibold text-sm">効果音</div>
                <div className="text-slate-500 text-xs mt-0.5">正解・不正解のピンポーン・ブブー音</div>
              </div>
              <Toggle enabled={soundEnabled} onChange={handleSoundToggle} />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-slate-200 font-semibold text-sm">英語読み上げ</div>
                <div className="text-slate-500 text-xs mt-0.5">単語・英文の自動音声読み上げ</div>
              </div>
              <Toggle enabled={speechEnabled} onChange={handleSpeechToggle} />
            </div>
          </div>
        </section>

        {/* 4択練習 タイマー設定 */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-slate-200 mb-4 pb-2 border-b border-slate-700">
            4択練習 タイマー
          </h2>
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-300 text-sm">1問あたりの制限時間</span>
            <span className="text-3xl font-black text-blue-400">{challengeTimer}<span className="text-lg ml-1">秒</span></span>
          </div>
          <input
            type="range"
            min="3"
            max="15"
            step="1"
            value={challengeTimer}
            onChange={e => handleTimerChange(e.target.value)}
            className="w-full accent-blue-500 mb-1"
          />
          <div className="flex justify-between text-xs text-slate-600">
            <span>3秒（上級）</span>
            <span>15秒（ゆっくり）</span>
          </div>
        </section>

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

        {/* αパート追加（旧版ユーザー向け） */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-slate-200 mb-4 pb-2 border-b border-slate-700">
            αパートを追加する
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            旧版（1935語）を使用中の場合でも、改訂版のαパート（300語）だけを追加できます。Part1〜4の学習履歴はそのまま保持されます。
          </p>

          {alphaDone && (
            <div className="mb-4 p-4 bg-green-900/50 border border-green-600 rounded-xl text-green-300">
              ✅ αパート（300語）を追加しました。
            </div>
          )}
          {alphaError && (
            <div className="mb-4 p-4 bg-red-900/50 border border-red-600 rounded-xl text-red-300">
              ❌ {alphaError}
            </div>
          )}

          {alphaAdding ? (
            <div className="p-4 bg-slate-800 rounded-xl text-slate-300 text-center">
              ⏳ αパートデータを読み込み中...
            </div>
          ) : (
            <button
              onClick={handleAddAlpha}
              className="w-full py-4 text-base font-bold bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl transition-colors text-left px-5"
            >
              ✨ αパートを追加する（300語）
            </button>
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
