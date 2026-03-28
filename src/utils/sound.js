/**
 * 効果音 - HTMLAudioElement による再生
 *
 * Web Audio API (AudioContext) は iOS Safari でバックグラウンド復帰後に
 * suspended/interrupted 状態となり resume() が安定しないケースがある。
 * HTMLAudioElement は iOS のネイティブメディアセッションを利用するため
 * ユーザー操作から呼び出せば確実に鳴る。
 *
 * localStorage 'soundEnabled' が 'false' のときは無音。
 */

function isSoundEnabled() {
  return localStorage.getItem('soundEnabled') !== 'false'
}

function makeAudio(src) {
  try {
    const a = new Audio(src)
    a.preload = 'auto'
    a.load()
    return a
  } catch {
    return null
  }
}

const _correct = makeAudio('/コイン.m4a')
const _wrong   = makeAudio('/不正解.m4a')

/** コイン音（正解） */
export function playCorrect() {
  if (!isSoundEnabled() || !_correct) return
  try {
    // cloneNode() で毎回フレッシュなインスタンスを使う
    // （同一インスタンスの再利用だと seek 中に play() が失敗して無音になる）
    _correct.cloneNode().play().catch(() => {})
  } catch { /* ignore */ }
}

/** 不正解音 */
export function playWrong() {
  if (!isSoundEnabled() || !_wrong) return
  try {
    _wrong.cloneNode().play().catch(() => {})
  } catch { /* ignore */ }
}
