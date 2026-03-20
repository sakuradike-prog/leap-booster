/**
 * Web Speech API - 英語音声を明示的に選択して読み上げ
 * getVoices() が未ロードの場合は lang='en-US' のみで発話（フォールバック）
 * localStorage 'speechEnabled' が 'false' のときは無音
 *
 * iOS Safari 対策:
 *   - 最初のユーザー操作で無音 Utterance を speak() → エンジンを起動
 *   - cancel() 直後に speak() するとキューが詰まるため 50ms 遅延
 *   - paused 状態のまま固まることがあるため resume() を先に呼ぶ
 */

// iOS: 最初のタップで SpeechSynthesis エンジンをウォームアップ
function _warmupSpeech() {
  if (!window.speechSynthesis) return
  const u = new SpeechSynthesisUtterance('')
  u.volume = 0
  try { window.speechSynthesis.speak(u) } catch { /* ignore */ }
}
document.addEventListener('touchstart', _warmupSpeech, { once: true, passive: true })
document.addEventListener('click',      _warmupSpeech, { once: true })

export function speak(text, lang = 'en-US', rate = 0.85) {
  try {
    if (localStorage.getItem('speechEnabled') === 'false') return
    const synth = window.speechSynthesis
    if (!synth) return

    // iOS: paused 状態のままキューが詰まっている場合に解放
    if (synth.paused) synth.resume()
    synth.cancel()

    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang
    utter.rate = rate

    const voices = synth.getVoices()
    if (voices.length > 0) {
      const savedName = localStorage.getItem('vocaleap_voice_name')
      const englishVoice =
        (savedName ? voices.find(v => v.name === savedName) : null) ??
        voices.find(v => v.lang.startsWith('en') && v.localService) ??
        voices.find(v => v.lang.startsWith('en')) ??
        null
      if (englishVoice) utter.voice = englishVoice
    }

    // iOS Safari: cancel() が非同期で完了するまで待ってから speak()
    setTimeout(() => {
      try { synth.speak(utter) } catch { /* ignore */ }
    }, 50)
  } catch { /* ignore */ }
}
