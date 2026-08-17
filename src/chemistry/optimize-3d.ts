// src/chemistry/optimize-3d.ts
import { state } from "../state";
import { Atom, Bond } from "../types";

export function applySdfToCanvas(sdfString: string, render: () => void, merge: boolean = false, keepHydrogens: boolean = false) {
    const oldAtoms = merge ? [...state.getAtoms()] : [];
    const oldBonds = merge ? [...state.getBonds()] : [];

    try {
        const lines = sdfString.split(/\r?\n/);
        
        let countsLineIdx = 3; // Standard-Annahme
        for (let i = 0; i < Math.min(10, lines.length); i++) {
            if (lines[i].includes("V2000") || lines[i].includes("V3000")) {
                countsLineIdx = i;
                break;
            }
        }

        const countsLine = lines[countsLineIdx];
        if (!countsLine || countsLine.length < 6) throw new Error("Ungültiges SDF Format: Counts-Line fehlt.");

        const numAtoms = parseInt(countsLine.substring(0, 3).trim());
        const numBonds = parseInt(countsLine.substring(3, 6).trim());

        if (isNaN(numAtoms) || isNaN(numBonds)) {
            throw new Error(`Atomanzahl konnte nicht ermittelt werden. (Gelesene Zeile: ${countsLine})`);
        }

        let tempAtoms: any[] = [];
        let tempBonds: any[] = [];
        const scale = 40; 

        let offset = countsLineIdx + 1; 
        let sumX = 0, sumY = 0, sumZ = 0;

        for (let i = 0; i < numAtoms; i++) {
            const line = lines[offset + i];
            const x = parseFloat(line.substring(0, 10).trim());
            const y = parseFloat(line.substring(10, 20).trim());
            const z = parseFloat(line.substring(20, 30).trim());
            const element = line.substring(31, 34).trim();
            
            sumX += x; sumY += y; sumZ += z;
            tempAtoms.push({ id: i + 1, element, x, y, z });
        }

        const avgX = sumX / numAtoms;
        const avgY = sumY / numAtoms;
        const avgZ = sumZ / numAtoms;

        offset += numAtoms;
        for (let i = 0; i < numBonds; i++) {
            const line = lines[offset + i];
            const id1 = parseInt(line.substring(0, 3).trim());
            const id2 = parseInt(line.substring(3, 6).trim());
            const type = parseInt(line.substring(6, 9).trim());
            tempBonds.push({ id1, id2, type });
        }

        const newAtoms: Atom[] = [];
        const newBonds: Bond[] = [];
        const idMap = new Map<number, number>();
        
        const canvas = document.getElementById('chemBoard') as HTMLCanvasElement;
        const centerX = canvas ? canvas.width / 2 : 400;
        const centerY = canvas ? canvas.height / 2 : 300;

        let shiftX = 0;
        if (merge && oldAtoms.length > 0) {
            let maxOldX = -Infinity;
            oldAtoms.forEach(a => { if (a.x > maxOldX) maxOldX = a.x; });
            shiftX = (maxOldX + 150) - centerX;
            if (shiftX < 0) shiftX = 0; 
        }

        for (const a of tempAtoms) {
            if (!keepHydrogens && a.element.toUpperCase() === 'H') continue;

            const newId = state.getNextId(); 
            idMap.set(a.id, newId);
           

            const locX = (a.x - avgX) * scale;
            const locY = (a.y - avgY) * scale;
            const locZ = (a.z - avgZ) * scale;

            const finalX = centerX + locX + shiftX;
            const finalY = centerY - locY;
            const finalZ = -locZ;

            newAtoms.push({
                id: newId,
                element: a.element,
                
                x: finalX,
                y: finalY, 
                z: finalZ,
                
                orig3DX: finalX,
                orig3DY: finalY,
                orig3DZ: finalZ
            });
        }

        for (const b of tempBonds) {
            const newId1 = idMap.get(b.id1);
            const newId2 = idMap.get(b.id2);
            if (newId1 && newId2) {
                newBonds.push({ id1: newId1, id2: newId2, type: b.type });
            }
        }

        state.saveState();
        state.setAtoms([...oldAtoms, ...newAtoms]);
        state.setBonds([...oldBonds, ...newBonds]);
        
        state.clearSelection(); 
        render();

    } catch (err) {
        console.error("Vollständiger Fehler:", err);
        alert("SDF Import fehlgeschlagen: " + (err as Error).message);
    }
}