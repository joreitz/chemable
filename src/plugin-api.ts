import { Atom, Bond } from "./types";

// Das bekommt das Plugin vom Core
export interface ChemableContext {
    getAtoms: () => Atom[];
    getBonds: () => Bond[];
    // Erlaubt dem Plugin, Dinge zu zeichnen oder UI anzuzeigen
    showMessage: (msg: string) => void;
    drawOverlay: (data: any) => void; 
}

// Das muss jedes Plugin implementieren
export interface ChemablePlugin {
    id: string;
    name: string;
    version: string;
    
    // Wird beim Start aufgerufen
    onLoad: (context: ChemableContext) => void;
    
    // Wird aufgerufen, wenn der User "Berechnen" klickt
    execute?: () => Promise<void>; 
    
    // Aufräumen
    onUnload: () => void;
}