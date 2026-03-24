import { useAuth } from '../hooks/useAuth'

export default function NotAllowedPage() {
  const { signInWithGoogle, signOut } = useAuth()

  async function handleRetry() {
    await signOut()
    await signInWithGoogle()
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-6">
      <div className="max-w-sm w-full bg-slate-800 rounded-2xl p-8 text-center flex flex-col gap-4">
        <div className="text-5xl">🔒</div>
        <h1 className="text-white text-xl font-bold">このアプリは招待制です</h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          登録されていないアカウントは<br />アクセスできません。
        </p>
        <p className="text-slate-400 text-sm">
          担当の先生にご連絡ください。
        </p>
        <button
          onClick={handleRetry}
          className="mt-2 w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors active:scale-95"
        >
          別のアカウントでログイン
        </button>
      </div>
    </div>
  )
}
