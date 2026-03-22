import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { importCSVFromUrl } from '../utils/importFromCSV'
import { loadExamples } from '../utils/loadExamples'
import { useAuth } from '../hooks/useAuth'
import { fetchUserStats, syncDisplayName } from '../utils/supabaseSync'

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
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth()
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  // ニックネーム
  const [displayName, setDisplayName] = useState('')
  const [displayNameSaving, setDisplayNameSaving] = useState(false)
  const [displayNameSaved, setDisplayNameSaved] = useState(false)

  useEffect(() => {
    if (!user) return
    fetchUserStats(user.id).then(stats => {
      if (stats?.display_name) {
        setDisplayName(stats.display_name)
      } else {
        // Googleアカウント名をデフォルト値として提案
        const googleName = user.user_metadata?.full_name || user.user_metadata?.name || ''
        setDisplayName(googleName)
      }
    })
  }, [user])

  async function handleSaveDisplayName() {
    if (!user || !displayName.trim()) return
    setDisplayNameSaving(true)
    setDisplayNameSaved(false)
    await syncDisplayName(user.id, displayName.trim())
    setDisplayNameSaving(false)
    setDisplayNameSaved(true)
    setTimeout(() => setDisplayNameSaved(false), 3000)
  }

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

  // 音声選択
  const [voices, setVoices] = useState([])
  const [selectedVoiceName, setSelectedVoiceName] = useState(
    () => localStorage.getItem('vocaleap_voice_name') ?? ''
  )

  useEffect(() => {
    if (!window.speechSynthesis) return
    function loadVoices() {
      const all = window.speechSynthesis.getVoices()
      if (all.length === 0) return

      // ノベルティ・非人間・かすれ声などをブロック（英語名・日本語名両対応）
      const NOVELTY = [
        // English names
        'bad news', 'bubbles', 'cellos', 'good news', 'jester', 'junior',
        'organ', 'trinoids', 'trinoid', 'whisper', 'wobble', 'zarvox',
        'bells', 'bell', 'boing', 'bottle', 'deranged', 'hysterical',
        'pipe organ', 'spectral', 'superstar', 'tuvan', 'albert', 'fred',
        'ralph', 'kathy', 'bruce', 'bahh',
        // iOS日本語環境での表記
        '道化', 'オルガン', 'スーパースター', 'トリノイド', 'バッドニュース',
        'バブルス', 'セロス', 'グッドニュース', 'ジュニア', 'ウォブル',
        'ザーボックス', 'ベルズ', 'ベル', 'ボイング', 'デレンジド',
        'ヒステリカル', 'スペクトラル', 'チューバン', 'バー',
        'ささやき', '囁き', '震え', 'かすれ',
      ]
      const isNovelty = (v) => {
        const n = v.name.toLowerCase()
        return NOVELTY.some(w => n.includes(w.toLowerCase()))
      }

      // en-US / en_US / en-GB / en_GB に限定（アンダースコア正規化）
      const langNorm = (v) => v.lang.replace('_', '-').toLowerCase()
      const isTarget = (v) => langNorm(v) === 'en-us' || langNorm(v) === 'en-gb'

      const enVoices = all
        .filter(v => isTarget(v) && !isNovelty(v))
        // ローカル保存（iOSダウンロード高品質声含む）を上位に表示
        .sort((a, b) => (b.localService ? 1 : 0) - (a.localService ? 1 : 0))

      if (enVoices.length > 0) setVoices(enVoices)
    }
    loadVoices()
    // voiceschangedは複数回発火することがあるため、遅延リトライも追加
    setTimeout(loadVoices, 500)
    setTimeout(loadVoices, 1500)
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
  }, [])

  function handleVoiceSelect(name) {
    setSelectedVoiceName(name)
    if (name) {
      localStorage.setItem('vocaleap_voice_name', name)
    } else {
      localStorage.removeItem('vocaleap_voice_name')
    }
  }

  function handleVoicePreview(voice) {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance('Hello! This is a voice preview.')
    u.voice = voice
    u.lang = voice.lang
    u.rate = 0.85
    setTimeout(() => window.speechSynthesis.speak(u), 50)
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
      await importCSVFromUrl(ALPHA_CSV, false, 'new')
      setAlphaDone(true)
    } catch (err) {
      setAlphaError(err.message)
    } finally {
      setAlphaAdding(false)
    }
  }

  async function handleReset() {
    await db.transaction('rw', [db.words, db.cards, db.challengeHistory, db.warmupHistory, db.userStats, db.warmupSentences, db.study_logs, db.session_logs, db.captured_words], async () => {
      await Promise.all([
        db.words.clear(),
        db.cards.clear(),
        db.challengeHistory.clear(),
        db.warmupHistory.clear(),
        db.userStats.clear(),
        db.warmupSentences.clear(),
        db.study_logs.clear(),
        db.session_logs.clear(),
        db.captured_words.clear(),
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
      await importCSVFromUrl(pendingList.file, true, pendingList.id)
      localStorage.setItem('leap_book_id', pendingList.id)
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
      <div className="max-w-[600px] mx-auto">
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

          {/* 音声選択 */}
          {voices.length > 0 && (
            <div className="mt-4">
              <div className="text-slate-400 text-xs font-semibold mb-2 uppercase tracking-wider">読み上げ声の選択</div>
              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-1">
                {/* 自動選択 */}
                <button
                  type="button"
                  onClick={() => handleVoiceSelect('')}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors ${
                    selectedVoiceName === ''
                      ? 'bg-blue-600/30 border border-blue-500'
                      : 'bg-slate-800 border border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {selectedVoiceName === '' && <span className="text-blue-400 text-xs">✓</span>}
                    <div className="min-w-0">
                      <div className="text-slate-200 text-sm font-medium">自動選択</div>
                      <div className="text-slate-500 text-xs">デバイスのデフォルト英語音声</div>
                    </div>
                  </div>
                </button>

                {/* 各音声 */}
                {voices.map(voice => (
                  <div
                    key={voice.name}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                      selectedVoiceName === voice.name
                        ? 'bg-blue-600/30 border border-blue-500'
                        : 'bg-slate-800 border border-slate-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleVoiceSelect(voice.name)}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    >
                      {selectedVoiceName === voice.name && <span className="text-blue-400 text-xs flex-shrink-0">✓</span>}
                      <div className="min-w-0">
                        <div className="text-slate-200 text-sm font-medium truncate">{voice.name}</div>
                        <div className="text-xs mt-0.5">
                          <span className="text-slate-500">{voice.lang}</span>
                          {voice.localService
                            ? <span className="ml-1.5 text-emerald-400 font-medium">📲 ダウンロード済み</span>
                            : <span className="ml-1.5 text-slate-600">オンライン</span>}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVoicePreview(voice)}
                      className="ml-2 flex-shrink-0 px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
                    >
                      🔊
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                SRS復習カード・チャレンジ履歴はリセットされます。<br/>ポイント・ストリークは保持されます。よろしいですか？
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
                ※ ポイント・ストリークは保持されます
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

        {/* アカウント */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-slate-200 mb-4 pb-2 border-b border-slate-700">
            🔐 アカウント
          </h2>
          {authLoading ? (
            <div className="p-4 bg-slate-800 rounded-xl text-slate-300 text-center text-sm">
              読み込み中...
            </div>
          ) : user ? (
            <div className="flex flex-col gap-3">
              <div className="p-4 bg-slate-800 rounded-xl text-sm text-slate-300">
                ✅ ログイン中：{user.email}
              </div>

              {/* ニックネーム */}
              <div className="p-4 bg-slate-800 rounded-xl flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-semibold">
                  ランキング表示名（ニックネーム）
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value.slice(0, 20))}
                    maxLength={20}
                    placeholder="ニックネームを入力"
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleSaveDisplayName}
                    disabled={displayNameSaving || !displayName.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm font-bold transition-colors"
                  >
                    {displayNameSaving ? '…' : displayNameSaved ? '✓' : '保存'}
                  </button>
                </div>
                <p className="text-xs text-slate-600">ランキング画面で表示される名前です（最大20文字）</p>
              </div>

              <button
                onClick={signOut}
                className="w-full py-4 text-base font-bold bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl transition-colors"
              >
                ログアウト
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <button
                onClick={signInWithGoogle}
                className="w-full py-4 text-base font-bold bg-blue-700 hover:bg-blue-600 border border-blue-500 rounded-xl transition-colors"
              >
                Googleでログイン
              </button>
              <p className="text-xs text-slate-500">
                ログインするとデータのクラウド保存・ランキング参加ができます
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
