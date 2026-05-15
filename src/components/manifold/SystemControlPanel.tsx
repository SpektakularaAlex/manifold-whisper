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

interface FamilyPickerProps {
  families: FamilyMeta[]
  selectedFamily: FamilyMeta | null
  selectedLibr: number | null
  selectedBranch: string | null
  onSelect: (family: FamilyMeta, libr: number | null, branch: string | null) => void
  direction?: "up" | "down"
}

export function FamilyPicker({
  families, selectedFamily, selectedLibr, selectedBranch, onSelect, direction = "up",
}: FamilyPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleOutside)
    return () => document.removeEventListener("mousedown", handleOutside)
  }, [])

  function getTriggerLabel(): string {
    if (!selectedFamily) return "Select family ▼"
    let label = selectedFamily.label
    if (selectedLibr != null) label += ` · L${selectedLibr}`
    if (selectedBranch) label += ` · ${selectedBranch}`
    return label + " ▼"
  }

  function getSubItems(fam: FamilyMeta): Array<{ libr: number | null; branch: string | null; label: string }> {
    if (fam.requiresLibr && fam.requiresBranch) {
      const items: Array<{ libr: number | null; branch: string | null; label: string }> = []
      for (const l of fam.availableLibr) {
        for (const b of fam.availableBranches) {
          items.push({ libr: l, branch: b, label: `L${l} · ${b === "N" ? "North" : "South"}` })
        }
      }
      return items
    }
    if (fam.requiresLibr) {
      return fam.availableLibr.map(l => ({ libr: l, branch: null, label: `L${l}` }))
    }
    if (fam.requiresBranch) {
      return fam.availableBranches.map(b => ({ libr: null, branch: b, label: b === "N" ? "North" : "South" }))
    }
    return []
  }

  return (
    <div ref={pickerRef} style={{ position: "relative", minWidth: 160 }}>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        style={{ ...SEL, width: "100%", textAlign: "left" as const, minWidth: 160 }}
      >
        {getTriggerLabel()}
      </button>
      {isOpen && (
        <div style={{
          position: "absolute",
          ...(direction === "up" ? { bottom: "100%", marginBottom: 2 } : { top: "100%", marginTop: 2 }),
          left: 0,
          zIndex: 200,
          background: "rgba(0,8,14,0.97)",
          border: "1px solid rgba(0,255,255,0.3)",
          maxHeight: 280,
          overflowY: "auto" as const,
          minWidth: 200,
        }}>
          {families.map(fam => {
            const isLeaf = !fam.requiresLibr && !fam.requiresBranch
            const expanded = expandedFamily === fam.id
            const famSelected = selectedFamily?.id === fam.id && isLeaf

            return (
              <div key={fam.id}>
                <div
                  onClick={() => {
                    if (isLeaf) { onSelect(fam, null, null); setIsOpen(false) }
                    else setExpandedFamily(expanded ? null : fam.id)
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = famSelected ? "rgba(0,255,255,0.15)" : "transparent" }}
                  style={{
                    padding: "6px 10px",
                    cursor: "pointer",
                    color: famSelected ? "var(--manifold-cyan)" : "#e0eeff",
                    background: famSelected ? "rgba(0,255,255,0.15)" : "transparent",
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {!isLeaf && <span style={{ fontSize: 8, opacity: 0.7 }}>{expanded ? "▼" : "▶"}</span>}
                  {fam.label}
                </div>
                {!isLeaf && expanded && getSubItems(fam).map(sub => {
                  const sel = selectedFamily?.id === fam.id && selectedLibr === sub.libr && selectedBranch === sub.branch
                  return (
                    <div
                      key={`${sub.libr}-${sub.branch}`}
                      onClick={() => { onSelect(fam, sub.libr, sub.branch); setIsOpen(false) }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)" }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = sel ? "rgba(0,255,255,0.15)" : "transparent" }}
                      style={{
                        padding: "5px 10px 5px 24px",
                        cursor: "pointer",
                        color: sel ? "var(--manifold-cyan)" : "rgba(200,220,240,0.7)",
                        background: sel ? "rgba(0,255,255,0.15)" : "transparent",
                        fontFamily: "'Space Mono', monospace",
                        fontSize: 10,
                      }}
                    >
                      {sub.label}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
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

  function handleFamilySelect(fam: FamilyMeta, libr: number | null, branch: string | null) {
    setSelectedFamily(fam)
    setSelectedLibr(libr)
    setSelectedBranch(branch)
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
          <FamilyPicker
            families={selectedSystem.families}
            selectedFamily={selectedFamily}
            selectedLibr={selectedLibr}
            selectedBranch={selectedBranch}
            onSelect={handleFamilySelect}
            direction="up"
          />
        </Ctrl>

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
