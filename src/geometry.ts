import { Atom, Bond } from "./types";

export function getDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function getAngle(from: { x: number, y: number }, to: { x: number, y: number }): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Math.atan2(dy, dx);
}

// Findet ein Atom in der Nähe von (x,y)
export function findAtomNearPosition(x: number, y: number, atoms: Atom[], tolerance: number, excludeId: number = -1): Atom | null {
    for (const atom of atoms) {
        if (atom.id === excludeId) continue;
        if (getDistance(atom.x, atom.y, x, y) < tolerance) {
            return atom;
        }
    }
    return null;
}

// Prüft, ob ein Klick auf einer Bindung war
export function getBondAtCoords(x: number, y: number, bonds: Bond[], atoms: Atom[], tolerance: number = 10): Bond | undefined {
    return bonds.find(bond => {
        const atom1 = atoms.find(a => a.id === bond.id1);
        const atom2 = atoms.find(a => a.id === bond.id2);

        if (!atom1 || !atom2) return false;

        const distX = x - atom1.x;
        const distY = y - atom1.y;
        const distAtomX = atom2.x - atom1.x;
        const distAtomY = atom2.y - atom1.y;

        const lenSQ = distAtomX ** 2 + distAtomY ** 2;
        const skalarprodukt = distX * distAtomX + distY * distAtomY;

        let param = -1;
        if (lenSQ !== 0) param = skalarprodukt / lenSQ;

        let X, Y;
        if (param < 0) {
            X = atom1.x;
            Y = atom1.y;
        } else if (param > 1) {
            X = atom2.x;
            Y = atom2.y;
        } else {
            X = atom1.x + param * distAtomX;
            Y = atom1.y + param * distAtomY;
        }
        
        return getDistance(x, y, X, Y) < tolerance;
    });
}

export function calculateBondOffsetDirection(
    start: { x: number, y: number },
    end: { x: number, y: number },
    neighbors: { x: number, y: number }[]
): number {
    // 1. Vektor der Bindung (A -> B)
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // 2. Normalenvektor berechnen (90° gedreht)
    // Dieser Vektor zeigt quasi "nach rechts" von der Linie aus gesehen.
    const nx = -dy;
    const ny = dx;

    let sumDot = 0;

    // 3. Für jeden Nachbarn prüfen: Liegt er in Richtung der Normalen?
    for (const pos of neighbors) {
        // Vektor vom Startpunkt zum Nachbarn
        const vnx = pos.x - start.x;
        const vny = pos.y - start.y;

        // Skalarprodukt: 
        // > 0 bedeutet: Der Nachbar liegt auf der Seite der Normalen ("rechts")
        // < 0 bedeutet: Der Nachbar liegt auf der anderen Seite ("links")
        const dot = nx * vnx + ny * vny;
        
        // Wir summieren alle Ergebnisse. Die Mehrheit gewinnt.
        sumDot += dot;
    }

    // Wenn gar keine Nachbarn da sind (isoliertes Alken), nehmen wir Standard (1)
    if (neighbors.length === 0) return 1;

    // Wenn die Summe positiv ist, liegen die meisten Nachbarn "rechts".
    // Also zeichnen wir den zweiten Strich auch rechts.
    return sumDot >= 0 ? 1 : -1;
}