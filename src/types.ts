export interface Atom {
    id: number;
    element: string;
    x: number;
    y: number;
    charge?: number;
    radical?: boolean;
    customLabel?: string;
    autoFlip?: boolean;   
}

export interface Bond {
    id1: number;
    id2: number;
    type: number; //
}

export interface EditorState {
    atoms: Atom[];
    bonds: Bond[];
    nextId: number;
    currentElement: string;
}