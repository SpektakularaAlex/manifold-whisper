Fix these 4 specific issues in the Manifold cislunar visualization tool.

---

## FIX 1: Clicked orbit lights up (highlight on click)

In useScene.ts, when a trajectory mesh is clicked via the raycaster, immediately 
set that mesh's material emissive to a bright highlight color and restore the 
previous one after 200ms — then keep it at a "selected" brightness permanently 
until another orbit is clicked.

Specifically:
- Add a selectedMeshRef = useRef<THREE.Mesh | null>(null)
- On click: if selectedMeshRef.current exists, restore its material emissive to 
  0x000000 and opacity to its "resting" value
- Set the newly clicked mesh material: emissive = 0xffffff, emissiveIntensity = 0.4, 
  opacity = 1.0
- Store it in selectedMeshRef.current

This applies to ALL trajectory meshes — both individual orbits and family orbits.

---

## FIX 2: Multiple families simultaneously

Currently addFamilyOrbits() calls clearTrajectories() first, wiping everything. 
Remove that clearTrajectories() call from addFamilyOrbits().

Instead, add a new SceneAPI method:
  clearFamily(familyKey: string): void

This should only remove meshes from familyOrbitsRef.current where 
entry.familyKey === familyKey, dispose their geometry and material, and remove 
them from the scene. Leave all other trajectories untouched.

In FamilyBrowserPanel.tsx, when a family card is clicked:
- If that family is already displayed (track this with a Set<string> called 
  activeFamiliesRef), call scene.clearFamily(familyKey) and remove it from the set
  (toggle behavior — click again to hide)
- If not displayed, call scene.addFamilyOrbits(...) and add it to the set
- Style active family cards with a bright border (2px solid white) so the user 
  knows which are currently shown

---

## FIX 3: Mission planner works across different families

The problem is that handleOrbitClick in index.tsx only captures metadata from 
orbits in the currently active family. Fix this:

In useScene.ts, addFamilyOrbits must store full metadata on each mesh's 
userData object:
  mesh.userData = {
    familyKey,
    orbitIndex: index,
    jacobi,
    period_tu,
    period_days,
    stability,
    label,   // human-readable family label e.g. "L2 North Halo"
  }

Same for addTrajectory — store its metadata in mesh.userData too.

In the raycaster click handler, read metadata from intersected.userData instead 
of from a separate ref. This means no matter which family the orbit belongs to, 
clicking it always gives the correct familyKey and orbitIndex.

In TransferPlannerPanel, plannerDep and plannerArr should each store:
  { familyKey: string, orbitIndex: number, label: string, jacobi: number }

The POST to /transfer should send:
  {
    dep_family: plannerDep.familyKey,
    dep_index:  plannerDep.orbitIndex,
    arr_family: plannerArr.familyKey,
    arr_index:  plannerArr.orbitIndex,
  }

In backend/main.py, the /transfer endpoint must look up each orbit independently:
  dep_ics = ic_cache.IC_CACHE.get(dep_family_key)
  arr_ics = ic_cache.IC_CACHE.get(arr_family_key)
  dep_ic  = dep_ics[dep_index]
  arr_ic  = arr_ics[arr_index]

These can now be from completely different families.

---

## FIX 4: Jacobi slider and orbit count work via chat too

When the agent returns a show_family command (or show_orbit for a family), the 
frontend should render the same Jacobi slider and orbit count controls that appear 
in FamilyBrowserPanel — not just when clicking the panel.

Implement this by extracting the Jacobi slider + orbit count slider into a 
standalone reusable component: FamilyControlsBar.tsx

  Props:
    familyKey: string
    familyMeta: { jacobi_min, jacobi_max, label, color, count }
    scene: SceneAPI
    onShowManifolds: (familyKey, orbitIndex) => void

  Contains:
    - "Orbits: N" slider (5–50)
    - "Jacobi C: X.XXX" slider (min→max)  
    - Stability readout: "✓ Stable" or "⚠ Unstable (×N)"
    - Period readout in days
    - "Show Manifolds" button

In sceneCommands.ts, when executeCommand handles a show_family action:
1. Fetch GET /family/{familyKey}?n=20
2. Call scene.addFamilyOrbits(...)
3. Fetch GET /families to get the family metadata
4. Dispatch a custom event or call a callback to show FamilyControlsBar for 
   that family

In index.tsx, maintain state:
  const [activeControlFamily, setActiveControlFamily] = useState<string|null>(null)
  const [familiesMeta, setFamiliesMeta] = useState<Record<string,FamilyMeta>>({})

Render FamilyControlsBar at bottom-center of screen when activeControlFamily 
is set, same styling as TransferPlannerPanel (dark glass background, 
position: fixed).

Fetch /families once on mount and store in familiesMeta so it's always 
available for both the panel and the chat-triggered controls.

---

## VERIFICATION

1. Click any orbit → it should glow brighter immediately
2. Click L2 Halo family → 20 orbits appear. Click L1 Lyapunov family → 
   both families visible simultaneously. Click L2 Halo again → only Lyapunov remains.
3. With two families visible, enter mission planner, click one orbit from each 
   family → both slots fill correctly with different familyKey values → 
   Plan Transfer works
4. Type "show L2 halo family" in chat → orbits appear AND the Jacobi/orbit-count 
   sliders appear at bottom of screen, functional
