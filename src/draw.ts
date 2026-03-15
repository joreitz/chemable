// src/draw.ts
import { verboose } from "./renderer";

import { Atom, Bond } from "./types";
import { getAtomLabel, hasValenceError } from "./chemistry";
import { calculateBondOffsetDirection } from "./geometry";

// Ersetzt _() und ^() durch echte Unicode-Sub/Superscripts!
export function parseChemicalRichText(text: string): string {
    const subMap: any = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉', '+': '₊', '-': '₋'};
    const supMap: any = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹', '+': '⁺', '-': '⁻'};

    let parsed = text.replace(/_\((.*?)\)/g, (_, p1) => p1.split('').map((c: string) => subMap[c]||c).join(''));
    parsed = parsed.replace(/\^\((.*?)\)/g, (_, p1) => p1.split('').map((c: string) => supMap[c]||c).join(''));
    return parsed;
}

// Prüft, ob sich die Bindung rechts vom Atom befindet (dann muss der Text umgedreht werden)
export function isBondOnRightSide(atom: Atom, bonds: Bond[], atoms: Atom[]): boolean {
    const connected = bonds.filter(b => b.id1 === atom.id || b.id2 === atom.id);
    if (connected.length === 1) { // Ergibt nur Sinn am Ende einer Kette
        const partnerId = connected[0].id1 === atom.id ? connected[0].id2 : connected[0].id1;
        const partner = atoms.find(a => a.id === partnerId);
        if (partner) {
            // Wenn dx > 0 ist, liegt der Partner rechts vom Atom
            return (partner.x - atom.x) > 0;
        }
    }
    return false;
}

export interface DrawOptions {
    showGrid: boolean;
    panX: number; 
    panY: number; 
    showValenceWarnings: boolean;
    selectedAtomId: number | null;
    dragStartAtom: Atom | null;
    mousePos: { x: number, y: number };
    lassoPath?: {x: number, y: number}[]; 
    selectedAtomIds?: Set<number>;
    fontSize?: number;        
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
    // 1. KANVAS ZURÜCKSETZEN (Fixt das unendliche Verschieben!)
    ctx.resetTransform(); 
    ctx.clearRect(0, 0, width, height);
    
    // 2. Zustand speichern & Kamera verschieben
    ctx.save(); 
    ctx.translate(options.panX, options.panY);

