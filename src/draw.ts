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
    globalLineWidth?: number;
    atomPadding?: number;   
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

    // --- PAINTER'S ALGORITHM ---
    const drawables: any[] = [];
    const atomData = new Map<number, any>();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const atom of atoms) {
        if (atom.element.toUpperCase() === "DUMMY") continue;
        
        const z = atom.z || 0;
        const scale = Math.max(0.7, Math.min(1.3, 1 + (z * 0.005))); 
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
        const textWidth = ctx.measureText(label || "C").width;
        
        const elemWidth = ctx.measureText(atom.customLabel ? label.charAt(0) : atom.element).width;
        const bgRadiusX = Math.max(currentFontSize * 0.75, (elemWidth / 2) + (currentFontSize * 0.25));
        const bgRadiusY = currentFontSize * 0.85; 

        let shiftX = 0;
        if (!isHidden && ((atom.customLabel && atom.alignFirstLetter) || (!atom.customLabel && label.length > atom.element.length))) {
            const elementWidth = ctx.measureText(atom.customLabel ? label.charAt(0) : (isTextElement ? label.charAt(0) : atom.element)).width;
            const offset = (textWidth / 2) - (elementWidth / 2);
            shiftX = bondOnRight ? -offset : offset;
        }

        const drawX = atom.x + shiftX;

        atomData.set(atom.id, {
            label, isHidden, isError, currentFontSize, scale, fontToUse,
            textWidth, bgRadiusX, bgRadiusY, shiftX, drawX, z, elemWidth
        });

        const skipCompletely = isHidden && !isError && options.selectedAtomId !== atom.id && !atom.charge && !atom.radical;
        if (!skipCompletely) {
            drawables.push({ type: 'atom', z: z, atom });
        }
    }

    for (const bond of bonds) {
        const a1 = atoms.find(a => a.id === bond.id1);
        const a2 = atoms.find(a => a.id === bond.id2);
        if (!a1 || !a2) continue;

        const z1 = a1.z || 0;
        const z2 = a2.z || 0;
        const avgZ = (z1 + z2) / 2;

        drawables.push({ type: 'bond', z: avgZ, bond, a1, a2 });
    }

    drawables.sort((a, b) => a.z - b.z);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const item of drawables) {
        if (item.type === 'bond') {
            //BINDUNGEN
            const { bond, a1, a2 } = item;
            const dx = a2.x - a1.x;
            const dy = a2.y - a1.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            if (len === 0) continue;

            const data1 = atomData.get(a1.id);
            const data2 = atomData.get(a2.id);
            
            //clipping
            const absCos = Math.abs(dx / len);
            const absSin = Math.abs(dy / len);
            
            const pad = options.atomPadding ?? 4;
            const r1 = (data1 && !data1.isHidden) ? (absCos * (data1.elemWidth / 2 + pad) + absSin * (data1.currentFontSize * 0.6)) : 0;
            const r2 = (data2 && !data2.isHidden) ? (absCos * (data2.elemWidth / 2 + pad) + absSin * (data2.currentFontSize * 0.6)) : 0;

            // Wenn die Atome extrem nah aneinander liegen, brechen wir ab
            if (len <= r1 + r2) continue; 

            const ux = dx / len;
            const uy = dy / len;
            const nx = -dy / len;
            const ny = dx / len;

            // VERSCHOBENE START- UND ENDPUNKTE (Die Lücke zum Atom)
            const sx = a1.x + ux * r1;
            const sy = a1.y + uy * r1;
            const ex = a2.x - ux * r2;
            const ey = a2.y - uy * r2;

            ctx.globalAlpha = 1.0; 

            const lw = options.globalLineWidth ?? 2;
            ctx.lineWidth = Math.min(lw * 3, Math.max(0.5, lw + (item.z * 0.06)));
            ctx.strokeStyle = bond.color || options.globalColor;
            
            let offset = bond.spacing || options.globalBondSpacing;
            if (bond.type === 2 || bond.type === 3) {
                const direction = calculateBondOffsetDirection(a1, a2, bonds, atoms);
                offset = offset * direction; 
            }

            ctx.beginPath();
            if (bond.type === 1) {
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke(); 
            } else if (bond.type === 2) {
                const a1Connections = bonds.filter(b => b.id1 === a1.id || b.id2 === a1.id).length;
                const a2Connections = bonds.filter(b => b.id1 === a2.id || b.id2 === a2.id).length;
                const isTerminal = a1Connections === 1 || a2Connections === 1;

                if (isTerminal) {
                    const halfOffset = offset / 2;
                    ctx.moveTo(sx + nx * halfOffset, sy + ny * halfOffset);
                    ctx.lineTo(ex + nx * halfOffset, ey + ny * halfOffset);
                    ctx.moveTo(sx - nx * halfOffset, sy - ny * halfOffset);
                    ctx.lineTo(ex - nx * halfOffset, ey - ny * halfOffset);
                    ctx.stroke();
                } else {
                    ctx.moveTo(sx, sy);
                    ctx.lineTo(ex, ey);
                    const shiftX = nx * offset;
                    const shiftY = ny * offset;
                    const padding = 3; 
                    ctx.moveTo(sx + shiftX + ux * padding, sy + shiftY + uy * padding);
                    ctx.lineTo(ex + shiftX - ux * padding, ey + shiftY - uy * padding);
                    ctx.stroke(); 
                }
            } else if (bond.type === 3) {
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                const o = 4; 
                ctx.moveTo(sx + nx * o, sy + ny * o);
                ctx.lineTo(ex + nx * o, ey + ny * o);
                ctx.moveTo(sx - nx * o, sy - ny * o);
                ctx.lineTo(ex - nx * o, ey - ny * o);
                ctx.stroke(); 
            } else if (bond.type === 4) { // Reaktionspfeil
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke();
                const headlen = 12;
                const angle = Math.atan2(dy, dx);
                ctx.beginPath();
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - headlen * Math.cos(angle - Math.PI / 6), ey - headlen * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - headlen * Math.cos(angle + Math.PI / 6), ey - headlen * Math.sin(angle + Math.PI / 6));
                ctx.stroke();
            } else if (bond.type === 5) { // Keil
                const startWidth = 1.0; 
                const endWidth = Math.min(8, Math.max(3.0, 5.0 + (item.z * 0.05))); 
                ctx.fillStyle = bond.color || options.globalColor;
                ctx.lineJoin = "round"; 
                ctx.beginPath();
                ctx.moveTo(sx + nx * startWidth, sy + ny * startWidth);
                ctx.lineTo(sx - nx * startWidth, sy - ny * startWidth);
                ctx.lineTo(ex - nx * endWidth, ey - ny * endWidth);
                ctx.lineTo(ex + nx * endWidth, ey + ny * endWidth);
                ctx.closePath();
                ctx.fill();
            } else if (bond.type === 6) { // Gestrichelt
                const hashes = 6; 
                ctx.fillStyle = bond.color || options.globalColor; 
                ctx.beginPath();
                for (let i = 0; i < hashes; i++) {
                    const fraction = i / (hashes - 1);
                    const cx = sx + (ex - sx) * fraction;
                    const cy = sy + (ey - sy) * fraction;
                    const currentWidth = 1.0 + (4.0 * fraction); 
                    ctx.moveTo(cx + nx * currentWidth, cy + ny * currentWidth);
                    ctx.lineTo(cx - nx * currentWidth, cy - ny * currentWidth);
                }
                ctx.stroke();
            }
        } else {
            // --- ATOME ZEICHNEN ---
            const { atom } = item;
            const data = atomData.get(atom.id);
            if (!data) continue;

            ctx.globalAlpha = 1.0;
            ctx.font = `${data.currentFontSize}px ${data.fontToUse}`;

            // Wenn es einen Fehler gibt, zeichnen wir den roten Warndunst
            if (data.isError) {
                ctx.beginPath();
                ctx.ellipse(data.drawX, atom.y, data.bgRadiusX + (data.currentFontSize * 0.2), data.bgRadiusY + (data.currentFontSize * 0.2), 0, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
                ctx.fill();
            }

            // HINWEIS: Die alte weiße Hintergrund-Ellipse wurde hier komplett entfernt, 
            // da die Bindungen nun präzise vor den Buchstaben abreißen (Bond Clipping)!

            if (!data.isHidden) {
                ctx.fillStyle = atom.color || options.globalColor;
                ctx.fillText(data.label, data.drawX, atom.y);
            }

            if (atom.charge) {
                const isPositive = atom.charge > 0;
                const absCharge = Math.abs(atom.charge);
                const signStr = isPositive ? "+" : "−";
                
                let angle = atom.chargeAngle;
                if (angle === undefined) angle = data.isHidden ? -Math.PI / 2 : -Math.PI * 0.25;

                const orbitPadding = data.currentFontSize * 0.25;
                const badgeX = data.drawX + Math.cos(angle) * (data.bgRadiusX + orbitPadding);
                const badgeY = atom.y + Math.sin(angle) * (data.bgRadiusY + orbitPadding);
                const badgeRadius = Math.max(7 * data.scale, data.currentFontSize * 0.42);
                
                ctx.beginPath();
                ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
                ctx.fillStyle = "#FFFFFF";
                ctx.fill();
                ctx.lineWidth = Math.max(1, 1.5 * data.scale);
                ctx.strokeStyle = atom.color || options.globalColor;
                ctx.stroke();

                ctx.fillStyle = atom.color || options.globalColor;
                ctx.font = `bold ${Math.max(10 * data.scale, data.currentFontSize * 0.6)}px Arial`;
                ctx.fillText(signStr, badgeX, badgeY + (1 * data.scale));

                if (absCharge > 1) {
                    ctx.textAlign = "right";
                    ctx.font = `bold ${Math.max(12 * data.scale, data.currentFontSize * 0.7)}px Arial`;
                    ctx.fillText(absCharge.toString(), badgeX - badgeRadius - (data.currentFontSize * 0.1), badgeY + (1 * data.scale));
                }
                ctx.textAlign = "center"; 
            }

            if (atom.radical) {
                let angle = atom.chargeAngle;
                if (angle === undefined) angle = data.isHidden ? -Math.PI / 2 : -Math.PI * 0.25;
                
                const orbitPadding = data.currentFontSize * 0.25;
                const chargeOffset = atom.charge ? (data.currentFontSize * 0.85) : 0;
                
                const radX = data.drawX + Math.cos(angle) * (data.bgRadiusX + orbitPadding + chargeOffset);
                const radY = atom.y + Math.sin(angle) * (data.bgRadiusY + orbitPadding + chargeOffset);
                
                ctx.beginPath();
                ctx.arc(radX, radY, Math.max(2, data.currentFontSize * 0.15), 0, Math.PI * 2);
                ctx.fillStyle = atom.color || options.globalColor;
                ctx.fill();
            }
        }
    }

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