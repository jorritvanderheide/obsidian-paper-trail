// Seeding and reading the paper template.
import { normalizePath, type App } from 'obsidian';
import { type Template } from '../core/templates';

/** Makes a folder if it is not there. `vault.create` will not do it for you. */
export async function ensureFolder(app: App, path: string): Promise<void> {
	const normalised = normalizePath(path);
	if (!app.vault.getFolderByPath(normalised)) await app.vault.createFolder(normalised);
}

/**
 * The template's text, seeding the file from the built-in copy when it is not
 * there. Seeding on use rather than on load keeps the plugin from writing into
 * a vault that has not asked it for anything yet.
 */
export async function templateBody(app: App, template: Template, dir: string): Promise<string> {
	const path = normalizePath(`${dir}/${template.file}`);

	const existing = app.vault.getFileByPath(path);
	if (existing) return app.vault.cachedRead(existing);

	await ensureFolder(app, dir);
	return app.vault.cachedRead(await app.vault.create(path, template.content));
}
