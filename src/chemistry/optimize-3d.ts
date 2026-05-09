import { state } from "../state";
import { Atom, Bond } from "../types";

export function applySdfToCanvas(sdfString: string, render: () => void) {
    const oldAtoms = state.getAtoms();

    try {
        const lines = sdfString.split('\n');
        const countsLine = lines[3];
        if (!countsLine) throw new Error("Ungültiges SDF Format");

        const numAtoms = parseInt(countsLine.substring(0, 3).trim());
        const numBonds = parseInt(countsLine.substring(3, 6).trim());

        const tempAtoms: any[] = [];
        const tempBonds: any[] = [];
        const scale = 40; 

        let offset = 4;
        for (let i = 0; i < numAtoms; i++) {
            const line = lines[offset + i];
            const x = parseFloat(line.substring(0, 10).trim());
            const y = parseFloat(line.substring(10, 20).trim());
            const z = parseFloat(line.substring(20, 30).trim());
            const element = line.substring(31, 34).trim();
            tempAtoms.push({ id: i + 1, element, x, y, z });
        }

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
        let newIdCounter = 1;

        for (const a of tempAtoms) {
            if (a.element.toUpperCase() === 'H') continue; 
            newAtoms.push({
                id: newIdCounter, element: a.element,
                x: a.x * scale, y: -a.y * scale, z: -a.z * scale,
                orig3DX: a.x * scale, orig3DY: -a.y * scale, orig3DZ: -a.z * scale
            });
            idMap.set(a.id, newIdCounter); 
            newIdCounter++;
        }

        for (const b of tempBonds) {
            const newId1 = idMap.get(b.id1);
            const newId2 = idMap.get(b.id2);
            if (newId1 && newId2) newBonds.push({ id1: newId1, id2: newId2, type: b.type });
        }

        let targetCx = 0, targetCy = 0;
        if (oldAtoms.length > 0) {
            oldAtoms.forEach(a => { targetCx += a.x; targetCy += a.y; });
            targetCx /= oldAtoms.length; targetCy /= oldAtoms.length;
        } else {
            const canvas = document.getElementById('chemBoard') as HTMLCanvasElement;
            targetCx = canvas ? canvas.width / 2 : 400;
            targetCy = canvas ? canvas.height / 2 : 300;
        }

        let newCx = 0, newCy = 0;
        if (newAtoms.length > 0) {
            newAtoms.forEach(a => { newCx += a.x; newCy += a.y; });
            newCx /= newAtoms.length; newCy /= newAtoms.length;
            const dx = targetCx - newCx; const dy = targetCy - newCy;
            newAtoms.forEach(a => {
                a.x += dx; a.y += dy;
                a.orig3DX! += dx; a.orig3DY! += dy;
            });
        }

        state.saveState();
        state.setAtoms(newAtoms);
        state.setBonds(newBonds);
        render();

    } catch (err) {
        console.error(err);
        alert("Error with the structure: " + (err as Error).message);
    }
}