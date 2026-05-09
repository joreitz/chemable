// src/plugin-api.ts
import { Atom, Bond } from "./types";

export interface ChemableContext {
    getAtoms: () => Atom[];
    getBonds: () => Bond[];
    saveState: () => void;
    render: () => void;    
    showMessage: (msg: string) => void;
    drawOverlay: (data: any) => void; 
}

export interface ChemablePlugin {
    id: string;
    name: string;
    version: string; 
    onLoad: (context: ChemableContext) => void; 
    execute?: () => Promise<void>; 
    onStateChange?: (context: ChemableContext) => void;
    onUnload: () => void; 
}