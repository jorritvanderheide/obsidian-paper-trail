// Filing a note, and retagging one. Both do the same thing to a note's tag
// list; they differ in which axis they ask about and when.
//
// Nothing here does regex surgery on raw YAML. `processFrontMatter` parses and
// rewrites it, so a note whose tags are inline, or indented differently, or
// absent altogether, cannot silently miss an edit.
import { Notice, type App, type TFile } from 'obsidian';
import { ROLES, axisValue, isValid, label, readTags, roleOf, setAxis, type Axis, type Vocabulary } from '../core/vocabulary';
import { vocabularyOf } from '../core/settings';
import { sortKeys } from '../core/frontmatter';
import type { Context } from '../context';
import { suggest } from '../ui/prompt';

function activeFile(app: App): TFile | null {
	const file = app.workspace.getActiveFile();
	if (!file) new Notice('No active note.');
	return file;
}

function tagsOf(app: App, file: TFile): string[] {
	return readTags(app.metadataCache.getFileCache(file)?.frontmatter?.tags);
}

/** Ask for a value on one axis. Resolves to null when dismissed. */
function ask(app: App, axis: Axis, values: readonly string[]): Promise<string | null> {
	return suggest(app, [...values], label, label(axis));
}

async function write(app: App, file: TFile, edits: [Axis, string | null][]): Promise<void> {
	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		let tags = readTags(frontmatter.tags);
		for (const [axis, value] of edits) tags = setAxis(tags, axis, value);
		frontmatter.tags = tags;
		sortKeys(frontmatter);
	});
}

/**
 * The inbox loop's only exit. Asks for whatever is missing, then turns
 * `type/inbox` into `type/filed`. A note with no type at all counts as an inbox
 * note, which is how a note written outside the loop still gets filed.
 */
export async function fileNote(context: Context, target?: TFile): Promise<void> {
	const app = context.app;
	const vocabulary = vocabularyOf(context.settings);
	const types = context.settings.types;
	const file = target ?? activeFile(app);
	if (!file) return;

	const tags = tagsOf(app, file);
	const type = axisValue(tags, 'type');
	// The role, not the word: a vault that calls its inbox "new" still has one.
	if (type !== null && roleOf(types, type) !== 'inbox') {
		new Notice(`This note is type/${type}, so it is not in the inbox loop.`);
		return;
	}

	const edits: [Axis, string | null][] = [['type', types.filed]];

	const domain = axisValue(tags, 'domain');
	if (domain === null || !isValid('domain', domain, vocabulary)) {
		const chosen = await ask(app, 'domain', vocabulary.domains);
		if (!chosen) return;
		edits.push(['domain', chosen]);
	}

	await write(app, file, edits);
}

/** One choice in the retag list: an axis, a value, and how it reads. */
interface Choice {
	axis: Axis;
	value: string | null;
	label: string;
}

/**
 * Every value on every axis, as one flat list.
 *
 * Three commands, one per axis, meant knowing which axis a value lived on
 * before you could search for it. One list means typing "liv" and getting
 * Type · Living, which is both fewer keystrokes and less to remember.
 */
function choices(vocabulary: Vocabulary): Choice[] {
	const list: Choice[] = [];
	for (const value of vocabulary.domains) list.push({ axis: 'domain', value, label: `Domain · ${label(value)}` });
	for (const role of ROLES) list.push({ axis: 'type', value: vocabulary.types[role], label: `Type · ${label(vocabulary.types[role])}` });
	return list;
}

/**
 * Set one tag on the active note. Replaces the three per-axis commands, which
 * were three palette entries for what is really one question: what should this
 * note be tagged.
 */
export async function retag(context: Context): Promise<void> {
	const app = context.app;
	const file = activeFile(app);
	if (!file) return;

	const chosen = await suggest(app, choices(vocabularyOf(context.settings)), (choice) => choice.label, 'Tag as');
	if (!chosen) return;

	await write(app, file, [[chosen.axis, chosen.value]]);
	new Notice(`${file.basename}\n${chosen.label}`);
}
