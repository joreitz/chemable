// src/plugins/knowitall.ts
import { ChemablePlugin, ChemableContext } from "../plugin-api";
import { generateSmiles } from "../smiles";
import { applySdfToCanvas } from "../chemistry/optimize-3d";

const isElectron = typeof window !== 'undefined' && (window as any).process && (window as any).process.type;
const electron = isElectron ? (window as any).require('electron') : null;
const fs = isElectron ? (window as any).require('fs') : null;
const path = isElectron ? (window as any).require('path') : null;

let smilesDb: Record<string, any> = {};
let dbLoaded = false;
let isActive = false;

export const knowitallPlugin: ChemablePlugin = {
    id: "knowitall-pro",
    name: "KnowItAll by Noah Neuheisel",
    version: "3.0",

    onLoad: (ctx: ChemableContext) => {
        if (electron && fs && path) {
            try {
                const app = electron.remote ? electron.remote.app : electron.app;
                const userDataPath = app.getPath('userData');
                const dbPath = path.join(userDataPath, 'smiles_to_name.json');
                if (fs.existsSync(dbPath)) {
                    smilesDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                    dbLoaded = true;
                    console.log("KnowItAll: Lokale Datenbank geladen.");
                }
            } catch (e) { console.warn("KnowItAll: Lokale JSON nicht gefunden."); }
        }

        let panel = document.getElementById('knowitall-glass-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'knowitall-glass-panel';
            panel.style.display = 'none';
            panel.innerHTML = `
                <h3 id="knowitall-name">Warte auf Struktur...</h3>
                <p id="knowitall-details">Zeichne ein Molekül</p>
            `;
            document.body.appendChild(panel);
        }

        bindUI(ctx);
    },

    execute: async () => {
        // Dieser Code wird ausgeführt, wenn man im Menü auf "Plugins -> KnowItAll Live" klickt
        isActive = !isActive;
        const panel = document.getElementById('knowitall-glass-panel');
        if (panel) panel.style.display = isActive ? "block" : "none";
        
        // Triggert ein sofortiges Update der Anzeige
        if (isActive) knowitallPlugin.onStateChange!(window as any); 
    },

    onStateChange: (ctx: ChemableContext) => {
        if (!isActive) return;
        const nameEl = document.getElementById('knowitall-name');
        const detailsEl = document.getElementById('knowitall-details');
        if (!nameEl || !detailsEl) return;

        // Hole SMILES vom Zeichenbrett
        const atoms = ctx ? ctx.getAtoms() : (window as any).state.getAtoms();
        const bonds = ctx ? ctx.getBonds() : (window as any).state.getBonds();
        const smiles = generateSmiles(atoms, bonds);

        if (!smiles) {
            nameEl.innerText = "Zeichenbrett leer";
            detailsEl.innerText = "Bitte zeichne ein Molekül...";
            return;
        }

        const match = dbLoaded ? smilesDb[smiles] : null;
        if (match) {
            nameEl.innerText = match.name || "Unbekannt";
            detailsEl.innerText = `IUPAC: ${match.iupac || 'N/A'}`;
        } else {
            nameEl.innerText = "Struktur unbekannt";
            detailsEl.innerText = `SMILES: ${smiles}`;
        }
    },

    onUnload: () => {}
};

function bindUI(ctx: ChemableContext) {
    // --- SMILES EXPORT ---
    document.getElementById('btn-export-smiles')?.addEventListener('click', () => {
        const smiles = generateSmiles(ctx.getAtoms(), ctx.getBonds());
        if (!smiles) {
            ctx.showMessage("Das Zeichenbrett ist leer. Es kann kein SMILES generiert werden.");
            return;
        }
        
        if (navigator.clipboard) {
            navigator.clipboard.writeText(smiles).then(() => {
                ctx.showMessage("SMILES has been copied to clipboard:\n" + smiles);
            }).catch(() => prompt("SMILES Code:", smiles));
        } else {
            prompt("SMILES Code:", smiles);
        }
    });

    document.getElementById('btn-smiles')?.addEventListener('click', () => {
        const currentSmiles = generateSmiles(ctx.getAtoms(), ctx.getBonds());
        const userInput = prompt("SMILES In-/Export:\nKopiere den Code oder füge einen neuen ein, um ihn zu laden:", currentSmiles);
        if (userInput && userInput.trim() !== currentSmiles && userInput.trim() !== "") {
            importByCactus(userInput.trim(), ctx);
        }
    });

    document.getElementById('btn-import-smiles')?.addEventListener('click', () => {
        const smiles = prompt("Please insert SMILES string:");
        if (smiles) importByCactus(smiles.trim(), ctx);
    });

    const dialog = document.getElementById('knowitall-dialog');
    document.getElementById('btn-knowitall')?.addEventListener('click', () => {
        if (dialog) dialog.style.display = 'block';
    });
    document.getElementById('btn-close-knowitall')?.addEventListener('click', () => {
        if (dialog) dialog.style.display = 'none';
    });

    // --- AUTOCOMPLETE SUCH-LOGIK ---
    const searchBtn = document.getElementById('knowitall-search-btn');
    const input = document.getElementById('knowitall-input') as HTMLInputElement;
    const resultsList = document.getElementById('knowitall-results');

    searchBtn?.addEventListener('click', async () => {
        const query = input.value.trim();
        if (!query || !resultsList) return;

        resultsList.innerHTML = "<li style='padding:10px; color:#666;'>Suche in Datenbank läuft...</li>";

        try {
            const res = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(query)}/json`);
            const data = await res.json();
            const terms = data.dictionary_terms?.compound || [];
            resultsList.innerHTML = "";

            if (terms.length === 0) {
                resultsList.innerHTML = "<li style='padding:10px; color:#666;'>No hits. Trying direct import</li>";
                await importByCactus(query, ctx);
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

                // Klick lädt die Struktur!
                li.addEventListener('click', () => {
                    resultsList.innerHTML = `<li style='padding:10px; color:#007bff;'>Loading 2D structure for "${term}"...</li>`;
                    importByCactus(term, ctx);
                    if (dialog) dialog.style.display = 'none';
                });
                resultsList.appendChild(li);
            });
        } catch (err) {
            resultsList.innerHTML = "<li style='padding:10px; color:red;'>Error with connecting to database.</li>";
        }
    });

    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchBtn?.click();
    });
}

// --- IMPORTER FUNKTION ---
async function importByCactus(query: string, ctx: ChemableContext) {
    try {
        document.body.style.cursor = "wait";
        // Cactus liefert perfekte 2D-Koordinaten!
        const res = await fetch(`https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(query)}/sdf`);
        if (!res.ok) throw new Error("Structure couldn't load.");
        const sdf = await res.text();
        
        applySdfToCanvas(sdf, ctx.render);
        ctx.saveState(); // Zustand speichern für Undo/Redo
        
    } catch (e) {
        ctx.showMessage(`Error while importing: ${(e as Error).message}\nSee if the SMILES string you provided is correct.`);
    } finally {
        document.body.style.cursor = "default";
    }
}