    // --- RASTER ---
    if (options.showGrid) {
        ctx.save();
        ctx.strokeStyle = "#e0e0e0"; 
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]); 
        const gridSize = 30; 
        
        const left = -options.panX;
        const right = width - options.panX;
        const top = -options.panY;
        const bottom = height - options.panY;

        ctx.beginPath();
        const startX = Math.floor(left / gridSize) * gridSize;
        for (let x = startX; x < right; x += gridSize) {
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
        }
        const startY = Math.floor(top / gridSize) * gridSize;
        for (let y = startY; y < bottom; y += gridSize) {
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
        }
        ctx.stroke();
        ctx.restore();
    }

    // --- BINDUNGEN ---
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#000000";
    ctx.setLineDash([]); // Fixt die grauen Bindungen!

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
            const ux = dx / len;
            const uy = dy / len;
            const padding = 3; 
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
        } else if (bond.type === 4) {
            // Zeichne den geraden Strich
            ctx.beginPath();
            ctx.moveTo(a1.x, a1.y);
            ctx.lineTo(a2.x, a2.y);
            ctx.stroke();

            // Zeichne die Pfeilspitze
            const headlen = 12;
            const angle = Math.atan2(dy, dx);
            ctx.beginPath();
            ctx.moveTo(a2.x, a2.y);
            ctx.lineTo(a2.x - headlen * Math.cos(angle - Math.PI / 6), a2.y - headlen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(a2.x, a2.y);
            ctx.lineTo(a2.x - headlen * Math.cos(angle + Math.PI / 6), a2.y - headlen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
            continue;
        } else if (bond.type === 5) {
            // Voll-Keil (Wedge)
            const halfWidth = 5; // Wie breit der Keil am Ende wird
            ctx.fillStyle = "#000000";
            ctx.beginPath();
            ctx.moveTo(a1.x, a1.y); // Startpunkt (spitz)
            ctx.lineTo(a2.x + nx * halfWidth, a2.y + ny * halfWidth); // Endpunkt (breit, eine Seite)
            ctx.lineTo(a2.x - nx * halfWidth, a2.y - ny * halfWidth); // Endpunkt (breit, andere Seite)
            ctx.closePath();
            ctx.fill();
        } else if (bond.type === 6) {
            // Gestrichelter Keil (Dash)
            const hashes = 8; // Anzahl der Striche
            ctx.beginPath();
            for (let i = 1; i <= hashes; i++) {
                const fraction = i / hashes;
                const cx = a1.x + dx * fraction;
                const cy = a1.y + dy * fraction;
                const halfWidth = 5 * fraction; // Wird nach hinten immer breiter
                
                ctx.moveTo(cx + nx * halfWidth, cy + ny * halfWidth);
                ctx.lineTo(cx - nx * halfWidth, cy - ny * halfWidth);
            }
            ctx.stroke();
    }

    // --- ATOME ---
    ctx.font = `bold ${options.fontSize || 16}px Arial`;; 
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const atom of atoms) {
        if (atom.element === "DUMMY") continue; // Dummy-Anker bleiben unsichtbar

        if (atom.element === "TEXT") {
            const txt = parseChemicalRichText(atom.customLabel || "");
            ctx.fillStyle = "#000000";
            ctx.fillText(txt, atom.x, atom.y);
            continue; // Kein weißer Hintergrund, keine Warnungen für Freitext!
        }
        // TEXT-LOGIK 
        const bondOnRight = isBondOnRightSide(atom, bonds, atoms);
        
        // Neu: Wir übergeben bondOnRight an getAtomLabel!
        let rawLabel = atom.customLabel || getAtomLabel(atom, bonds, bondOnRight);
        
        if (atom.customLabel && atom.autoFlip && bondOnRight) {
            rawLabel = rawLabel.split('').reverse().join('');
        }

        const label = parseChemicalRichText(rawLabel);
        const isHidden = label === "";
        const isError = options.showValenceWarnings && hasValenceError(atom, bonds);
        
        if (isHidden && !isError && options.selectedAtomId !== atom.id) continue;

        const textWidth = ctx.measureText(label || "C").width;
        const bgRadiusX = Math.max(12, textWidth / 2 + 4);
        const bgRadiusY = 13;

        // Zentrierung für ALLE Atome (Custom & Automatisch) 
        let shiftX = 0;
        
        // Wenn es ein Custom-Label mibt Ausrichtung ist, ODER ein automatisches Lael, das breiter ist als das nackte Element (z.B. CH₃)
        if ((atom.customLabel && atom.alignFirstLetter) || (!atom.customLabel && label.length > atom.element.length)) {
            
            // Wir messen exakt die Breite des Haupt-Elements (z.B. "O", "C" oder den 1. Buchstaben des Custom-Labels)
            const elementWidth = ctx.measureText(atom.customLabel ? label.charAt(0) : atom.element).width;
            const offset = (textWidth / 2) - (elementWidth / 2);
            
            if (bondOnRight) {
                shiftX = -offset; // Text nach links, damit das Haupt-Element rechts andockt
            } else {
                shiftX = offset;  // Text nach rechts, damit das Haupt-Element links andockt
            }
        }
        
        const drawX = atom.x + shiftX;

        if (isError) {
            ctx.beginPath();
            ctx.ellipse(drawX, atom.y, bgRadiusX + 4, bgRadiusY + 4, 0, 0, Math.PI * 2); 
            ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
            ctx.fill();
        }

        ctx.beginPath();
        ctx.ellipse(drawX, atom.y, bgRadiusX, bgRadiusY, 0, 0, Math.PI * 2); 
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();

        if (atom.radical) {
            ctx.beginPath();
            ctx.arc(drawX + bgRadiusX - 2, atom.y - bgRadiusY + 2, 2.5, 0, Math.PI * 2); 
            ctx.fillStyle = "#000000";
            ctx.fill();
        }

        if (!isHidden) {
            ctx.fillStyle = "#000000";
            ctx.fillText(label, drawX, atom.y); 
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

    // --- SELEKTION ---
    if (options.selectedAtomIds && options.selectedAtomIds.size > 0) {
        ctx.save(); 
        ctx.strokeStyle = "#0088ff"; 
        ctx.lineWidth = 3;
        for (const atom of atoms) {
            if (options.selectedAtomIds.has(atom.id)) {
                ctx.beginPath();
                ctx.arc(atom.x, atom.y, 16, 0, Math.PI * 2); 
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    // --- LASSO ---
    if (options.lassoPath && options.lassoPath.length > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(options.lassoPath[0].x, options.lassoPath[0].y);
        for (let i = 1; i < options.lassoPath.length; i++) {
            ctx.lineTo(options.lassoPath[i].x, options.lassoPath[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(0, 136, 255, 0.1)"; 
        ctx.fill();
        ctx.strokeStyle = "rgba(0, 136, 255, 0.8)";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]); 
        ctx.stroke();
        ctx.restore();
    }

    // 3. WICHTIG: Kompletten Zeichenzustand am Ende wieder aufräumen!
    ctx.restore();
}};