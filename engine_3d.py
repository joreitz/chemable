import sys
from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit.Geometry import Point3D

def generate_structure(smiles, mode="3d"):
    try:
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            raise ValueError("Ungültiger SMILES")
            
        if mode == "3d":
            # Echtes 3D mit Kraftfeld für den Viewer
            mol = Chem.AddHs(mol)
            params = AllChem.ETKDGv3()
            params.useRandomCoords = True
            AllChem.EmbedMolecule(mol, params)
            AllChem.UFFOptimizeMolecule(mol)
            
        elif mode == "2d":
            # Versuch 1: Klassische 2D-Berechnung
            res = AllChem.Compute2DCoords(mol)
            
            # Versuch 2 (Fallback): Wenn 2D fehlschlägt (z.B. Tripod-Liganden),
            # berechnen wir es in 3D und drücken die Z-Achse auf 0 (isometrisches 2D)
            if res != 0:
                params = AllChem.ETKDGv3()
                params.useRandomCoords = True
                AllChem.EmbedMolecule(mol, params)
                if mol.GetNumConformers() > 0:
                    conf = mol.GetConformer()
                    for i in range(mol.GetNumAtoms()):
                        pos = conf.GetAtomPosition(i)
                        # Z-Achse ausradieren für den 2D Canvas!
                        conf.SetAtomPosition(i, Point3D(pos.x, pos.y, 0.0))

        print(Chem.MolToMolBlock(mol))
        
    except Exception as e:
        print(f"ERROR: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        smiles_input = sys.argv[1]
        # Standard ist "3d", aber wir können jetzt auch "2d" übergeben!
        mode_input = sys.argv[2] if len(sys.argv) > 2 else "3d"
        generate_structure(smiles_input, mode_input)