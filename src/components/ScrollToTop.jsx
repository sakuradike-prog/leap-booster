import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * 画面遷移時のスクロール制御
 * - PUSH / REPLACE（新しい画面へ移動）: 最上部へスクロール
 * - POP（戻る・進む）: ブラウザのスクロール位置復元に任せる
 *
 * iOS PWA では window.scrollTo だけでは効かない場合があるため
 * documentElement / body も合わせてリセットする
 */
export default function ScrollToTop() {
  const { pathname } = useLocation()
  const navType = useNavigationType()

  useEffect(() => {
    if (navType !== 'POP') {
      window.scrollTo(0, 0)
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    }
  }, [pathname, navType])

  return null
}
