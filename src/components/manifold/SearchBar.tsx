import { useEffect, useMemo, useRef, useState } from "react"
import Fuse from "fuse.js"
import { Globe, Circle, BookOpen, Search } from "lucide-react"
import { buildSearchIndex, type SearchEntry } from "@/data/systems"

interface SearchBarProps {
  onSelectSystem: (systemId: string) => void
  onSelectFamily: (systemId: string, familyId: string) => void
  onShowConcept: (concept: SearchEntry) => void
}

const TYPE_BADGE: Record<SearchEntry["type"], string> = {
  system: "SYSTEM",
  family: "ORBIT",
  concept: "CONCEPT",
}

const TYPE_COLOR: Record<SearchEntry["type"], string> = {
  system: "#4488ff",
  family: "var(--manifold-cyan)",
  concept: "var(--manifold-orange)",
}

function EntryIcon({ type }: { type: SearchEntry["type"] }) {
  const style = { flexShrink: 0 as const, color: TYPE_COLOR[type] }
  if (type === "system") return <Globe size={13} style={style} />
  if (type === "family") return <Circle size={13} style={style} />
  return <BookOpen size={13} style={style} />
}

export function SearchBar({ onSelectSystem, onSelectFamily, onShowConcept }: SearchBarProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchEntry[]>([])
  const [highlighted, setHighlighted] = useState(-1)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fuse = useMemo(() => new Fuse(buildSearchIndex(), {
    keys: ["label", "description", "tags"],
    threshold: 0.35,
    includeScore: true,
    minMatchCharLength: 2,
  }), [])

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return }
    const hits = fuse.search(query).slice(0, 6).map(r => r.item)
    setResults(hits)
    setOpen(hits.length > 0)
    setHighlighted(-1)
  }, [query, fuse])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function handleSelect(entry: SearchEntry) {
    setQuery("")
    setOpen(false)
    setHighlighted(-1)
    if (entry.type === "system" && entry.systemId) onSelectSystem(entry.systemId)
    else if (entry.type === "family" && entry.systemId && entry.familyId) onSelectFamily(entry.systemId, entry.familyId)
    else if (entry.type === "concept") onShowConcept(entry)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || !results.length) return
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted(h => Math.min(h + 1, results.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
    else if (e.key === "Enter" && highlighted >= 0) { e.preventDefault(); handleSelect(results[highlighted]) }
    else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur() }
  }

  return (
    <div
      ref={containerRef}
      style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", width: 420, maxWidth: "calc(100vw - 48px)", zIndex: 20 }}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        background: "rgba(5,10,20,0.90)", border: "1px solid rgba(0,255,255,0.35)",
        backdropFilter: "blur(12px)", boxShadow: "0 0 12px rgba(0,255,255,0.10)",
      }}>
        <Search size={14} style={{ color: "rgba(0,255,255,0.4)", flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search orbits, systems, concepts..."
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: "var(--manifold-cyan)", fontFamily: "'Space Mono', monospace",
            fontSize: 12, caretColor: "var(--manifold-cyan)",
          }}
        />
        {query && (
          <button onClick={() => { setQuery(""); setOpen(false) }}
            style={{ background: "none", border: "none", color: "rgba(0,255,255,0.4)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>
            ×
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{
          marginTop: 2, background: "rgba(0,8,14,0.97)",
          border: "1px solid rgba(0,255,255,0.35)", backdropFilter: "blur(12px)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
        }}>
          {results.map((entry, i) => (
            <button
              key={`${entry.type}-${entry.systemId ?? ""}-${entry.familyId ?? ""}-${i}`}
              onClick={() => handleSelect(entry)}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8, width: "100%",
                padding: "8px 12px", background: highlighted === i ? "rgba(0,255,255,0.08)" : "transparent",
                border: "none", borderBottom: i < results.length - 1 ? "1px solid rgba(0,255,255,0.1)" : "none",
                cursor: "pointer", textAlign: "left",
              }}
            >
              <EntryIcon type={entry.type} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: "#e0eeff", fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700 }}>
                    {entry.label}
                  </span>
                  <span style={{
                    fontSize: 8, fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em",
                    color: TYPE_COLOR[entry.type], border: `1px solid ${TYPE_COLOR[entry.type]}`,
                    padding: "1px 4px", opacity: 0.8,
                  }}>
                    {TYPE_BADGE[entry.type]}
                  </span>
                </div>
                <div style={{
                  color: "rgba(160,190,210,0.7)", fontSize: 10,
                  fontFamily: "'Space Mono', monospace",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {entry.description.length > 60 ? entry.description.slice(0, 60) + "…" : entry.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
