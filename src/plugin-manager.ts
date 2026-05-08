// src/plugin-manager.ts
import { ChemablePlugin, ChemableContext } from "./plugin-api";
import { state } from "./state";


const activePlugins: ChemablePlugin[] = [];


const context: ChemableContext = {
    getAtoms: () => state.getAtoms(),
    getBonds: () => state.getBonds(),
    showMessage: (msg: string) => {
        alert(`Plugin notification:\n\n${msg}`);
    },
    drawOverlay: (data: any) => {
        console.log("Plugin wants to draw an overlay:", data);
        
    }
};

export function registerPlugin(plugin: ChemablePlugin) {
    activePlugins.push(plugin);
    
    plugin.onLoad(context);
    
    const pluginMenu = document.getElementById('plugin-dropdown-content');
    if (pluginMenu && plugin.execute) {
        const btn = document.createElement('button');
        btn.innerText = ` ${plugin.name}`;
        
        btn.addEventListener('click', async () => {
            try {
                await plugin.execute!();
            } catch (err) {
                console.error(`Error when starting: ${plugin.name}:`, err);
            }
        });
        
        pluginMenu.appendChild(btn);
    }
    
    console.log(` Plugin registered: ${plugin.name} (v${plugin.version})`);
}

export function triggerPluginStateChange() {
    activePlugins.forEach(plugin => {
        if (plugin.onStateChange) {
            plugin.onStateChange(context);
        }
    });
}