import { useEffect, useRef, useState } from "react"
import type { CRSystem } from "@/data/systems"

interface SystemMiniMapProps {
  systems: CRSystem[]
  selectedSystem: CRSystem
  onSystemChange: (system: CRSystem) => void
}

const CX = 90
const CY = 90

function displayR(auApprox: number): number {
  return 15 + 65 * Math.log(auApprox + 1) / Math.log(11)
}

// [systemId, AU, angleDeg, orbitR]
const SYS_POS: Record<string, { au: number; angle: number }> = {
  "earth-moon":       { au: 1.0,   angle: 90  },
  "sun-earth":        { au: 1.0,   angle: 60  },
  "mars-phobos":      { au: 1.52,  angle: 30  },
  "jupiter-europa":   { au: 5.2,   angle: 150 },
  "saturn-enceladus": { au: 9.58,  angle: 210 },
  "saturn-titan":     { au: 9.58,  angle: 240 },
}

function toSVG(r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: CX + r * Math.cos(rad),
    y: CY - r * Math.sin(rad),
  }
}

export function SystemMiniMap({ systems, selectedSystem, onSystemChange }: SystemMiniMapProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [position, setPosition] = useState({ x: window.innerWidth - 220, y: 80 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 220, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 240, e.clientY - dragOffset.current.y)),
      })
    }
    const handleMouseUp = () => setIsDragging(false)
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging])

  // Deduplicate orbit rings by radius
  const rings = new Set<number>()
  for (const sys of systems) {
    const pos = SYS_POS[sys.id]
    if (pos) rings.add(Math.round(displayR(pos.au)))
  }

  return (
    <div
      ref={containerRef}
      className="manifold-panel"
      onMouseDown={(e) => {
        if ((e.target as Element).tagName === "circle") return
        setIsDragging(true)
        dragOffset.current = {
          x: e.clientX - position.x,
          y: e.clientY - position.y,
        }
        e.preventDefault()
      }}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: 210,
        zIndex: 15,
        padding: "10px 12px",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
      }}
    >
      <div style={{ fontSize: 8, color: "rgba(200,220,240,0.3)", letterSpacing: "0.12em", marginBottom: 4, fontFamily: "'Space Mono', monospace" }}>
        ⠿ DRAG
      </div>
      <div
        className="manifold-mono"
        style={{ color: "var(--manifold-cyan)", fontSize: 9, letterSpacing: "0.15em", marginBottom: 8, textTransform: "uppercase" }}
      >
        Systems
      </div>

      <svg viewBox="0 0 180 180" width={186} height={186} style={{ display: "block" }}>
        {/* Orbit rings */}
        {Array.from(rings).map(r => (
          <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={0.5} />
        ))}

        {/* Sun */}
        <circle cx={CX} cy={CY} r={6} fill="#FFD700" filter="url(#glow)" />

        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="dotglow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* System dots */}
        {systems.map(sys => {
          const pos = SYS_POS[sys.id]
          if (!pos) return null
          const r = displayR(pos.au)
          const { x, y } = toSVG(r, pos.angle)
          const isSelected = sys.id === selectedSystem.id
          const isHov = sys.id === hovered

          return (
            <g key={sys.id} onClick={() => onSystemChange(sys)} style={{ cursor: "pointer" }}
              onMouseEnter={() => setHovered(sys.id)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Pulsing ring for selected */}
              {isSelected && (
                <circle cx={x} cy={y} r={9}
                  fill="none"
                  stroke={sys.primaryColor}
                  strokeWidth={1.5}
                  opacity={0.7}
                  style={{ animation: "manifold-pulse-slow 1.8s ease-in-out infinite" }}
                />
              )}
              {/* System dot */}
              <circle cx={x} cy={y} r={isHov ? 7 : 5.5}
                fill={sys.primaryColor}
                filter="url(#dotglow)"
                style={{ transition: "r 0.15s" }}
              />
              {/* Label */}
              <text
                x={x}
                y={y + 13}
                textAnchor="middle"
                fontSize={6}
                fontFamily="'Space Mono', monospace"
                fill={isSelected ? "var(--manifold-cyan)" : "rgba(200,220,240,0.55)"}
              >
                {sys.secondaryName}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
