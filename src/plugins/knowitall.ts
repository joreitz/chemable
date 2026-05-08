// src/plugins/knowitall.ts
import { ChemablePlugin, ChemableContext } from "../plugin-api";
import { generateSmiles } from "../smiles";
import * as fs from 'fs';
import * as path from 'path';

/**
 * Type definition matching the PubChem JSON structure
 */
type PubChemData = { name?: string, xlogp?: number, iupac?: string };

let smilesDb: Record<string, PubChemData> = {};
let dbLoaded = false;
let panelElement: HTMLElement | null = null;

// FIX 1: Start OFF by default! Das Plugin ist beim App-Start unsichtbar.
let isActive = false; 

export const knowitallPlugin: ChemablePlugin = {
    id: "knowitall-live-viewer",
    name: "KnowItAll Live Database",
    version: "1.0",
    
    /**
     * Toggles the plugin state via the Extension menu
     */
    execute: async () => {
        isActive = !isActive;
        if (panelElement) {
            if (isActive) {
                panelElement.style.display = "block";
                setTimeout(() => panelElement!.style.opacity = "1", 10);
            } else {
                panelElement.style.opacity = "0";
                setTimeout(() => panelElement!.style.display = "none", 400);
            }
        }
        console.log(`KnowItAll is now: ${isActive ? "ON" : "OFF"}`);
    },
    
    /**
     * Initial setup: Creates UI and loads the large JSON database
     */
    onLoad: (context: ChemableContext) => {
        panelElement = document.createElement('div');
        panelElement.id = 'knowitall-glass-panel';
        panelElement.innerHTML = `
            <h3 id="knowitall-name">Loading PubChem Database...</h3>
            <p id="knowitall-details">Please wait patiently.</p>
        `;
        document.body.appendChild(panelElement);
        
        panelElement.style.opacity = "0";
        panelElement.style.display = "none";

        setTimeout(async () => {
            try {
                const dbPath = path.join(__dirname, '../../smiles_to_name.json'); 
                
                if (fs.existsSync(dbPath)) {
                    const rawData = await fs.promises.readFile(dbPath, 'utf8');
                    smilesDb = JSON.parse(rawData);
                    
                    document.getElementById('knowitall-name')!.innerText = "KnowItAll by Noah Neuheisel is Ready";
                    document.getElementById('knowitall-details')!.innerText = "Start drawing a molecule...";
                    dbLoaded = true;
                } else {
                    document.getElementById('knowitall-name')!.innerText = "Database Missing";
                    document.getElementById('knowitall-details')!.innerText = `File not found at: ${dbPath}`;
                }
            } catch (error) {
                console.error("Error loading KnowItAll DB:", error);
                document.getElementById('knowitall-name')!.innerText = "Loading Error!";
                document.getElementById('knowitall-details')!.innerText = "File too large or corrupted JSON.";
            }
        }, 300);
    },

    /**
     * Triggered on every state change (drawing, moving, etc.)
     */
    onStateChange: (context: ChemableContext) => {
        if (!panelElement || !isActive) return;

        const atoms = context.getAtoms();
        const bonds = context.getBonds();
        
        if (atoms.length === 0) {
            document.getElementById('knowitall-name')!.innerText = "KnowItAll Ready";
            document.getElementById('knowitall-details')!.innerText = "Start drawing a molecule...";
            panelElement.style.borderColor = "rgba(255, 255, 255, 0.5)";
            return;
        }

        if (!dbLoaded) {
            document.getElementById('knowitall-name')!.innerText = "Database not loaded";
            document.getElementById('knowitall-details')!.innerText = `SMILES: ${generateSmiles(atoms, bonds)}`;
            return;
        }

        const currentSmiles = generateSmiles(atoms, bonds);
        const match = smilesDb[currentSmiles];

        if (match) {
            const molName = match.name || "Unknown Compound";
            const iupac = match.iupac || "No IUPAC available";
            const xlogp = match.xlogp !== undefined ? `<span class="xlogp-badge">xLogP: ${match.xlogp}</span>` : "";
            
            document.getElementById('knowitall-name')!.innerHTML = molName;
            document.getElementById('knowitall-details')!.innerHTML = `IUPAC: ${iupac} ${xlogp}`;
            
            panelElement.style.borderColor = "rgba(0, 255, 100, 0.8)";
            setTimeout(() => { if(panelElement) panelElement.style.borderColor = "rgba(255, 255, 255, 0.5)"; }, 400);
        } else {
            document.getElementById('knowitall-name')!.innerText = "Unknown Structure";
            document.getElementById('knowitall-details')!.innerText = `SMILES: ${currentSmiles}`;
            panelElement.style.borderColor = "rgba(255, 255, 255, 0.5)";
        }
    },

    onUnload: () => {
        if (panelElement) {
            document.body.removeChild(panelElement);
            panelElement = null;
        }
        dbLoaded = false;
        smilesDb = {};
    }
};