import { Atom, Bond } from "./types";

// Das bekommt das Plugin vom Core
export interface ChemableContext {
    getAtoms: () => Atom[];
    getBonds: () => Bond[];
    // Erlaubt dem Plugin, Dinge zu zeichnen oder UI anzuzeigen
    showMessage: (msg: string) => void;
    drawOverlay: (data: any) => void; 
}

// Das muss jedes Plugin implementieren !!
export interface ChemablePlugin {
    id: string;
    name: string;
    version: string;
    
    // Wird beim Start aufgerufen
    onLoad: (context: ChemableContext) => void;
    
    // Buttin Press of plugin-specific action
    execute?: () => Promise<void>; 
    
    // Cleanup beim Deaktivieren des Plugins
    onUnload: () => void;
}