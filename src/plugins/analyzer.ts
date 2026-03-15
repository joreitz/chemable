// src/plugins/analyzer.ts
import { ChemablePlugin, ChemableContext } from "../plugin-api";
import { getImplicitHydrogens } from "../chemistry"; // Wir leihen uns die Logik aus dem Kern!

let pluginContext: ChemableContext | null = null;

// Die Standard-Atommassen (in g/mol)
const ATOMIC_MASSES: Record<string, number> = {
    "H": 1.008, "He": 4.0026, "Li": 6.94, "Be": 9.0122, "B": 10.81, "C": 12.011,
    "N": 14.007, "O": 15.999, "F": 18.998, "Ne": 20.180, "Na": 22.990, "Mg": 24.305,
    "Al": 26.982, "Si": 28.085, "P": 30.974, "S": 32.06, "Cl": 35.45, "K": 39.098,
    "Ar": 39.948, "Ca": 40.078, "Fe": 55.845, "Cu": 63.546, "Br": 79.904,
    "I": 126.90, "Au": 196.97
};

export const analyzerPlugin: ChemablePlugin = {
    id: "com.chemable.analyzer",
    name: "Molekül-Analyse",
    version: "1.1.0",
    
    onLoad: (context: ChemableContext) => {
        pluginContext = context;
        console.log(`[Plugin] Molekül-Analyse wurde geladen!`);
    },
    
    execute: async () => {
        if (!pluginContext) return;
        
        const atoms = pluginContext.getAtoms();
        const bonds = pluginContext.getBonds();
        
        // Echte chemische Atome filtern (Dummys und Text ignorieren)
        const realAtoms = atoms.filter(a => a.element !== "DUMMY" && a.element !== "TEXT");
        
        if (realAtoms.length === 0) {
            pluginContext.showMessage("Das Zeichenbrett enthält keine auswertbaren Atome!");
            return;
        }

        const counts: Record<string, number> = {};
        let totalMass = 0;

        // 1. Alle Atome durchgehen und zählen + Masse addieren
        realAtoms.forEach(a => {
            // Zähle das Haupt-Atom
            counts[a.element] = (counts[a.element] || 0) + 1;
            totalMass += ATOMIC_MASSES[a.element] || 0;

            // Zähle die unsichtbaren Wasserstoffe
            const hCount = getImplicitHydrogens(a, bonds);
            if (hCount > 0) {
                counts["H"] = (counts["H"] || 0) + hCount;
                totalMass += hCount * ATOMIC_MASSES["H"];
            }
        });

        // 2. Summenformel nach dem "Hill-System" formatieren (Erst C, dann H, dann alphabetisch)
        let formula = "";
        if (counts["C"]) {
            formula += `C${counts["C"] > 1 ? counts["C"] : ""}`;
            delete counts["C"]; // Aus dem Objekt nehmen, damit es später nicht nochmal kommt
        }
        if (counts["H"]) {
            formula += `H${counts["H"] > 1 ? counts["H"] : ""}`;
            delete counts["H"];
        }
        
        // Den Rest alphabetisch sortieren
        const remainingElements = Object.keys(counts).sort();
        for (const el of remainingElements) {
            formula += `${el}${counts[el] > 1 ? counts[el] : ""}`;
        }

        // 3. Ausgabe
        pluginContext.showMessage(
            `📊 Analyse-Ergebnis:\n\n` +
            `Exakte Summenformel:\n${formula}\n\n` +
            `Molare Masse:\n${totalMass.toFixed(3)} g/mol\n\n` +
            `Details:\n` +
            `- Eingezeichnete Atome: ${realAtoms.length}\n` +
            `- Bindungen: ${bonds.filter(b => b.type !== 4).length}`
        );
    },
    
    onUnload: () => {
        pluginContext = null;
    }
};