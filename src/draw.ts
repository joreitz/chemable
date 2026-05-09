// src/draw.ts
import { verboose } from "./renderer";

import { Atom, Bond } from "./types";
import { getAtomLabel, hasValenceError } from "./chemistry";
import { calculateBondOffsetDirection } from "./geometry";

export function parseChemicalRichText(text: string): string {
    const subMap: any = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'};
    const supMap: any = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹', '+': '⁺', '-': '⁻'};

    let parsed = text;

    parsed = parsed.replace(/_\((.*?)\)/g, (_, p1) => p1.split('').map((c: string) => subMap[c]||c).join(''));
    parsed = parsed.replace(/\^\((.*?)\)/g, (_, p1) => p1.split('').map((c: string) => supMap[c]||c).join(''));
    
    parsed = parsed.replace(/([A-Za-z\]\)])(\d+)/g, (_, char, digits) => {
        return char + digits.split('').map((d: string) => subMap[d]).join('');
    });

    parsed = parsed.replace(/(\d*)([+-])$/, (_, digits, sign) => {
        return digits.split('').map((d: string) => supMap[d]||d).join('') + supMap[sign];
    });

    return parsed;
}

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
    globalBondSpacing: number;
    globalFontFamily: string;
    globalColor: string;        
    showImplicitHydrogens: boolean;
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
    ctx.resetTransform(); 
    ctx.clearRect(0, 0, width, height);
    
    ctx.save(); 
    ctx.translate(options.panX, options.panY);

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
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]); 

    //Painter's Algorithm
    const sortedBonds = [...bonds].sort((a, b) => {
        const a1 = atoms.find(x => x.id === a.id1);
        const a2 = atoms.find(x => x.id === a.id2);
        const b1 = atoms.find(x => x.id === b.id1);
        const b2 = atoms.find(x => x.id === b.id2);
        
        const zA = ((a1?.z || 0) + (a2?.z || 0)) / 2;
        const zB = ((b1?.z || 0) + (b2?.z || 0)) / 2;
        return zA - zB; // Was weiter hinten ist (kleineres Z), wird zuerst gezeichnet
    });

    for (const bond of sortedBonds) {
        const a1 = atoms.find(a => a.id === bond.id1);
        const a2 = atoms.find(a => a.id === bond.id2);
        if (!a1 || !a2) continue;

        const dx = a2.x - a1.x;
        const dy = a2.y - a1.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len === 0) continue;

        const nx = -dy / len;
        const ny = dx / len;

        // --- 3D TIEFEN-EFFEKTE FÜR BINDUNGEN ---
        const z1 = a1.z || 0;
        const z2 = a2.z || 0;
        const avgZ = (z1 + z2) / 2;
        
        ctx.globalAlpha = 1.0; 

        ctx.lineWidth = Math.max(0.5, 2 + (avgZ * 0.06)); 

        let renderType = bond.type;

        ctx.strokeStyle = bond.color || options.globalColor;
        let offset = bond.spacing || options.globalBondSpacing;

        if (renderType === 2 || renderType === 3) {
            const direction = calculateBondOffsetDirection(a1, a2, bonds, atoms);
            offset = offset * direction; 
        }

        ctx.beginPath();
        if (renderType === 1) {
            ctx.moveTo(a1.x, a1.y);
            ctx.lineTo(a2.x, a2.y);
            ctx.stroke(); 
        } else if (renderType === 2) {
            const a1Connections = bonds.filter(b => b.id1 === a1.id || b.id2 === a1.id).length;
            const a2Connections = bonds.filter(b => b.id1 === a2.id || b.id2 === a2.id).length;
            const isTerminal = a1Connections === 1 || a2Connections === 1;

            if (isTerminal) {
                const halfOffset = offset / 2;
                ctx.moveTo(a1.x + nx * halfOffset, a1.y + ny * halfOffset);
                ctx.lineTo(a2.x + nx * halfOffset, a2.y + ny * halfOffset);
                ctx.moveTo(a1.x - nx * halfOffset, a1.y - ny * halfOffset);
                ctx.lineTo(a2.x - nx * halfOffset, a2.y - ny * halfOffset);
                ctx.stroke();
            } else {
                ctx.moveTo(a1.x, a1.y);
                ctx.lineTo(a2.x, a2.y);
                const shiftX = nx * offset;
                const shiftY = ny * offset;
                const ux = dx / len;
                const uy = dy / len;
                const padding = 3; 
                ctx.moveTo(a1.x + shiftX + ux * padding, a1.y + shiftY + uy * padding);
                ctx.lineTo(a2.x + shiftX - ux * padding, a2.y + shiftY - uy * padding);
                ctx.stroke(); 
            }
        } else if (renderType === 3) {
            ctx.moveTo(a1.x, a1.y);
            ctx.lineTo(a2.x, a2.y);
            const o = 4; 
            ctx.moveTo(a1.x + nx * o, a1.y + ny * o);
            ctx.lineTo(a2.x + nx * o, a2.y + ny * o);
            ctx.moveTo(a1.x - nx * o, a1.y - ny * o);
            ctx.lineTo(a2.x - nx * o, a2.y - ny * o);
            ctx.stroke(); 
        } else if (renderType === 4) {
            ctx.moveTo(a1.x, a1.y);
            ctx.lineTo(a2.x, a2.y);
            ctx.stroke();
            ctx.fillStyle = bond.color || options.globalColor; 
            const headlen = 12;
            const angle = Math.atan2(dy, dx);
            ctx.beginPath();
            ctx.moveTo(a2.x, a2.y);
            ctx.lineTo(a2.x - headlen * Math.cos(angle - Math.PI / 6), a2.y - headlen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(a2.x, a2.y);
            ctx.lineTo(a2.x - headlen * Math.cos(angle + Math.PI / 6), a2.y - headlen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
        } else if (renderType === 5) {
            const startWidth = 1.0; 
            const endWidth = Math.max(3.0, 5.0 + (avgZ * 0.05)); // Keil wird vorne etwas breiter
            const extension = 2.0; 
            const ux = dx / len;
            const uy = dy / len;
            const ex = a2.x + ux * extension;
            const ey = a2.y + uy * extension;

            ctx.fillStyle = bond.color || options.globalColor;
            ctx.lineJoin = "round"; 
            ctx.beginPath();
            ctx.moveTo(a1.x + nx * startWidth, a1.y + ny * startWidth);
            ctx.lineTo(a1.x - nx * startWidth, a1.y - ny * startWidth);
            ctx.lineTo(ex - nx * endWidth, ey - ny * endWidth);
            ctx.lineTo(ex + nx * endWidth, ey + ny * endWidth);
            ctx.closePath();
            ctx.fill();
        } else if (renderType === 6) {
            const hashes = 6; 
            const startGap = 4.0; 
            const endGap = 2.0;   
            const effectiveLen = len - startGap - endGap;
            ctx.fillStyle = bond.color || options.globalColor; 
            ctx.beginPath();
            for (let i = 0; i < hashes; i++) {
                const step = startGap + (i / (hashes - 1)) * effectiveLen;
                const fraction = step / len;
                const cx = a1.x + dx * fraction;
                const cy = a1.y + dy * fraction;
                const currentWidth = 1.0 + (4.0 * fraction); 
                ctx.moveTo(cx + nx * currentWidth, cy + ny * currentWidth);
                ctx.lineTo(cx - nx * currentWidth, cy - ny * currentWidth);
            }
            ctx.stroke();
        }
    }

    // --- ATOME ---
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const sortedAtoms = [...atoms].sort((a, b) => (a.z || 0) - (b.z || 0));

    for (const atom of sortedAtoms) {
        if (atom.element.toUpperCase() === "DUMMY") continue; 
        
        //  3D TIEFEN-EFFEKT FÜR ATOME
        const z = atom.z || 0;
        ctx.globalAlpha = 1.0;
        
        const scale = Math.max(0.7, Math.min(1.3, 1 + (z * 0.005))); // Skalierung
        const currentFontSize = (options.fontSize || 16) * scale;
        
        const fontToUse = atom.fontFamily || options.globalFontFamily;
        ctx.font = `${currentFontSize}px ${fontToUse}`;
        
        let label = "";
        let bondOnRight = false;
        const isTextElement = (atom.element === "TEXT");

        if (isTextElement) {
            label = parseChemicalRichText(atom.customLabel || "");
        } else {
            bondOnRight = isBondOnRightSide(atom, bonds, atoms);
            let rawLabel = atom.customLabel || getAtomLabel(atom, bonds, bondOnRight, options.showImplicitHydrogens);
            if (atom.customLabel && atom.autoFlip && bondOnRight) {
                rawLabel = rawLabel.split('').reverse().join('');
            }
            label = parseChemicalRichText(rawLabel);
        }

        const isHidden = label === "";
        const isError = options.showValenceWarnings && hasValenceError(atom, bonds);
        
        const skipCompletely = isHidden && !isError && options.selectedAtomId !== atom.id && !atom.charge && !atom.radical;
        if (skipCompletely) continue;

        const textWidth = ctx.measureText(label || "C").width;
        
        const bgRadiusX = Math.max(currentFontSize * 0.75, (textWidth / 2) + (currentFontSize * 0.25));
        const bgRadiusY = currentFontSize * 0.85; 
        
        let shiftX = 0;
        if (!isHidden && ((atom.customLabel && atom.alignFirstLetter) || (!atom.customLabel && label.length > atom.element.length))) {
            const elementWidth = ctx.measureText(atom.customLabel ? label.charAt(0) : (isTextElement ? label.charAt(0) : atom.element)).width;
            const offset = (textWidth / 2) - (elementWidth / 2);
            shiftX = bondOnRight ? -offset : offset;
        }
        
        const drawX = atom.x + shiftX;

        if (!isTextElement || isError) {
            if (isError) {
                ctx.beginPath();
                ctx.ellipse(drawX, atom.y, bgRadiusX + (currentFontSize * 0.2), bgRadiusY + (currentFontSize * 0.2), 0, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
                ctx.fill();
            }
            if (!isHidden) {
                ctx.beginPath();
                ctx.ellipse(drawX, atom.y, bgRadiusX, bgRadiusY, 0, 0, Math.PI * 2);
                ctx.fillStyle = "#FFFFFF";
                ctx.fill();
            }
        }

        // Atom-Label zeichnen
        if (!isHidden) {
            ctx.fillStyle = atom.color || options.globalColor;
            ctx.fillText(label, drawX, atom.y);
        }

        if (atom.charge) {
            const isPositive = atom.charge > 0;
            const absCharge = Math.abs(atom.charge);
            const signStr = isPositive ? "+" : "−";
            
            let angle = atom.chargeAngle;
            if (angle === undefined) {
                angle = isHidden ? -Math.PI / 2 : (bondOnRight ? -Math.PI * 0.8 : -Math.PI * 0.2);
            }

            const orbitPadding = currentFontSize * 0.25;
            const badgeX = drawX + Math.cos(angle) * (bgRadiusX + orbitPadding);
            const badgeY = atom.y + Math.sin(angle) * (bgRadiusY + orbitPadding);
            
            const badgeRadius = Math.max(7 * scale, currentFontSize * 0.42);
            
            ctx.beginPath();
            ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
            ctx.fillStyle = "#FFFFFF";
            ctx.fill();
            ctx.lineWidth = Math.max(1, 1.5 * scale);
            ctx.strokeStyle = atom.color || options.globalColor;
            ctx.stroke();

            ctx.fillStyle = atom.color || options.globalColor;
            ctx.font = `bold ${Math.max(10 * scale, currentFontSize * 0.6)}px Arial`;
            ctx.fillText(signStr, badgeX, badgeY + (1 * scale)); // +1px bleibt für die vertikale optische Mitte bei Arial

            if (absCharge > 1) {
                ctx.textAlign = "right";
                ctx.font = `bold ${Math.max(12 * scale, currentFontSize * 0.7)}px Arial`;
                // Abstand zur Zahl ebenfalls proportional (10% der Schriftgröße)
                ctx.fillText(absCharge.toString(), badgeX - badgeRadius - (currentFontSize * 0.1), badgeY + (1 * scale));
            }
            ctx.textAlign = "center"; // Zurücksetzen für das nächste Atom
        }

        if (atom.radical) {
            let angle = atom.chargeAngle;
            if (angle === undefined) {
                angle = isHidden ? -Math.PI / 2 : (bondOnRight ? -Math.PI * 0.8 : -Math.PI * 0.2);
            }
            
            const orbitPadding = currentFontSize * 0.25;
            const chargeOffset = atom.charge ? (currentFontSize * 0.85) : 0;
            
            const distRadiusX = bgRadiusX + orbitPadding + chargeOffset;
            const distRadiusY = bgRadiusY + orbitPadding + chargeOffset;
            const radX = drawX + Math.cos(angle) * distRadiusX;
            const radY = atom.y + Math.sin(angle) * distRadiusY;
            
            ctx.beginPath();
            // Der Punkt wächst ebenfalls leicht mit der Tiefe/Schriftgröße
            ctx.arc(radX, radY, Math.max(2, currentFontSize * 0.15), 0, Math.PI * 2);
            ctx.fillStyle = atom.color || options.globalColor;
            ctx.fill();
        }
    }
    // --- RESET ALPHA FÜR UI-ELEMENTE ---
    ctx.globalAlpha = 1.0; 

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

    ctx.restore();
}