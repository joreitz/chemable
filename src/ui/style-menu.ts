import { state } from "../state";
import { uiState } from "../core/ui-state";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

export function initStyleMenu(render: () => void) {
    const panel = $("style-panel");
    $("btn-style-menu")?.addEventListener("click", () => {
        if (!panel) return;
        const wasOpen = panel.style.display === "block";
        panel.style.display = wasOpen ? "none" : "block";
        if (!wasOpen) syncFields();
    });
    $("btn-close-style-panel")?.addEventListener("click", () => { if (panel) panel.style.display = "none"; });

    // Generischer Binder: liest IMMER aus dem Feld (nie aus einem Slider-Max gedeckelt)
    function bindNum(id: string, apply: (v: number) => void) {
        const el = $<HTMLInputElement>(id);
        el?.addEventListener("change", () => {
            const v = parseFloat(el.value);
            if (Number.isNaN(v)) return;
            state.saveState();
            apply(v);
            uiState.saveStyle();
            render();
        });
    }

    bindNum("style-font-size",    v => uiState.currentFontSize = v);
    bindNum("style-line-width",   v => uiState.globalLineWidth = v);
    bindNum("style-bond-spacing", v => uiState.globalBondSpacing = v);
    bindNum("style-atom-padding", v => uiState.atomPadding = v);

    // Bond length: reskaliert bestehende Geometrie um den Zentroid
    bindNum("style-bond-length", v => {
        const atoms = state.getAtoms();
        if (atoms.length > 0 && uiState.currentBondLength > 0) {
            const f = v / uiState.currentBondLength;
            let cx = 0, cy = 0;
            for (const a of atoms) { cx += a.x; cy += a.y; }
            cx /= atoms.length; cy /= atoms.length;   // BEIDE teilen — sonst Zentroid-Drift
            for (const a of atoms) { a.x = cx + (a.x - cx) * f; a.y = cy + (a.y - cy) * f; }
        }
        uiState.currentBondLength = v;
    });

    // Selektion → lokal, sonst global
    $<HTMLSelectElement>("style-font-family")?.addEventListener("change", function () {
        const sel = state.getSelectedAtomIds();
        state.saveState();
        if (sel.size > 0) state.getAtoms().forEach(a => { if (sel.has(a.id)) a.fontFamily = this.value; });
        else uiState.globalFontFamily = this.value;
        uiState.saveStyle(); render();
    });
    $<HTMLInputElement>("style-color")?.addEventListener("input", function () {
        const sel = state.getSelectedAtomIds();
        if (sel.size > 0) {
            state.getAtoms().forEach(a => { if (sel.has(a.id)) a.color = this.value; });
            state.getBonds().forEach(b => { if (sel.has(b.id1) && sel.has(b.id2)) b.color = this.value; });
        } else uiState.globalColor = this.value;
        uiState.saveStyle(); render();
    });

    $<HTMLInputElement>("style-export-transparent")?.addEventListener("change", function () {
        uiState.exportTransparent = this.checked; uiState.saveStyle();
    });

    $("btn-style-reset")?.addEventListener("click", () => {
        state.saveState();
        uiState.resetStyle();
        syncFields(); render();
    });

    function syncFields() {
        const set = (id: string, v: string | boolean) => {
            const el = $<HTMLInputElement>(id); if (!el) return;
            if (typeof v === "boolean") el.checked = v; else el.value = v;
        };
        set("style-font-size",    String(uiState.currentFontSize));
        set("style-line-width",   String(uiState.globalLineWidth));
        set("style-bond-length",  String(uiState.currentBondLength));
        set("style-bond-spacing", String(uiState.globalBondSpacing));
        set("style-atom-padding", String(uiState.atomPadding));
        set("style-font-family",  uiState.globalFontFamily);
        set("style-color",        uiState.globalColor);
        set("style-export-transparent", uiState.exportTransparent);
    }
    syncFields();
}