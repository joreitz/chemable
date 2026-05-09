import { exec } from 'child_process';
import * as util from 'util';
import * as path from 'path';

const execAsync = util.promisify(exec);

export let RDKit: any = null;

export function initRDKit() {
    if ((window as any).initRDKitModule) {
        (window as any).initRDKitModule({
            locateFile: () => "https://unpkg.com/@rdkit/rdkit/dist/RDKit_minimal.wasm"
        }).then((instance: any) => {
            RDKit = instance;
            console.log("✅ RDKit 2D-Engine geladen!");
        });
    }
}

export async function generate2DModelPython(smiles: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
        try {
            const cleanSmiles = smiles.trim().replace(/^SMILES=/i, "");
            const pythonScriptPath = path.join(__dirname, '../../engine_3d.py'); 
            
            // ACHTUNG: Wir schicken hier "2d" als letztes Argument an Python!
            const { stdout, stderr } = await execAsync(`python "${pythonScriptPath}" "${cleanSmiles}" "2d"`);
            
            if (stderr && stderr.includes("ERROR")) {
                reject(new Error(stderr));
            } else {
                resolve(stdout);
            }
        } catch (err: any) {
            reject(new Error(`Python 2D Fehler: ${err.message}`));
        }
    });
}

export async function generate3DModelPython(smiles: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
        try {
            const cleanSmiles = smiles.trim().replace(/^SMILES=/i, "");
            
            const pythonScriptPath = path.join(__dirname, '../../engine_3d.py'); 
            
            console.log(`[RDKit Python] Führe aus: python "${pythonScriptPath}" "${cleanSmiles}"`);
            
            const { stdout, stderr } = await execAsync(`python "${pythonScriptPath}" "${cleanSmiles}"`);
            
            if (stderr && stderr.includes("ERROR")) {
                reject(new Error(stderr));
            } else {
                resolve(stdout);
            }
        } catch (err: any) {
            // HIER entlarven wir den echten Fehler!
            console.error("[RDKit Python System-Fehler]:", err);
            reject(new Error(`Python Startfehler: ${err.message}`));
        }
    });
}