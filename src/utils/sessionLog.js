import { db } from '../db/database'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** セッション開始。sessionId（number）を返す */
export async function startSession(mode) {
  try {
    const id = await db.session_logs.add({
      date: todayKey(),
      mode,
      startTime: Date.now(),
      endTime: null,
      duration: null,
    })
    return id
  } catch { return null }
}

/** セッション終了。duration（秒）を記録する */
export async function endSession(sessionId) {
  if (!sessionId) return
  try {
    const session = await db.session_logs.get(sessionId)
    if (!session || session.endTime) return
    const endTime = Date.now()
    const duration = Math.round((endTime - session.startTime) / 1000)
    await db.session_logs.update(sessionId, { endTime, duration })
  } catch { /* ignore */ }
}
