import { supabase } from '../lib/supabase'

const KEY = 'vocaleap_consecutive_correct'

export function getConsecutiveCorrect() {
  const v = parseInt(localStorage.getItem(KEY), 10)
  return isNaN(v) ? 0 : v
}

async function syncToServer(count) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) return
    await supabase
      .from('user_stats')
      .upsert({ user_id: session.user.id, consecutive_correct: count }, { onConflict: 'user_id' })
  } catch {}
}

export function incrementConsecutiveCorrect() {
  const next = getConsecutiveCorrect() + 1
  localStorage.setItem(KEY, String(next))
  syncToServer(next)
  return next
}

export function resetConsecutiveCorrect() {
  localStorage.setItem(KEY, '0')
  syncToServer(0)
}

/** ログイン時・フォアグラウンド復帰時：サーバーの値でローカルを上書き */
export async function mergeConsecutiveCorrect(userId) {
  if (!userId) return
  try {
    const { data, error } = await supabase
      .from('user_stats')
      .select('consecutive_correct')
      .eq('user_id', userId)
      .single()
    if (error || !data) return
    const serverCount = data.consecutive_correct ?? 0
    localStorage.setItem(KEY, String(serverCount))
  } catch {}
}
