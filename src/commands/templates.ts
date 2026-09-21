// Seeding and reading the note templates. Shared by every command that writes
// a note from one.
import { normalizePath, type App } from 'obsidian';
import { PAPER_TEMPLATE, TEMPLATES, type Template } from '../core/templates';

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


/**
 * Every template you can make a note from: the shipped ones, seeded on first
 * use, plus anything else in the template folder.
 *
 * The folder is the list, so adding a kind of note is writing one rather than
 * editing this plugin. The half of the product meant to hold whatever you write
 * should not be the half you cannot extend.
 *
 * The paper template is left out: that one the plugin owns, because it has to
 * know where the claim and the assessment are.
 */
export async function noteTemplates(app: App, dir: string): Promise<Template[]> {
	// Seed the shipped ones first, so a fresh vault sees them in the list rather
	// than an empty picker that gives no clue what a template here looks like.
	for (const template of TEMPLATES) await templateBody(app, template, dir);

	const folder = normalizePath(dir);

	return app.vault
		.getMarkdownFiles()
		.filter((file) => file.parent?.path === folder && file.name !== PAPER_TEMPLATE.file)
		.map((file) => ({ label: file.basename, file: file.name, content: '' }))
		.sort((a, b) => a.label.localeCompare(b.label));
}
