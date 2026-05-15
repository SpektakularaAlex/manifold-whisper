import { useEffect, useRef, useState } from "react"
import type { CRSystem, FamilyMeta } from "@/data/systems"

export interface VisualizeParams {
  systemId: string
  family: string
  libr: number | null
  branch: string | null
  index: number
  showManifolds: "none" | "unstable" | "stable" | "both"
}

interface SystemControlPanelProps {
  selectedSystem: CRSystem
  preSelectedFamilyId?: string | null
  onVisualize: (params: VisualizeParams) => void
  isLoading: boolean
  lastOrbitMeta?: { period?: number; jacobi?: number; totalMembers?: number } | null
}

const SEL: React.CSSProperties = {
  background: "rgba(0,8,14,0.9)",
  border: "1px solid rgba(0,255,255,0.3)",
  color: "#e0eeff",
  fontFamily: "'Space Mono', monospace",
  fontSize: 11,
  padding: "6px 8px",
  cursor: "pointer",
  outline: "none",
  appearance: "none" as const,
  WebkitAppearance: "none" as const,
  borderRadius: 0,
  minWidth: 0,
}

const LBL: React.CSSProperties = {
  color: "rgba(0,255,255,0.5)",
  fontSize: 9,
  letterSpacing: "0.15em",
  textTransform: "uppercase" as const,
  fontFamily: "'Space Mono', monospace",
  marginBottom: 3,
}

function Ctrl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={LBL}>{label}</div>
      {children}
    </div>
  )
}

export function SystemControlPanel({
  selectedSystem,
  preSelectedFamilyId,
  onVisualize,
  isLoading,
  lastOrbitMeta,
}: SystemControlPanelProps) {
  const [selectedFamily, setSelectedFamily] = useState<FamilyMeta | null>(null)
  const [selectedLibr, setSelectedLibr] = useState<number | null>(null)
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const [memberIndex, setMemberIndex] = useState(0)
  const [showManifolds, setShowManifolds] = useState<"none" | "unstable" | "stable" | "both">("none")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setSelectedFamily(null)
    setSelectedLibr(null)
    setSelectedBranch(null)
    setMemberIndex(0)
  }, [selectedSystem.id])

  useEffect(() => {
    if (!preSelectedFamilyId) return
    const fam = selectedSystem.families.find(f => f.id === preSelectedFamilyId) ?? null
    setSelectedFamily(fam)
    setSelectedLibr(null)
    setSelectedBranch(null)
    setMemberIndex(0)
  }, [preSelectedFamilyId, selectedSystem])

  function handleFamilyChange(famId: string) {
    const fam = selectedSystem.families.find(f => f.id === famId) ?? null
    setSelectedFamily(fam)
    setSelectedLibr(null)
    setSelectedBranch(null)
    setMemberIndex(0)
  }

  function buildParams(index: number, manifolds: typeof showManifolds): VisualizeParams {
    return {
      systemId: selectedSystem.id,
      family: selectedFamily!.id,
      libr: selectedLibr,
      branch: selectedBranch,
      index,
      showManifolds: manifolds,
    }
  }

  function handleSliderChange(val: number) {
    setMemberIndex(val)
    if (!canPreview) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onVisualize(buildParams(val, "none"))
    }, 300)
  }

  const canPreview =
    selectedFamily !== null &&
    (!selectedFamily.requiresLibr || selectedLibr !== null) &&
    (!selectedFamily.requiresBranch || selectedBranch !== null)

  const canVisualize = canPreview && !isLoading

  const maxMembers = (lastOrbitMeta?.totalMembers ?? 10) - 1

  return (
    <div
      className="manifold-panel manifold-fade-in manifold-delay-3"
      style={{
        position: "fixed",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        width: 720,
        maxWidth: "calc(100vw - 48px)",
        zIndex: 10,
        padding: "12px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <Ctrl label="Family">
          <select
            style={{ ...SEL, minWidth: 140 }}
            value={selectedFamily?.id ?? ""}
            onChange={e => handleFamilyChange(e.target.value)}
          >
            <option value="">— select family —</option>
            {selectedSystem.families.map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </Ctrl>

        {selectedFamily?.requiresLibr && (
          <Ctrl label="L-Point">
            <select
              style={{ ...SEL, minWidth: 70 }}
              value={selectedLibr ?? ""}
              onChange={e => setSelectedLibr(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">—</option>
              {selectedFamily.availableLibr.map(n => (
                <option key={n} value={n}>L{n}</option>
              ))}
            </select>
          </Ctrl>
        )}

        {selectedFamily?.requiresBranch && (
          <Ctrl label="Branch">
            <select
              style={{ ...SEL, minWidth: 70 }}
              value={selectedBranch ?? ""}
              onChange={e => setSelectedBranch(e.target.value || null)}
            >
              <option value="">—</option>
              {selectedFamily.availableBranches.map(b => (
                <option key={b} value={b}>{b === "N" ? "North" : "South"}</option>
              ))}
            </select>
          </Ctrl>
        )}

        <Ctrl label={`Member ${memberIndex + 1} / ${maxMembers + 1}`}>
          <input
            type="range"
            min={0}
            max={maxMembers}
            step={1}
            value={memberIndex}
            onChange={e => handleSliderChange(Number(e.target.value))}
            disabled={!canPreview}
            style={{ width: 90, accentColor: "var(--manifold-cyan)", cursor: canPreview ? "pointer" : "default", marginBottom: 1 }}
          />
        </Ctrl>

        <Ctrl label="Manifolds">
          <select
            style={{ ...SEL, minWidth: 100 }}
            value={showManifolds}
            onChange={e => setShowManifolds(e.target.value as typeof showManifolds)}
          >
            <option value="none">None</option>
            <option value="unstable">Unstable only</option>
            <option value="stable">Stable only</option>
            <option value="both">Both</option>
          </select>
        </Ctrl>

        <button
          onClick={() => canVisualize && onVisualize(buildParams(memberIndex, showManifolds))}
          disabled={!canVisualize}
          style={{
            background: canVisualize ? "rgba(0,255,255,0.12)" : "rgba(0,255,255,0.04)",
            border: `1px solid ${canVisualize ? "var(--manifold-cyan)" : "rgba(0,255,255,0.2)"}`,
            color: canVisualize ? "var(--manifold-cyan)" : "rgba(0,255,255,0.3)",
            fontFamily: "'Space Mono', monospace",
            fontSize: 13,
            padding: "6px 14px",
            cursor: canVisualize ? "pointer" : "not-allowed",
            transition: "all 0.2s",
            animation: isLoading ? "manifold-pulse-slow 1.4s ease-in-out infinite" : "none",
            alignSelf: "flex-end",
            letterSpacing: "0.05em",
          }}
        >
          {isLoading ? "..." : "Add ▶"}
        </button>
      </div>

      {lastOrbitMeta && (
        <div
          style={{
            marginTop: 8,
            fontSize: 10,
            color: "rgba(0,255,255,0.45)",
            fontFamily: "'Space Mono', monospace",
            letterSpacing: "0.05em",
            borderTop: "1px solid rgba(0,255,255,0.1)",
            paddingTop: 6,
          }}
        >
          {lastOrbitMeta.jacobi != null && `Jacobi C: ${lastOrbitMeta.jacobi.toFixed(4)}`}
          {lastOrbitMeta.period != null && `  ·  Period: ${lastOrbitMeta.period.toFixed(3)} TU`}
          {lastOrbitMeta.totalMembers != null && `  ·  Family size: ${lastOrbitMeta.totalMembers} members`}
        </div>
      )}
    </div>
  )
}
