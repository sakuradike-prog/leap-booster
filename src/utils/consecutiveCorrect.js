const KEY = 'vocaleap_consecutive_correct'

export function getConsecutiveCorrect() {
  const v = parseInt(localStorage.getItem(KEY), 10)
  return isNaN(v) ? 0 : v
}

export function incrementConsecutiveCorrect() {
  const next = getConsecutiveCorrect() + 1
  localStorage.setItem(KEY, String(next))
  return next
}

export function resetConsecutiveCorrect() {
  localStorage.setItem(KEY, '0')
}
