export type DockZone = "free" | "top" | "left" | "right" | "bottom";

interface DockState { mode: DockZone; x: number; y: number; }
interface Entry { el: HTMLElement; st: DockState; }

const SNAP = 70;
const DRAG_START = 4;
const registry: Entry[] = [];

let ghost: HTMLDivElement | null = null;
function showGhost(zone: DockZone) {
    if (zone === "free") { ghost?.remove(); ghost = null; return; }
    if (!ghost) {
        ghost = document.createElement("div");
        ghost.style.cssText = "position:fixed;z-index:9998;pointer-events:none;background:rgba(79,70,229,0.16);" +
                              "border:2px solid rgba(79,70,229,0.55);border-radius:10px;transition:all 0.08s ease;";
        document.body.appendChild(ghost);
    }
    const g = ghost.style;
    if (zone === "top")    { g.inset = "0 0 auto 0"; g.height = "56px"; g.width = "auto"; }
    if (zone === "bottom") { g.inset = "auto 0 0 0"; g.height = "56px"; g.width = "auto"; }
    if (zone === "left")   { g.inset = "0 auto 0 0"; g.width = "210px"; g.height = "auto"; }
    if (zone === "right")  { g.inset = "0 0 0 auto"; g.width = "210px"; g.height = "auto"; }
}

function zoneAt(cx: number, cy: number, allowed: DockZone[]): DockZone {
    if (allowed.includes("top") && cy < SNAP) return "top";
    if (allowed.includes("bottom") && cy > window.innerHeight - SNAP) return "bottom";
    if (allowed.includes("left") && cx < SNAP) return "left";
    if (allowed.includes("right") && cx > window.innerWidth - SNAP) return "right";
    return "free";
}

// Seitenleisten weichen den oben/unten angedockten Leisten aus
function relayout() {
    const h = (m: DockZone) => {
        const e = registry.find(r => r.st.mode === m);
        return e ? e.el.offsetHeight : 0;
    };
    const topH = h("top"), botH = h("bottom");
    registry.forEach(r => {
        if (r.st.mode === "left" || r.st.mode === "right") {
            r.el.style.top = topH + "px";
            r.el.style.bottom = botH + "px";
        }
    });
}

export function makeDockable(
    el: HTMLElement,
    opts: { key: string; handle?: HTMLElement; zones?: DockZone[]; scroll?: boolean }
) {
    const zones = opts.zones ?? ["top", "left", "right"];
    const handle = opts.handle ?? el;
    const canScroll = opts.scroll !== false;      // false = Overlays (Dropdowns) dürfen herausragen
    const KEY = "chemable-dock-" + opts.key;

    let st: DockState = (() => {
        try { return { mode: "free", x: 20, y: 20, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
        catch { return { mode: "free", x: 20, y: 20 }; }
    })();

    const entry: Entry = { el, st };
    registry.push(entry);

    function apply() {
        entry.st = st;
        const s = el.style;
        s.position = "fixed";
        s.inset = ""; s.top = s.left = s.right = s.bottom = "";
        s.width = ""; s.height = "";
        s.overflowX = s.overflowY = "visible";
        s.flexWrap = ""; s.flexDirection = ""; s.alignItems = "";
        s.borderRadius = "";
        el.classList.remove("dock-top", "dock-bottom", "dock-left", "dock-right");

        if (st.mode === "free") {
            s.left = st.x + "px"; s.top = st.y + "px";
            s.zIndex = "12";
        } else {
            el.classList.add("dock-" + st.mode);
            s.zIndex = "20";
            if (st.mode === "top" || st.mode === "bottom") {
                s.left = "0"; s.right = "0";
                s[st.mode === "top" ? "top" : "bottom"] = "0";
                s.flexDirection = "row"; s.alignItems = "center"; s.flexWrap = "wrap";
                s.borderRadius = st.mode === "top" ? "0 0 12px 12px" : "12px 12px 0 0";
            } else {
                s.top = "0"; s.bottom = "0";
                s[st.mode === "left" ? "left" : "right"] = "0";
                s.flexDirection = "column"; s.alignItems = "stretch";
                if (canScroll) s.overflowY = "auto";
                s.borderRadius = st.mode === "left" ? "0 12px 12px 0" : "12px 0 0 12px";
            }
        }
        localStorage.setItem(KEY, JSON.stringify(st));
        requestAnimationFrame(relayout);          // Höhen erst nach dem Layout messbar
    }

    let down: { x: number; y: number; ox: number; oy: number } | null = null;
    let moved = false;

    handle.style.cursor = "grab";
    handle.addEventListener("pointerdown", (e: PointerEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest("input,select,textarea")) return;
        const r = el.getBoundingClientRect();
        down = { x: e.clientX, y: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top };
        moved = false;
    });

    window.addEventListener("pointermove", (e: PointerEvent) => {
        if (!down) return;
        if (!moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < DRAG_START) return;
        if (!moved) { moved = true; handle.style.cursor = "grabbing"; st.mode = "free"; apply(); }
        st.x = Math.max(0, Math.min(e.clientX - down.ox, window.innerWidth - 60));
        st.y = Math.max(0, Math.min(e.clientY - down.oy, window.innerHeight - 40));
        el.style.left = st.x + "px"; el.style.top = st.y + "px";
        showGhost(zoneAt(e.clientX, e.clientY, zones));
    });

    window.addEventListener("pointerup", (e: PointerEvent) => {
        if (!down) return;
        const wasDrag = moved;
        down = null; moved = false;
        handle.style.cursor = "grab";
        showGhost("free");
        if (!wasDrag) return;
        st.mode = zoneAt(e.clientX, e.clientY, zones);
        apply();
    });

    handle.addEventListener("dblclick", () => { st.mode = "free"; st.x = 20; st.y = 20; apply(); });
    window.addEventListener("resize", () => {
        if (st.mode === "free") {
            st.x = Math.min(st.x, window.innerWidth - 60);
            st.y = Math.min(st.y, window.innerHeight - 40);
            apply();
        } else relayout();
    });

    apply();
}