/**
 * ユーザーが選択している単語帳バージョンを管理するユーティリティ
 * localStorage['leap_book_id'] = 'old' | 'new'
 * Settings.jsx で書き込み、各出題画面で読み取る
 */

export function getBookId() {
  return localStorage.getItem('leap_book_id') ?? 'new'
}

/** 旧版（1935語）を使用中かどうか */
export function isOldBook() {
  return getBookId() === 'old'
}

/**
 * Dexie の words クエリに使う sourceBook フィルター関数
 * sourceBook が未設定のレガシーデータは通過させる（後方互換）
 */
export function sourceBookFilter(word) {
  const bookId = getBookId()
  return !word.sourceBook || word.sourceBook === bookId
}
