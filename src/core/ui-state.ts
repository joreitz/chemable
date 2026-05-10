export type EditMode = "draw" | "move" | "erase" | "select" | "text" | "arrow" | "charge_plus" | "charge_minus" | "radical" | "rotate_3d" | "align_3d" ;

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
}

export const uiState = new UIState();