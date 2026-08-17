export type EditMode = "draw" | "move" | "erase" | "select" | "text" | "arrow" | "shape" | "charge_plus" | "charge_minus" | "radical" | "rotate_3d" | "align_3d";
const STYLE_KEY = "chemable-style";
const STYLE_DEFAULTS = {
    currentFontSize: 27, currentBondLength: 60, globalLineWidth: 2,
    globalBondSpacing: 5, globalFontFamily: "Arial", globalColor: "#000000",
    atomPadding: 4, exportTransparent: false,
};

class UIState {
    public editMode: EditMode = "draw";
    public currentFontSize = 27;
    public showValenceWarnings = true;
    public showGrid = false;
    public currentBondLength = 60; 
    public currentBondType = 1; // 1 = Normal, 5 = Keil (Wedge), 6 = Gestrichelt (Dash)
    public showImplicitHydrogens: boolean = false;

    public globalBondSpacing = 5;
    public globalFontFamily = "Arial";
    public globalColor = "#000000";

    public currentMouseX = 0;
    public currentMouseY = 0;
    public dragStartAtom: any = null; 
    public lassoPath: {x: number, y: number}[] = [];
    public isDraggingSelection = false;
    public dragStartX = 0;
    public dragStartY = 0;

    // Panning & Canvas Navigation
    public panX = 0;
    public panY = 0;
    public isPanning = false;

    public setMode(mode: EditMode) {
        this.editMode = mode;
        //
    }
    public globalLineWidth = 2;
    public atomPadding = 4;            // Freiraum-Ring um Labels (px)
    public exportTransparent = false;  // PNG ohne weißen Hintergrund

    constructor() { this.loadStyle(); }

    public loadStyle() {
        try { Object.assign(this, STYLE_DEFAULTS, JSON.parse(localStorage.getItem(STYLE_KEY) ?? "{}")); }
        catch { Object.assign(this, STYLE_DEFAULTS); }
    }
    public saveStyle() {
        const s: any = {};
        for (const k of Object.keys(STYLE_DEFAULTS)) s[k] = (this as any)[k];
        localStorage.setItem(STYLE_KEY, JSON.stringify(s));
    }
    public resetStyle() { Object.assign(this, STYLE_DEFAULTS); localStorage.removeItem(STYLE_KEY); }
}

export const uiState = new UIState();