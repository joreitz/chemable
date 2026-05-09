// src/plugins/knowitall.ts
import { ChemablePlugin, ChemableContext } from "../plugin-api";
import { generateSmiles } from "../smiles";
import { applySdfToCanvas } from "../chemistry/optimize-3d";

// Sicherer Import für Electron-Module
const electron = (window as any).require ? (window as any).require('electron') : null;
const fs = (window as any).require ? (window as any).require('fs') : null;
const path = (window as any).require ? (window as any).require('path') : null;

let smilesDb: Record<string, any> = {};
let dbLoaded = false;
let isActive = false;

export const knowitallPlugin: ChemablePlugin = {
    id: "knowitall-pro",
    name: "KnowItAll Live",
    version: "2.5",

    onLoad: (ctx: ChemableContext) => {
        // 1. Lokale DB laden (Alter Code-Teil)
        if (electron && fs && path) {
            try {
                // Nutzt remote falls vorhanden, sonst fallback auf app
                const app = electron.remote ? electron.remote.app : electron.app;
                const userDataPath = app.getPath('userData');
                const dbPath = path.join(userDataPath, 'smiles_to_name.json');
                if (fs.existsSync(dbPath)) {
                    smilesDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                    dbLoaded = true;
                }
            } catch (e) { console.warn("KnowItAll: Lokale JSON nicht gefunden."); }
        }

        // 2. Toolbar & Such-UI Buttons binden
        bindUI(ctx);
    },

    execute: async () => {
        // Toggelt das Info-Panel unten
        isActive = !isActive;
        const panel = document.getElementById('plugin-info-area');
        if (panel) panel.style.display = isActive ? "block" : "none";
    },

    onStateChange: (ctx: ChemableContext) => {
        const panel = document.getElementById('plugin-info-area');
        if (!panel || !isActive) return;

        const smiles = generateSmiles(ctx.getAtoms(), ctx.getBonds());
        if (!smiles) { panel.innerText = "Bereit..."; return; }

        // Erst lokal suchen, dann SMILES anzeigen
        const match = dbLoaded ? smilesDb[smiles] : null;
        if (match) {
            panel.innerHTML = `<strong>${match.name}</strong> <small>(${match.iupac || 'SMILES Match'})</small>`;
        } else {
            panel.innerText = `SMILES: ${smiles}`;
        }
    },

    onUnload: () => {}
};

function bindUI(ctx: ChemableContext) {
    // Export SMILES
    document.getElementById('btn-export-smiles')?.addEventListener('click', () => {
        const smiles = generateSmiles(ctx.getAtoms(), ctx.getBonds());
        if (smiles) {
            navigator.clipboard.writeText(smiles);
            ctx.showMessage("SMILES kopiert!");
        }
    });

    // Import SMILES
    document.getElementById('btn-import-smiles')?.addEventListener('click', () => {
        const smiles = prompt("SMILES einfügen:");
        if (smiles) importByCactus(smiles, ctx);
    });

    // KnowItAll Suche (Dialog)
    const dialog = document.getElementById('knowitall-dialog');
    document.getElementById('btn-knowitall')?.addEventListener('click', () => {
        if (dialog) dialog.style.display = 'block';
    });
    document.getElementById('btn-close-knowitall')?.addEventListener('click', () => {
        if (dialog) dialog.style.display = 'none';
    });

    // Such-Logik im Fenster
    const searchBtn = document.getElementById('knowitall-search-btn');
    const input = document.getElementById('knowitall-input') as HTMLInputElement;
    searchBtn?.addEventListener('click', async () => {
        if (input.value) importByCactus(input.value, ctx);
    });
}

async function importByCactus(query: string, ctx: ChemableContext) {
    try {
        const res = await fetch(`https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(query)}/sdf`);
        if (!res.ok) throw new Error("Nicht gefunden");
        const sdf = await res.text();
        applySdfToCanvas(sdf, ctx.render);
    } catch (e) { ctx.showMessage("Fehler beim Abruf der Struktur."); }
}