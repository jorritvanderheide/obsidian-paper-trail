// Reporting tags the vocabulary no longer knows.
import { Modal, type App } from 'obsidian';
import { byValue, orphans, type Orphan } from '../core/orphans';
import { readTags } from '../core/vocabulary';
import { vocabularyOf } from '../core/settings';
import { reveal } from '../ui/reveal';
import type { Context } from '../context';

class Orphans extends Modal {
	constructor(
		app: App,
		private readonly found: Orphan[],
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('Tags nothing recognises');
		const el = this.contentEl;

		if (this.found.length === 0) {
			el.createEl('p', { text: 'Every tag in the vault is a value the settings know about.' });
			return;
		}

		el.createEl('p', {
			text: `${this.found.length} tag${this.found.length === 1 ? '' : 's'} on ${new Set(this.found.map((o) => o.path)).size} notes. Filing a note asks again for anything invalid, so these are mostly notes already filed.`,
		});

		for (const group of byValue(this.found)) {
			el.createEl('h4', { text: `${group.tag} · ${group.notes.length}` });
			const list = el.createEl('ul', { cls: 'paper-trail-orphans' });
			for (const orphan of group.notes) {
				const item = list.createEl('li');
				const link = item.createEl('a', { text: orphan.title, href: '#' });
				link.addEventListener('click', (event) => {
					event.preventDefault();
					const file = this.app.vault.getFileByPath(orphan.path);
					if (file) void reveal(this.app, file);
				});
			}
		}
	}
}

/**
 * Find every tag the vocabulary no longer knows.
 *
 * Worth running before renaming a value rather than after: the answer is the
 * same either way, but only one order lets you change your mind.
 */
export function findOrphans(context: Context): void {
	const app = context.app;

	const notes = app.vault.getMarkdownFiles().map((file) => {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		return {
			path: file.path,
			title: typeof frontmatter?.title === 'string' ? frontmatter.title : file.basename,
			tags: readTags(frontmatter?.tags),
		};
	});

	new Orphans(app, orphans(notes, vocabularyOf(context.settings))).open();
}
