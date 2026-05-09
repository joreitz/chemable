// src/plugins/knowitall.ts
import { ChemablePlugin, ChemableContext } from "../plugin-api";
import { generateSmiles } from "../smiles";
import { applySdfToCanvas } from "../chemistry/optimize-3d";
import { generate2DModelPython } from "../chemistry/rdkit-3d";

const isElectron = typeof window !== 'undefined' && (window as any).process && (window as any).process.type;
const electron = isElectron ? (window as any).require('electron') : null;
const fs = isElectron ? (window as any).require('fs') : null;
const path = isElectron ? (window as any).require('path') : null;

let smilesDb: Record<string, any> = {};
let dbLoaded = false;
let isActive = false;

export const knowitallPlugin: ChemablePlugin = {
    id: "knowitall-pro",
    name: "KnowItAll By Noah Neuheisel",
    version: "2.0",

    onLoad: (ctx: ChemableContext) => {
        if (electron && fs && path) {
            try {
                const app = electron.remote ? electron.remote.app : electron.app;
                const userDataPath = app.getPath('userData');
                const dbPath = path.join(userDataPath, 'smiles_to_name.json');
                if (fs.existsSync(dbPath)) {
                    smilesDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                    dbLoaded = true;
                }
            } catch (e) { console.warn("Lokale JSON nicht gefunden."); }
        }
        bindUI(ctx);
    },

    execute: async () => {
        isActive = !isActive;
        const panel = document.getElementById('plugin-info-area');
        if (panel) panel.style.display = isActive ? "block" : "none";
        if (isActive) knowitallPlugin.onStateChange!(ctx_fallback); 
    },

    onStateChange: (ctx: ChemableContext) => {
        ctx_fallback = ctx; 
        if (!isActive) return;
        
        const panel = document.getElementById('plugin-info-area');
        if (!panel) return;

        const smiles = generateSmiles(ctx.getAtoms(), ctx.getBonds());
        if (!smiles) { panel.innerText = "Bereit..."; return; }

        const match = dbLoaded ? smilesDb[smiles] : null;
        if (match) {
            panel.innerHTML = `<strong>${match.name}</strong> <small>(${match.iupac || 'Match'})</small>`;
        } else {
            panel.innerText = `SMILES: ${smiles}`;
        }
    },

    onUnload: () => {}
};

let ctx_fallback: any = null;

function bindUI(ctx: ChemableContext) {
    // --- NEUE SMILES DIALOG LOGIK ---
    const smilesDialog = document.getElementById('smiles-dialog');
    const smilesInput = document.getElementById('smiles-input') as HTMLTextAreaElement;

    function openSmilesDialog() {
        if (!smilesDialog || !smilesInput) return;
        const currentSmiles = generateSmiles(ctx.getAtoms(), ctx.getBonds()) || "";
        smilesInput.value = currentSmiles;
        smilesDialog.style.display = 'block';
        smilesInput.focus();
        smilesInput.select(); 
    }

    document.getElementById('btn-export-smiles')?.addEventListener('click', openSmilesDialog);
    document.getElementById('btn-import-smiles')?.addEventListener('click', openSmilesDialog);
    document.getElementById('btn-smiles')?.addEventListener('click', openSmilesDialog); 

    // Fenster Aktionen
    document.getElementById('btn-dialog-close')?.addEventListener('click', () => {
        if (smilesDialog) smilesDialog.style.display = 'none';
    });

    document.getElementById('btn-dialog-import')?.addEventListener('click', () => {
        if (!smilesInput) return;
        const val = smilesInput.value.trim();
        const currentSmiles = generateSmiles(ctx.getAtoms(), ctx.getBonds()) || "";
        
        if (val && val !== currentSmiles) {
            importSmilesDirectly(val, ctx); // DIREKT importieren
        }
        if (smilesDialog) smilesDialog.style.display = 'none';
    });

    // --- KNOWITALL DIALOG ---
    const dialog = document.getElementById('knowitall-dialog');
    document.getElementById('btn-knowitall')?.addEventListener('click', () => {
        if (dialog) dialog.style.display = 'block';
    });
    document.getElementById('btn-close-knowitall')?.addEventListener('click', () => {
        if (dialog) dialog.style.display = 'none';
    });

    const searchBtn = document.getElementById('knowitall-search-btn');
    const input = document.getElementById('knowitall-input') as HTMLInputElement;
    const resultsList = document.getElementById('knowitall-results');

    searchBtn?.addEventListener('click', async () => {
        const query = input.value.trim();
        if (!query || !resultsList) return;

        resultsList.innerHTML = "<li style='padding:10px;'>Suche...</li>";

        try {
            const res = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(query)}/json`);
            const data = await res.json();
            const terms = data.dictionary_terms?.compound || [];
            resultsList.innerHTML = "";

            if (terms.length === 0) {
                resultsList.innerHTML = "<li style='padding:10px;'>Keine Treffer. Versuche direkten Import...</li>";
                await importByName(query, ctx);
                if (dialog) dialog.style.display = 'none';
                return;
            }

            terms.slice(0, 15).forEach((term: string) => {
                const li = document.createElement('li');
                li.innerText = term;
                li.style.padding = "8px 10px";
                li.style.borderBottom = "1px solid #f0f0f0";
                li.style.cursor = "pointer";
                li.onmouseenter = () => li.style.background = "#e6f2ff";
                li.onmouseleave = () => li.style.background = "transparent";

                li.addEventListener('click', () => {
                    importByName(term, ctx);
                    if (dialog) dialog.style.display = 'none';
                });
                resultsList.appendChild(li);
            });
        } catch (e) { resultsList.innerHTML = "<li style='color:red; padding:10px;'>Netzwerkfehler</li>"; }
    });

    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchBtn?.click();
    });
}

async function importSmilesDirectly(smiles: string, ctx: ChemableContext) {
    try {
        document.body.style.cursor = "wait";
        
        const sdf = await generate2DModelPython(smiles);
        
        applySdfToCanvas(sdf, ctx.render, true);
        
    } catch (e) {
        ctx.showMessage(`Fehler beim SMILES Import: ${(e as Error).message}`);
    } finally {
        document.body.style.cursor = "default";
    }
}

async function importByName(query: string, ctx: ChemableContext) {
    try {
        document.body.style.cursor = "wait";
        
        const res = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query)}/property/CanonicalSMILES/TXT`);
        if (!res.ok) throw new Error("Molekül auf PubChem nicht gefunden.");
        
        const smiles = (await res.text()).trim();
        
        await importSmilesDirectly(smiles, ctx);

    } catch (e) { 
        ctx.showMessage(`Fehler bei der Namenssuche: ${(e as Error).message}`); 
    } finally { 
        document.body.style.cursor = "default"; 
    }
}