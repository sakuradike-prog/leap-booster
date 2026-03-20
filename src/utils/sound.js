/**
 * 効果音 - Web Audio API によるゼロレイテンシ再生
 *
 * 起動時にバッファをプリロード・デコードしておき、
 * ボタンを押した瞬間に即時再生する。
 * localStorage 'soundEnabled' が 'false' のときは無音。
 *
 * iOS Safari 対策:
 *   AudioContext は最初のユーザー操作でしか resume() できない。
 *   touchstart / click で早期アンロックし、音が鳴る前に ready 状態にする。
 */

// AudioContext を一度だけ生成（ブラウザ互換）
const _ctx = (() => {
  try {
    return new (window.AudioContext || window.webkitAudioContext)()
  } catch {
    return null
  }
})()

let _correctBuffer = null
let _wrongBuffer   = null

async function loadBuffer(url) {
  if (!_ctx) return null
  try {
    const res      = await fetch(url)
    const arrayBuf = await res.arrayBuffer()
    return await _ctx.decodeAudioData(arrayBuf)
  } catch {
    return null
  }
}

// アプリ起動時にプリロード（非同期・バックグラウンド）
loadBuffer('/コイン.m4a').then(b  => { _correctBuffer = b }).catch(() => {})
loadBuffer('/不正解.m4a').then(b  => { _wrongBuffer   = b }).catch(() => {})

// iOS: 最初のユーザー操作（touchstart / click）で AudioContext をアンロック
// → 1問目のタップで音が出ない問題を解消
function _unlockOnce() {
  if (_ctx && _ctx.state === 'suspended') {
    _ctx.resume().catch(() => {})
  }
}
document.addEventListener('touchstart', _unlockOnce, { once: true, passive: true })
document.addEventListener('click',      _unlockOnce, { once: true })

function isSoundEnabled() {
  return localStorage.getItem('soundEnabled') !== 'false'
}

async function playBuffer(buffer) {
  if (!_ctx || !buffer || !isSoundEnabled()) return
  try {
    if (_ctx.state === 'suspended') {
      await _ctx.resume()
    }
    const src = _ctx.createBufferSource()
    src.buffer = buffer
    src.connect(_ctx.destination)
    src.start(0)
  } catch {
    /* ignore */
  }
}

/** コイン音（正解） */
export function playCorrect() {
  playBuffer(_correctBuffer)
}

/** 不正解音 */
export function playWrong() {
  playBuffer(_wrongBuffer)
}
