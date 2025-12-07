//Interfaces immer mit kapitalem Anfangsbuchstaben
interface Atom {
    id: number;
    element: string;
    x: number;
    y: number;
}

interface Bond {
    id1: number;
    id2: number;
    type: number; // 1: Single; 2: Double; 3: Triple; 4: Keil (vorne); 5: Keil(hinten)
}

interface EditorState {
    atoms: Atom[];
    bonds: Bond[];
    nextId: number;
    currentElement: string;
}

let historyState: EditorState[] = [];

//State
let atoms: Atom[] = [];
let bonds: Bond[] = [];
let currentElement = "C";
let nextId = 1;
let selectedAtom: Atom | null = null;

//Canvaszugriff
const canvas = document.getElementById('chemBoard') as HTMLCanvasElement;
const ctx = canvas.getContext("2d");

//Renderer
function render() {
    if (!ctx) return;

    //Delete Button
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    renderBonds();

    // Atome aus dem Speicher malen können
    atoms.forEach(atom => {
        ctx.beginPath();

        if (selectedAtom && selectedAtom.id === atom.id) {
            ctx.fillStyle = "rgba(255, 0, 0, 0.4)"; // Leicht roter Kreis
            ctx.arc(atom.x, atom.y, 20, 0, 2 * Math.PI);
            ctx.fill();
        }

        ctx.arc(atom.x, atom.y, 15, 0, 2*Math.PI);
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.strokeStyle = "black";
        ctx.stroke();

    //Elementsymbol
        ctx.fillStyle = "black";
        ctx.font = "bold 20px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(atom.element, atom.x, atom.y);

    });
}

function saveState() {
    console.log("Speichere Zustand... Neuer Stack:", historyState.length + 1);
    const snapshot: EditorState = {
        atoms: JSON.parse(JSON.stringify(atoms)),
        bonds: JSON.parse(JSON.stringify(bonds)),
        nextId: nextId,
        currentElement: currentElement
    }; 

    historyState.push(snapshot);
}

function undo() {
    console.log("Undo wurde geklickt! Stack-Länge:", historyState.length);
    if (historyState.length == 0) {
        return "Nothing to undo."
    } else {const lastState = historyState.pop()
    atoms = lastState!.atoms;
    bonds = lastState!.bonds;
    nextId = lastState!.nextId;
    currentElement = lastState!.currentElement;
    render();
    };
}

//helper 
function getAtomByID(id: number): Atom | undefined {
    return atoms.find(atom => atom.id === id);
}

//Bindungen
function renderBonds() {
    if (!ctx) return;

    bonds.forEach(bond => {
        const atom1 = getAtomByID(bond.id1);
        const atom2 = getAtomByID(bond.id2);

        if (atom1 && atom2) {


                ctx.beginPath();
                ctx.lineWidth = 3;
                ctx.strokeStyle = "black";

            if (bond.type == 1) {

                ctx.moveTo(atom1.x, atom1.y);
                ctx.lineTo(atom2.x, atom2.y);
                ctx.stroke();      
                
            } else if (bond.type == 2) {

                const dx = atom2.x - atom1.x;
                const dy = atom2.y - atom1.y;
                const distxy = Math.sqrt(dx**2+dy**2);

                if (distxy > 0) {

                    const offsetX = (dy/distxy)*4
                    const offsetY = -(dx/distxy)*4

                    ctx.moveTo(atom1.x + offsetX, atom1.y + offsetY);
                    ctx.lineTo(atom2.x + offsetX, atom2.y + offsetY);

                    ctx.moveTo(atom1.x - offsetX, atom1.y - offsetY);
                    ctx.lineTo(atom2.x - offsetX, atom2.y - offsetY);

                }
                ctx.stroke();

            } else if (bond.type == 3) {

                const dx = atom2.x - atom1.x;
                const dy = atom2.y - atom1.y;
                const distxy = Math.sqrt(dx**2+dy**2);

                if (distxy > 0) {

                    const offsetX = (dy/distxy)*4.5
                    const offsetY = -(dx/distxy)*4.5

                    ctx.moveTo(atom1.x + offsetX, atom1.y + offsetY);
                    ctx.lineTo(atom2.x + offsetX, atom2.y + offsetY);

                    ctx.moveTo(atom1.x, atom1.y);
                    ctx.lineTo(atom2.x, atom2.y);

                    ctx.moveTo(atom1.x - offsetX, atom1.y - offsetY);
                    ctx.lineTo(atom2.x - offsetX, atom2.y - offsetY);

                }
                ctx.stroke();

            } else if (bond.type == 4) {

            } else {

            }

        }
    })
}

