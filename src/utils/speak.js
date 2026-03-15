/**
 * Web Speech API - 英語音声を明示的に選択して読み上げ
 * getVoices() が未ロードの場合は lang='en-US' のみで発話（フォールバック）
 */
export function speak(text, lang = 'en-US', rate = 0.85) {
  try {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()

    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang
    utter.rate = rate

    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      const englishVoice =
        voices.find(v => v.lang.startsWith('en') && v.localService) ??
        voices.find(v => v.lang.startsWith('en')) ??
        null
      if (englishVoice) utter.voice = englishVoice
    }

    window.speechSynthesis.speak(utter)
  } catch { /* ignore */ }
}
