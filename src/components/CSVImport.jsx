import { useRef, useState } from 'react'
import { db } from '../db/database'

const VALID_PARTS = ['Part1', 'Part2', 'Part3', 'Part4', 'α']

function parseCSV(text) {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''))
  if (lines.length < 2) throw new Error('データが空です')

  const header = lines[0].split(',')
  const required = ['word', 'meaning', 'partOfSpeech', 'leapPart', 'leapNumber']
  for (const col of required) {
    if (!header.includes(col)) throw new Error(`ヘッダーに "${col}" がありません`)
  }

  const idx = (name) => header.indexOf(name)

  const words = []
  const errors = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cols = lines[i].split(',')

    const leapPart = cols[idx('leapPart')]?.trim()
    if (!VALID_PARTS.includes(leapPart)) {
      errors.push(`行${i + 1}: leapPart が不正 ("${leapPart}")`)
      continue
    }

    const leapNumber = parseInt(cols[idx('leapNumber')]?.trim(), 10)
    if (isNaN(leapNumber)) {
      errors.push(`行${i + 1}: leapNumber が数値でありません`)
      continue
    }

    const tagsRaw = cols[idx('tags')]?.trim() ?? ''
    const tags = tagsRaw ? tagsRaw.split('|').map(t => t.trim()).filter(Boolean) : []

    words.push({
      word: cols[idx('word')]?.trim() ?? '',
      meaning: cols[idx('meaning')]?.trim() ?? '',
      partOfSpeech: cols[idx('partOfSpeech')]?.trim() ?? '',
      example: cols[idx('example')]?.trim() ?? '',
      leapPart,
      leapNumber,
      tags,
    })
  }

  return { words, errors }
}

export default function CSVImport() {
  const fileRef = useRef(null)
  const [status, setStatus] = useState(null) // null | 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('')
  const [warnings, setWarnings] = useState([])
  const [replaceAll, setReplaceAll] = useState(false)

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    // ファイル選択をリセット（同じファイルを再選択できるように）
    e.target.value = ''

    setStatus('loading')
    setMessage('')
    setWarnings([])

    try {
      const text = await file.text()
      const { words, errors } = parseCSV(text)

      if (words.length === 0) {
        setStatus('error')
        setMessage('インポートできる単語がありませんでした。')
        setWarnings(errors)
        return
      }

      await db.transaction('rw', db.words, async () => {
        if (replaceAll) {
          await db.words.clear()
        }
        await db.words.bulkAdd(words)
      })

      setStatus('success')
      setMessage(`${words.length} 件の単語をインポートしました。`)
      setWarnings(errors)
    } catch (err) {
      setStatus('error')
      setMessage(`エラー: ${err.message}`)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 上書きオプション */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={replaceAll}
          onChange={e => setReplaceAll(e.target.checked)}
          className="w-5 h-5 accent-blue-500"
        />
        <span className="text-slate-300">既存のデータを全削除して上書きする</span>
      </label>

      {/* ファイル選択ボタン */}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={status === 'loading'}
        className="w-full py-4 text-lg font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 rounded-xl transition-colors"
      >
        {status === 'loading' ? '読み込み中…' : '📂 CSVファイルを選択'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleImport}
        className="hidden"
      />

      {/* 結果表示 */}
      {status === 'success' && (
        <div className="p-4 bg-green-900/50 border border-green-600 rounded-xl text-green-300">
          ✅ {message}
        </div>
      )}
      {status === 'error' && (
        <div className="p-4 bg-red-900/50 border border-red-600 rounded-xl text-red-300">
          ❌ {message}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="p-4 bg-amber-900/30 border border-amber-700 rounded-xl">
          <p className="text-amber-400 font-bold mb-2">⚠️ スキップされた行 ({warnings.length}件)</p>
          <ul className="text-amber-300 text-sm space-y-1">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* CSVフォーマット説明 */}
      <div className="mt-2 p-4 bg-slate-800 rounded-xl text-sm text-slate-400">
        <p className="font-bold text-slate-300 mb-2">CSVフォーマット（UTF-8）</p>
        <code className="block text-xs leading-relaxed break-all">
          word,meaning,partOfSpeech,example,leapPart,leapNumber,tags<br/>
          abandon,捨てる,動詞,She abandoned her plan.,Part1,1,共通テスト
        </code>
        <p className="mt-2">tagsを複数指定する場合は "|" で区切ってください。</p>
      </div>
    </div>
  )
}
