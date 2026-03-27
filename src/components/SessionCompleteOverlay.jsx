import { useEffect, useRef, useState } from 'react'
import { playSessionCompleteSound } from '../utils/celebrationSounds'

/** Canvas コンフェッティ（緑ゴールドテーマ） */
function useConfettiCanvas(canvasRef) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx  = canvas.getContext('2d')
    const dpr  = window.devicePixelRatio || 1
    const W    = window.innerWidth
    const H    = window.innerHeight
    canvas.width  = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const cx = W / 2
    const cy = H * 0.44
    const COLORS = ['#22c55e','#86efac','#fbbf24','#34d399','#6ee7b7','#a3e635','#4ade80','#bbf7d0','#fde68a','#f9a8d4']

    const particles = Array.from({ length: 90 }, (_, i) => {
      const angle = Math.random() * Math.PI * 2
      const speed = 7 + Math.random() * 13
      return {
        x: cx + (Math.random() - 0.5) * 14,
        y: cy + (Math.random() - 0.5) * 14,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        gravity: 0.24 + Math.random() * 0.18,
        drag: 0.97,
        color: COLORS[i % COLORS.length],
        w: 5 + Math.random() * 10,
        h: 3 + Math.random() * 7,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.26,
        isCircle: Math.random() > 0.5,
        opacity: 1,
      }
    })

    let rafId
    const t0 = Date.now()

    function draw() {
      const elapsed = Date.now() - t0
      ctx.clearRect(0, 0, W, H)
      let alive = false

      for (const p of particles) {
        p.vx *= p.drag
        p.vy  = p.vy * p.drag + p.gravity
        p.x  += p.vx
        p.y  += p.vy
        p.rot += p.rotV
        p.opacity = Math.max(0, 1 - Math.max(0, elapsed - 600) / 1600)
        if (p.opacity < 0.02) continue
        alive = true

        ctx.save()
        ctx.globalAlpha = p.opacity
        ctx.shadowBlur  = 8
        ctx.shadowColor = p.color
        ctx.fillStyle   = p.color
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        if (p.isCircle) {
          ctx.beginPath()
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        }
        ctx.restore()
      }

      if (alive) rafId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(rafId)
  }, [canvasRef]) // eslint-disable-line
}

export default function SessionCompleteOverlay({ label = 'セッション完了！', onDone }) {
  const [visible, setVisible] = useState(true)
  const canvasRef = useRef(null)
  useConfettiCanvas(canvasRef)

  useEffect(() => {
    playSessionCompleteSound()
    const t1 = setTimeout(() => setVisible(false), 2000)
    const t2 = setTimeout(onDone, 2600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, []) // eslint-disable-line

  return (
    <>
      <style>{`
        @keyframes scCardIn {
          0%   { transform: scale(0.08) rotate(-12deg); opacity: 0; }
          55%  { transform: scale(1.13) rotate(2deg);   opacity: 1; }
          75%  { transform: scale(0.93) rotate(-1deg); }
          100% { transform: scale(1) rotate(0deg);      opacity: 1; }
        }
        @keyframes scParty {
          0%, 100% { transform: scale(1) rotate(-8deg) translateY(0px); }
          50%       { transform: scale(1.28) rotate(8deg) translateY(-8px); }
        }
        @keyframes scLabelIn {
          0%   { transform: scale(0.2) translateY(16px); opacity: 0; }
          65%  { transform: scale(1.18) translateY(-4px); opacity: 1; }
          100% { transform: scale(1) translateY(0);       opacity: 1; }
        }
        @keyframes scPulse {
          0%, 100% { box-shadow: 0 0 50px rgba(34,197,94,.6), 0 0 100px rgba(34,197,94,.25); }
          50%       { box-shadow: 0 0 80px rgba(34,197,94,.9), 0 0 160px rgba(34,197,94,.45); }
        }
        @keyframes scStar {
          0%   { opacity: 1; transform: translate(-50%,-50%) scale(0) rotate(0deg); }
          100% { opacity: 0; transform: translate(-50%,-50%) translate(var(--dx),var(--dy)) scale(1.2) rotate(var(--dr)); }
        }
      `}</style>

      {/* Confetti canvas */}
      <canvas
        ref={canvasRef}
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 52 }}
      />

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{
          backgroundColor: 'rgba(0,0,0,0.82)',
          pointerEvents: 'none',
          transition: 'opacity .5s',
          opacity: visible ? 1 : 0,
        }}
      >
        {/* 放射する星 */}
        {[0,1,2,3,4,5].map(i => {
          const a = (i / 6) * Math.PI * 2
          const d = 120
          return (
            <div key={i} style={{
              position: 'absolute', top: '50%', left: '50%', fontSize: 20,
              '--dx': `${Math.cos(a) * d}px`,
              '--dy': `${Math.sin(a) * d}px`,
              '--dr': `${i * 60}deg`,
              animation: `scStar .6s ease-out .06s both`,
            }}>🌟</div>
          )
        })}

        {/* カード */}
        <div style={{
          background: 'linear-gradient(150deg, #052e16 0%, #14532d 55%, #052e16 100%)',
          border: '4px solid #22c55e',
          borderRadius: 30,
          padding: '28px 52px',
          textAlign: 'center',
          animation: 'scCardIn .52s cubic-bezier(0.34,1.56,0.64,1) both, scPulse 1.4s ease-in-out .55s infinite',
          minWidth: 200,
        }}>
          <div style={{ fontSize: 68, lineHeight: 1, display: 'inline-block', animation: 'scParty .75s ease-in-out infinite' }}>
            🎉
          </div>
          <div style={{
            fontFamily: "'Bebas Neue', system-ui, sans-serif",
            fontSize: 36,
            lineHeight: 1.2,
            color: '#22c55e',
            textShadow: '0 0 20px rgba(34,197,94,.9), 0 0 50px rgba(34,197,94,.5)',
            animation: 'scLabelIn .48s cubic-bezier(0.34,1.56,0.64,1) .18s both',
            marginTop: 10,
            whiteSpace: 'pre-line',
            textAlign: 'center',
          }}>
            {label}
          </div>
        </div>
      </div>
    </>
  )
}
