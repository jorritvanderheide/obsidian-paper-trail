// Retagging a note: setting one value on one axis.
//
// Nothing here does regex surgery on raw YAML. `processFrontMatter` parses and
// rewrites it, so a note whose tags are inline, or indented differently, or
// absent altogether, cannot silently miss an edit.
import { Notice, type App, type TFile } from 'obsidian';
import { label, readTags, setAxis, type Axis, type Vocabulary } from '../core/vocabulary';
import { vocabularyOf } from '../core/settings';
import { sortKeys } from '../core/frontmatter';
import type { Context } from '../context';
import { suggest } from '../ui/prompt';

function activeFile(app: App): TFile | null {
	const file = app.workspace.getActiveFile();
	if (!file) new Notice('No active note.');
	return file;
}

async function write(app: App, file: TFile, edits: [Axis, string | null][]): Promise<void> {
	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		let tags = readTags(frontmatter.tags);
		for (const [axis, value] of edits) tags = setAxis(tags, axis, value);
		frontmatter.tags = tags;
		sortKeys(frontmatter);
	});
}

/** One choice in the retag list: an axis, a value, and how it reads. */
interface Choice {
	axis: Axis;
	value: string | null;
	label: string;
}

/** Every value you can tag a note with, as one flat list. */
function choices(vocabulary: Vocabulary): Choice[] {
	const list: Choice[] = [];
	for (const value of vocabulary.domains) list.push({ axis: 'domain', value, label: label(value) });
	return list;
}

/** Set one tag on the active note. */
export async function retag(context: Context): Promise<void> {
	const app = context.app;
	const file = activeFile(app);
	if (!file) return;

	const chosen = await suggest(app, choices(vocabularyOf(context.settings)), (choice) => choice.label, 'Tag as');
	if (!chosen) return;

	await write(app, file, [[chosen.axis, chosen.value]]);
	new Notice(`${file.basename}\n${chosen.label}`);
}
