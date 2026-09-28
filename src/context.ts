// What a command needs from the plugin, and nothing else.
//
// Narrow on purpose. A command that took the plugin class could reach anything,
// would depend on `main.ts` while `main.ts` depends on it, and could not be
// called from a test without building a whole Plugin.
import type { App, EventRef, Events } from 'obsidian';
import type { Settings } from './core/settings';

export interface Context {
	app: App;
	settings: Settings;
	saveSettings(): Promise<void>;
}

/**
 * Fired on the workspace after a setting is saved.
 *
 * The queue is drawn from the settings as much as from the vault: triage and
 * the written passes decide which sections there are and where a paper sits.
 * It redraws on vault and library events, and changing a setting is neither,
 * so without this the pane went on showing the old workflow until something
 * else happened to redraw it.
 */
const SETTINGS_CHANGED = 'paper-trail:settings-changed';

/** Say a setting has been saved. */
export function settingsChanged(app: App): void {
	app.workspace.trigger(SETTINGS_CHANGED);
}

/**
 * Be told when a setting has been saved, for `registerEvent`.
 *
 * Through `Events`, which the workspace extends, because the workspace's own
 * typing names only Obsidian's events and a plugin's own is any other string.
 */
export function onSettingsChanged(app: App, listener: () => void): EventRef {
	const events: Events = app.workspace;
	return events.on(SETTINGS_CHANGED, listener);
}
