
import { state } from "../state";
import { generateSmiles } from "../smiles";
import { applySdfToCanvas } from "../chemistry/optimize-3d";

export function initKnowItAll(render: () => void) {
    
    document.getElementById('btn-export-smiles')?.addEventListener('click', () => {
        const smiles = generateSmiles(state.getAtoms(), state.getBonds());
        if (smiles) {
            navigator.clipboard.writeText(smiles);
            alert("SMILES kopiert:\n\n" + smiles);
        } else {
            alert("Fehler: Konnte keinen SMILES generieren. Ist das Canvas leer?");
        }
    });

    document.getElementById('btn-import-smiles')?.addEventListener('click', () => {
        const smiles = prompt("Bitte SMILES-Code einfügen:");
        if (smiles) importIdentifierToCanvas(smiles, render);
    });

    const dialog = document.getElementById('knowitall-dialog');
    const input = document.getElementById('knowitall-input') as HTMLInputElement;
    const searchBtn = document.getElementById('knowitall-search-btn');
    const resultsList = document.getElementById('knowitall-results');

    document.getElementById('btn-knowitall')?.addEventListener('click', () => {
        if (dialog) dialog.style.display = 'block';
        input.focus();
    });

    document.getElementById('btn-close-knowitall')?.addEventListener('click', () => {
        if (dialog) dialog.style.display = 'none';
    });

    searchBtn?.addEventListener('click', async () => {
        const query = input.value.trim();
        if (!query || !resultsList) return;

        resultsList.innerHTML = "<li style='padding:10px; color:#666;'>Suche in PubChem läuft...</li>";

        try {
            const res = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(query)}/json`);
            const data = await res.json();
            const terms = data.dictionary_terms?.compound || [];

            resultsList.innerHTML = "";

            if (terms.length === 0) {
                resultsList.innerHTML = "<li style='padding:10px; color:#666;'>Keine direkten Treffer. Versuche exakten Import...</li>";
                await importIdentifierToCanvas(query, render);
                if (dialog) dialog.style.display = 'none';
                return;
            }

            terms.slice(0, 15).forEach((term: string) => {
                const li = document.createElement('li');
                li.innerText = term;
                li.style.padding = "8px 10px";
                li.style.borderBottom = "1px solid #f0f0f0";
                li.style.cursor = "pointer";
                li.style.transition = "background 0.2s";
                
                li.addEventListener('mouseenter', () => li.style.background = "#e6f2ff");
                li.addEventListener('mouseleave', () => li.style.background = "transparent");

                li.addEventListener('click', () => {
                    resultsList.innerHTML = `<li style='padding:10px; color:#007bff;'>Lade 2D-Struktur für "${term}"...</li>`;
                    importIdentifierToCanvas(term, render);
                    if (dialog) dialog.style.display = 'none';
                });
                
                resultsList.appendChild(li);
            });

        } catch (err) {
            resultsList.innerHTML = "<li style='padding:10px; color:red;'>Fehler bei der Verbindung zur Datenbank.</li>";
        }
    });


    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchBtn?.click();
    });
}


async function importIdentifierToCanvas(identifier: string, render: () => void) {
    try {
        document.body.style.cursor = "wait";
        
        const res = await fetch(`https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(identifier)}/sdf`);
        if (!res.ok) throw new Error("Struktur konnte in der Datenbank nicht gefunden werden.");
        
        const sdfString = await res.text();
        
        applySdfToCanvas(sdfString, render);
        
    } catch (err) {
        alert("Fehler beim Import: " + (err as Error).message);
    } finally {
        document.body.style.cursor = "default";
    }
}