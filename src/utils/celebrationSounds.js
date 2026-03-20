/**
 * 演出用サウンド（Web Audio API）
 * soundEnabled=false のときは無音
 */

function isSoundEnabled() {
  return localStorage.getItem('soundEnabled') !== 'false'
}

function getCtx() {
  try { return new (window.AudioContext || window.webkitAudioContext)() } catch { return null }
}

// ストリーク達成ファンファーレ：上昇アルペジオ → 和音
export function playStreakFanfare() {
  if (!isSoundEnabled()) return
  const ctx = getCtx()
  if (!ctx) return

  const notes = [
    { freq: 523.25, t: 0,    dur: 0.18, vol: 0.28, type: 'triangle' },
    { freq: 659.25, t: 0.13, dur: 0.18, vol: 0.28, type: 'triangle' },
    { freq: 783.99, t: 0.26, dur: 0.18, vol: 0.28, type: 'triangle' },
    { freq: 1046.5, t: 0.39, dur: 0.6,  vol: 0.30, type: 'triangle' },
    { freq: 783.99, t: 0.39, dur: 0.6,  vol: 0.18, type: 'sine'     },
    { freq: 659.25, t: 0.39, dur: 0.6,  vol: 0.15, type: 'sine'     },
  ]

  notes.forEach(({ freq, t, dur, vol, type }) => {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    const start = ctx.currentTime + t
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(vol, start + 0.02)
    gain.gain.setValueAtTime(vol, start + dur - 0.06)
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(start); osc.stop(start + dur + 0.05)
  })
}

// 4択/瞬間英作文セッション完了：明るい上昇アルペジオ
export function playSessionCompleteSound() {
  if (!isSoundEnabled()) return
  const ctx = getCtx()
  if (!ctx) return

  const notes = [
    { freq: 523.25, t: 0,    dur: 0.15, vol: 0.24, type: 'triangle' },
    { freq: 659.25, t: 0.10, dur: 0.15, vol: 0.24, type: 'triangle' },
    { freq: 783.99, t: 0.20, dur: 0.15, vol: 0.24, type: 'triangle' },
    { freq: 1046.5, t: 0.30, dur: 0.45, vol: 0.28, type: 'triangle' },
    { freq: 783.99, t: 0.30, dur: 0.45, vol: 0.15, type: 'sine'     },
  ]

  notes.forEach(({ freq, t, dur, vol, type }) => {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    const start = ctx.currentTime + t
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(vol, start + 0.02)
    gain.gain.setValueAtTime(vol, start + dur - 0.05)
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(start); osc.stop(start + dur + 0.05)
  })
}

// 30問チャレンジクリア：グランドファンファーレ（衝撃音＋上昇アルペジオ＋和音）
export function playChallengeClrSound() {
  if (!isSoundEnabled()) return
  const ctx = getCtx()
  if (!ctx) return

  // 衝撃音（ノイズバースト）
  const bufLen = Math.floor(ctx.sampleRate * 0.09)
  const buf  = ctx.createBuffer(1, bufLen, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufLen; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 2)
  }
  const noise  = ctx.createBufferSource()
  noise.buffer = buf
  const lpf = ctx.createBiquadFilter()
  lpf.type = 'lowpass'; lpf.frequency.value = 360
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.5, ctx.currentTime)
  ng.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
  noise.connect(lpf); lpf.connect(ng); ng.connect(ctx.destination)
  noise.start(ctx.currentTime)

  // ファンファーレメロディ
  const notes = [
    { freq: 523.25, t: 0,    dur: 0.18, vol: 0.30, type: 'triangle' },
    { freq: 659.25, t: 0.13, dur: 0.18, vol: 0.30, type: 'triangle' },
    { freq: 783.99, t: 0.26, dur: 0.18, vol: 0.30, type: 'triangle' },
    { freq: 1046.5, t: 0.39, dur: 0.22, vol: 0.33, type: 'triangle' },
    { freq: 1318.5, t: 0.60, dur: 0.80, vol: 0.30, type: 'triangle' },
    { freq: 1046.5, t: 0.60, dur: 0.80, vol: 0.18, type: 'sine'     },
    { freq: 783.99, t: 0.60, dur: 0.80, vol: 0.14, type: 'sine'     },
    { freq: 659.25, t: 0.60, dur: 0.80, vol: 0.11, type: 'sine'     },
  ]

  notes.forEach(({ freq, t, dur, vol, type }) => {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    const start = ctx.currentTime + t
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(vol, start + 0.02)
    gain.gain.setValueAtTime(vol, start + dur - 0.07)
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(start); osc.stop(start + dur + 0.05)
  })
}

// 捕獲インパクト：低音ドスン → チャイム上昇
export function playCaptureSound() {
  if (!isSoundEnabled()) return
  const ctx = getCtx()
  if (!ctx) return

  // ローパスフィルタ通したノイズバースト（衝撃音）
  const bufLen = Math.floor(ctx.sampleRate * 0.1)
  const buf  = ctx.createBuffer(1, bufLen, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufLen; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 2.5)
  }
  const noise  = ctx.createBufferSource()
  noise.buffer = buf
  const lpf = ctx.createBiquadFilter()
  lpf.type = 'lowpass'; lpf.frequency.value = 280
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.55, ctx.currentTime)
  ng.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
  noise.connect(lpf); lpf.connect(ng); ng.connect(ctx.destination)
  noise.start(ctx.currentTime)

  // チャイム（E5 → A5 → E6）
  const chimes = [
    { freq: 659.25, t: 0.08, dur: 0.4,  vol: 0.22 },
    { freq: 880.00, t: 0.22, dur: 0.4,  vol: 0.22 },
    { freq: 1318.5, t: 0.36, dur: 0.55, vol: 0.26 },
  ]
  chimes.forEach(({ freq, t, dur, vol }) => {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    const start = ctx.currentTime + t
    osc.type = 'sine'; osc.frequency.value = freq
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(vol, start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(start); osc.stop(start + dur + 0.05)
  })
}