// Atome hinzufügen

function addAtom(x: number, y: number) {
    const newAtom: Atom = {
        id: nextId++,
        element: currentElement,
        x: x,
        y: y
    };
    saveState();
    atoms.push(newAtom);
    render();
}

// Abstand Punkt-Linie

function isClickOnBond(x: number, y: number, bond: Bond): boolean {
    const atom1 = getAtomByID(bond.id1);
    const atom2 = getAtomByID(bond.id2);

    if (!atom1 || !atom2) return false;

    const distX = x - atom1.x;
    const distY = y - atom1.y;

    const distAtomX = atom2.x - atom1.x;
    const distAtomY = atom2.y - atom1.y;

    const skalarprodukt = distX * distAtomX + distY * distAtomY;
    const lenSQ = distAtomX**2 + distAtomY**2;

    let param = -1;
    if (lenSQ !== 0)
        param = skalarprodukt / lenSQ

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
    const dX = x - X;
    const dY = y - Y;
    return Math.sqrt(dX**2+dY**2) < 10;
}

function getBondAtCoords(x: number, y: number): Bond | undefined {
    return bonds.find(bond => isClickOnBond(x, y, bond));
}

function getAtomAtCoords(x: number, y: number): Atom | undefined {
    const clickTolerance = 25; //25 pixel Tolleranz
    return atoms.find(atom => {
        const distance = Math.sqrt(
            (atom.x -x) ** 2 + (atom.y -y) ** 2
        );
        return distance < clickTolerance;
    })
}
// Canvas Interaktionen
canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // 1. Prüfen: Wurde ein Atom getroffen?
    const clickedAtom = getAtomAtCoords(x, y);
    
    // 2. Prüfen: Wurde eine Bindung getroffen?
    const clickedBond = getBondAtCoords(x, y);

    if (clickedAtom) {

        if (selectedAtom === null) {
            selectedAtom = clickedAtom;
        } else {
            const atom1 = selectedAtom;
            const atom2 = clickedAtom;
            
            if (atom1.id !== atom2.id) {
                // Prüfen, ob Bindung schon existiert 
                const exists = bonds.some(b => 
                    (b.id1 === atom1.id && b.id2 === atom2.id) ||
                    (b.id1 === atom2.id && b.id2 === atom1.id)
                );

                if (!exists) {
                    saveState();
                    const newBond: Bond = {
                        id1: atom1.id,
                        id2: atom2.id,
                        type: 1 // Standard
                    };
                    saveState();
                    bonds.push(newBond);
                }
                selectedAtom = null;
            }
        }
    } 
    else if (clickedBond) {
        saveState();
        if (clickedBond.type === 1) {
            clickedBond.type = 2; // Zu Doppelbindung
        } else if (clickedBond.type === 2) {
            clickedBond.type = 3; // Zu Dreifachbindung (noch nicht visualisiert)
        } else {
            clickedBond.type = 1; // Zurück zu Einfach
        }
        
        selectedAtom = null;
    } 
    else {
        // empty
        addAtom(x, y);
        selectedAtom = null;
    }
    
    render();
});

//keypresses
document.addEventListener('keydown', (event) => {
if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
    undo();
}
});

function clearAll() {
    atoms = [];
    bonds = [];
    nextId = 1;
    render();
}

// Knöpfe
document.getElementById('btn-c')?.addEventListener('click', () => {
    currentElement = "C";
    console.log("Currently: Carbon");
});

document.getElementById('btn-o')?.addEventListener('click', () => {
    currentElement = "O";
    console.log("Currently: Oxygen");
});

document.getElementById('btn-undo')?.addEventListener('click', () => {
    undo();
})

render();