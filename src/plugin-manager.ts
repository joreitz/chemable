// src/plugin-manager.ts
import { ChemablePlugin, ChemableContext } from "./plugin-api";
import { state } from "./state";

// Hier speichern wir alle geladenen Plugins
const activePlugins: ChemablePlugin[] = [];

// Das ist der Werkzeugkasten, den wir jedem Plugin in die Hand drücken
const context: ChemableContext = {
    getAtoms: () => state.getAtoms(),
    getBonds: () => state.getBonds(),
    showMessage: (msg: string) => {
        // Ein simples Alert-Fenster für Plugin-Nachrichten
        alert(`ℹ️ Plugin-Meldung:\n\n${msg}`);
    },
    drawOverlay: (data: any) => {
        console.log("Plugin möchte Overlay zeichnen:", data);
        // (Das können wir später erweitern, wenn ein Plugin auf den Canvas malen soll)
    }
};

export function registerPlugin(plugin: ChemablePlugin) {
    activePlugins.push(plugin);
    
    // 1. Dem Plugin sagen: "Du wurdest geladen, hier ist dein Kontext!"
    plugin.onLoad(context);
    
    // 2. Einen Button für das Plugin im Menü erstellen
    const pluginMenu = document.getElementById('plugin-dropdown-content');
    if (pluginMenu && plugin.execute) {
        const btn = document.createElement('button');
        btn.innerText = `⚙️ ${plugin.name}`;
        
        btn.addEventListener('click', async () => {
            try {
                await plugin.execute!();
            } catch (err) {
                console.error(`Fehler beim Ausführen von Plugin ${plugin.name}:`, err);
            }
        });
        
        pluginMenu.appendChild(btn);
    }
    
    console.log(`🔌 Plugin registriert: ${plugin.name} (v${plugin.version})`);
}