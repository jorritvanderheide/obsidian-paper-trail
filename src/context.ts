// What a command needs from the plugin, and nothing else.
//
// Narrow on purpose. A command that took the plugin class could reach anything,
// would depend on `main.ts` while `main.ts` depends on it, and could not be
// called from a test without building a whole Plugin.
import type { App } from 'obsidian';
import type { Settings } from './core/settings';

export interface Context {
	app: App;
	settings: Settings;
	saveSettings(): Promise<void>;
}
