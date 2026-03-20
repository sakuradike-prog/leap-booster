import { useEffect, useRef, useState } from 'react'
import { playStreakFanfare } from '../utils/celebrationSounds'

/** Canvas コンフェッティ（物理シミュ付き） */
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
    const COLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b','#cc5de8','#ff99cc','#00e5ff','#ffb347']

    const particles = Array.from({ length: 100 }, (_, i) => {
      const angle = Math.random() * Math.PI * 2
      const speed = 8 + Math.random() * 14
      return {
        x: cx + (Math.random() - 0.5) * 16,
        y: cy + (Math.random() - 0.5) * 16,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 5,
        gravity: 0.28 + Math.random() * 0.2,
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
        p.opacity = Math.max(0, 1 - Math.max(0, elapsed - 700) / 1500)
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

export default function StreakToast({ streak, onDone }) {
  const [visible, setVisible] = useState(true)
  const canvasRef = useRef(null)
  useConfettiCanvas(canvasRef)

  useEffect(() => {
    playStreakFanfare()
    const t1 = setTimeout(() => setVisible(false), 2300)
    const t2 = setTimeout(onDone, 2900)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, []) // eslint-disable-line

  return (
    <>
      <style>{`
        @keyframes stkCardIn {
          0%   { transform: scale(0.08) rotate(-12deg); opacity: 0; }
          55%  { transform: scale(1.14) rotate(2deg);  opacity: 1; }
          75%  { transform: scale(0.93) rotate(-1deg); }
          100% { transform: scale(1) rotate(0deg);     opacity: 1; }
        }
        @keyframes stkFlame {
          0%, 100% { transform: scale(1)    rotate(-8deg) translateY(0px);  }
          50%       { transform: scale(1.28) rotate(8deg)  translateY(-8px); }
        }
        @keyframes stkNumIn {
          0%   { transform: scale(0.2) translateY(18px); opacity: 0; }
          65%  { transform: scale(1.2) translateY(-4px); opacity: 1; }
          100% { transform: scale(1)   translateY(0);    opacity: 1; }
        }
        @keyframes stkPulse {
          0%, 100% { box-shadow: 0 0 50px rgba(255,149,0,.65), 0 0 100px rgba(255,149,0,.3); }
          50%       { box-shadow: 0 0 80px rgba(255,149,0,.95), 0 0 160px rgba(255,149,0,.55); }
        }
        @keyframes stkStar {
          0%   { opacity: 1; transform: translate(-50%,-50%) scale(0)   rotate(0deg); }
          100% { opacity: 0; transform: translate(-50%,-50%) translate(var(--dx),var(--dy)) scale(1.2) rotate(var(--dr)); }
        }
      `}</style>

      {/* Confetti canvas (z-52, above overlay) */}
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
        {/* Radiating stars */}
        {[0,1,2,3,4,5,6,7].map(i => {
          const a = (i / 8) * Math.PI * 2
          const d = 130
          return (
            <div key={i} style={{
              position: 'absolute', top: '50%', left: '50%', fontSize: 22,
              '--dx': `${Math.cos(a) * d}px`,
              '--dy': `${Math.sin(a) * d}px`,
              '--dr': `${i * 45}deg`,
              animation: `stkStar .65s ease-out .08s both`,
            }}>⭐</div>
          )
        })}

        {/* Card */}
        <div style={{
          background: 'linear-gradient(150deg, #1c0800 0%, #3b1400 55%, #1c0800 100%)',
          border: '4px solid #ff9500',
          borderRadius: 30,
          padding: '28px 56px',
          textAlign: 'center',
          animation: 'stkCardIn .52s cubic-bezier(0.34,1.56,0.64,1) both, stkPulse 1.4s ease-in-out .55s infinite',
          minWidth: 210,
        }}>
          {/* Flame */}
          <div style={{ fontSize: 72, lineHeight: 1, display: 'inline-block', animation: 'stkFlame .75s ease-in-out infinite' }}>
            🔥
          </div>

          {/* Number */}
          <div style={{
            fontFamily: "'Bebas Neue', system-ui, sans-serif",
            fontSize: 100,
            lineHeight: 1,
            color: '#ff9500',
            textShadow: '0 0 24px rgba(255,149,0,.95), 0 0 60px rgba(255,149,0,.5)',
            animation: 'stkNumIn .48s cubic-bezier(0.34,1.56,0.64,1) .18s both',
          }}>
            {streak}
          </div>

          <div style={{ color: '#ffc44d', fontSize: 26, fontWeight: 900, letterSpacing: '.04em', marginTop: -6 }}>
            日連続!
          </div>
          <div style={{ color: 'rgba(255,149,0,.55)', fontSize: 9, letterSpacing: '.2em', fontWeight: 700, marginTop: 8 }}>
            STREAK
          </div>
        </div>
      </div>
    </>
  )
}
