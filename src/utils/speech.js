// Web Speech API ラッパー
// iPad Safari では en-US ボイスが利用可能

let voices = []

function loadVoices() {
  return new Promise(resolve => {
    const list = window.speechSynthesis.getVoices()
    if (list.length > 0) {
      voices = list
      resolve(voices)
      return
    }
    window.speechSynthesis.onvoiceschanged = () => {
      voices = window.speechSynthesis.getVoices()
      resolve(voices)
    }
  })
}

function pickEnglishVoice() {
  // en-US > en-GB > en の順で探す
  return (
    voices.find(v => v.lang === 'en-US') ||
    voices.find(v => v.lang === 'en-GB') ||
    voices.find(v => v.lang.startsWith('en')) ||
    null
  )
}

export async function speak(text, { rate = 0.9, pitch = 1.0 } = {}) {
  if (!window.speechSynthesis) return

  window.speechSynthesis.cancel()
  await loadVoices()

  return new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'en-US'
    utter.rate = rate
    utter.pitch = pitch

    const voice = pickEnglishVoice()
    if (voice) utter.voice = voice

    utter.onend = resolve
    utter.onerror = resolve // エラーでも次に進む

    window.speechSynthesis.speak(utter)
  })
}

export function cancelSpeech() {
  if (window.speechSynthesis) window.speechSynthesis.cancel()
}
