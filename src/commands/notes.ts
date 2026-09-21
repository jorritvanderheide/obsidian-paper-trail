// Add note: the notes you write yourself, whichever kind.
//
// There were two commands, split by whether the note goes round the filing
// loop. That split lives in the template's own frontmatter, so it did not need
// to live in a command name as well.
import { Notice, type TFile } from 'obsidian';
import { ensureFolder, noteTemplates, templateBody } from './templates';
import { prompt, suggest } from '../ui/prompt';
import { fill } from '../core/paper-note';
import { readTags, setAxis, typeForNewNote } from '../core/vocabulary';
import { sortKeys } from '../core/frontmatter';
import type { Context } from '../context';

/**
 * Ask for the title, then the template, then write the note. Both questions
 * come before the file exists, so a name clash is caught while the name can
 * still be changed rather than after something is already on disk.
 * `{{TITLE}}` is the only placeholder, which is all any template needs.
 */
export async function createFromTemplate(context: Context): Promise<void> {
	const app = context.app;
	const templates = await noteTemplates(app, context.settings.templateFolder);
	const notesFolder = context.settings.notesFolder;
	// Checked while typing rather than after the template has been picked: a name
	// clash is worth knowing about at the moment it can still be edited.
	const title = (
		await prompt(app, 'Title', {
			cta: 'Create',
			validate: (value) => {
				if (value.includes('/')) return `${notesFolder}/ is flat, so a title cannot contain a slash.`;
				if (app.vault.getAbstractFileByPath(`${notesFolder}/${value}.md`)) return `${notesFolder}/${value}.md already exists.`;
				return null;
			},
		})
	)?.trim();
	if (!title) return;

	const template =
		templates.length === 1 ? templates[0] : await suggest(app, templates, (entry) => entry.label, 'Template');
	if (!template) return;

	const path = `${notesFolder}/${title}.md`;
	if (app.vault.getAbstractFileByPath(path)) {
		new Notice(`${path} already exists.`);
		return;
	}

	// A vault that has not grown a Notes/ yet would otherwise fail on its first note.
	await ensureFolder(app, notesFolder);

	const content = fill(await templateBody(app, template, context.settings.templateFolder), {
		TITLE: title,
		TYPE_INBOX: context.settings.types.inbox,
		TYPE_LIVING: context.settings.types.living,
	});

	// A template of your own need not have frontmatter, and `processFrontMatter`
	// on a file without a block eats the first two lines of it. Given a real
	// block to edit, it edits that.
	const file: TFile = await app.vault.create(path, content.startsWith('---\n') ? content : `---\n---\n${content}`);

	// Filing is the ordering principle, so a new note joins the loop unless its
	// template said otherwise. Without this, a template you wrote yourself and
	// forgot to tag would make notes nothing ever asks about again.
	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		const tags = readTags(frontmatter.tags);
		frontmatter.tags = setAxis(tags, 'type', typeForNewNote(tags, context.settings.types));
		sortKeys(frontmatter);
	});

	await app.workspace.getLeaf('tab').openFile(file);
}
