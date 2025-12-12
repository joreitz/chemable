// src/draw.ts
import { Atom, Bond } from "./types";
import { getAtomLabel, hasValenceError } from "./chemistry";
import { calculateBondOffsetDirection } from "./geometry";

export interface DrawOptions {
    showValenceWarnings: boolean;
    selectedAtomId: number | null;
    dragStartAtom: Atom | null;
    mousePos: { x: number, y: number };
}

function getNeighborCoords(
    atomA: Atom, 
    atomB: Atom, 
    allBonds: Bond[], 
    allAtoms: Atom[]
): { x: number, y: number }[] {
    const neighbors: { x: number, y: number }[] = [];

    // Wir schauen uns jede Bindung an
    for (const bond of allBonds) {
        // Fall 1: Bindung hängt an Atom A
        if (bond.id1 === atomA.id || bond.id2 === atomA.id) {
            // Das "andere" Atom finden
            const otherId = (bond.id1 === atomA.id) ? bond.id2 : bond.id1;
            
            // Wichtig: Wir wollen nicht Atom B als Nachbar von A zählen 
            // (das ist ja die Bindung, die wir gerade zeichnen!)
            if (otherId !== atomB.id) {
                const neighbor = allAtoms.find(a => a.id === otherId);
                if (neighbor) neighbors.push({ x: neighbor.x, y: neighbor.y });
            }
        }

        // Fall 2: Bindung hängt an Atom B
        if (bond.id1 === atomB.id || bond.id2 === atomB.id) {
            const otherId = (bond.id1 === atomB.id) ? bond.id2 : bond.id1;
            
            // Wichtig: Nicht Atom A als Nachbar zählen
            if (otherId !== atomA.id) {
                const neighbor = allAtoms.find(a => a.id === otherId);
                if (neighbor) neighbors.push({ x: neighbor.x, y: neighbor.y });
            }
        }
    }

    return neighbors;
}

export function drawScene(
    ctx: CanvasRenderingContext2D, 
    width: number, 
    height: number,
    atoms: Atom[], 
    bonds: Bond[],
    options: DrawOptions
) {
    ctx.clearRect(0, 0, width, height);

    // --- BINDUNGEN ---
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#000000";

    for (const bond of bonds) {
        const a1 = atoms.find(a => a.id === bond.id1);
        const a2 = atoms.find(a => a.id === bond.id2);
        if (!a1 || !a2) continue;

        const dx = a2.x - a1.x;
        const dy = a2.y - a1.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len === 0) continue;

        const nx = -dy / len;
        const ny = dx / len;
        let offset = 5;

        if (bond.type === 2 || bond.type === 3) {
            const neighbors = getNeighborCoords(a1, a2, bonds, atoms);
            const direction = calculateBondOffsetDirection(a1, a2, neighbors);
            
            // Den Offset in die "richtige" Richtung drehen
            offset = offset * direction; 
        }

        ctx.beginPath();
        if (bond.type === 1) {
            ctx.moveTo(a1.x, a1.y);
            ctx.lineTo(a2.x, a2.y);
        } else if (bond.type === 2) {
            ctx.moveTo(a1.x, a1.y);
            ctx.lineTo(a2.x, a2.y);

            const shiftX = nx * offset;
            const shiftY = ny * offset;

            // Einheitsvektor der Bindung (um Start/Ende einzurücken)
            const ux = dx / len;
            const uy = dy / len;
            const padding = 3; // Verkürzung in Pixeln

            ctx.moveTo(a1.x + shiftX + ux * padding, a1.y + shiftY + uy * padding);
            ctx.lineTo(a2.x + shiftX - ux * padding, a2.y + shiftY - uy * padding);

        } else if (bond.type === 3) {
            ctx.moveTo(a1.x, a1.y);
            ctx.lineTo(a2.x, a2.y);
            
            const o = 4; 
            ctx.moveTo(a1.x + nx * o, a1.y + ny * o);
            ctx.lineTo(a2.x + nx * o, a2.y + ny * o);
            
            ctx.moveTo(a1.x - nx * o, a1.y - ny * o);
            ctx.lineTo(a2.x - nx * o, a2.y - ny * o);
        }
        ctx.stroke();
    }

    // --- ATOME ---
    ctx.font = "bold 16px Arial"; 
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const atom of atoms) {
        const label = getAtomLabel(atom, bonds);
        const isHidden = label === "";
        const isError = options.showValenceWarnings && hasValenceError(atom, bonds);
        
        if (isHidden && !isError && options.selectedAtomId !== atom.id) continue;

        // Warnung
        if (isError) {
            ctx.beginPath();
            ctx.arc(atom.x, atom.y, 18, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
            ctx.fill();
        }

        // Kreis (Hintergrund)
        ctx.beginPath();
        ctx.arc(atom.x, atom.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        // Text
        if (!isHidden) {
            ctx.fillStyle = "#000000";
            ctx.fillText(label, atom.x, atom.y);
        }
    }
    // --- VORSCHAU ---
    if (options.dragStartAtom) {
        ctx.beginPath();
        ctx.moveTo(options.dragStartAtom.x, options.dragStartAtom.y);
        ctx.lineTo(options.mousePos.x, options.mousePos.y);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#888888";
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}