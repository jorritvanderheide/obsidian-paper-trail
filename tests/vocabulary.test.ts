import { describe, expect, it } from 'vitest';
import {
	DEFAULT_VOCABULARY,
	DOMAIN,
	TYPE,
	axisValue,
	isValid,
	label,
	parseValues,
	readTags,
	roleOf,
	setAxis,
	typeForNewNote,
} from '../src/core/vocabulary';

describe('isValid', () => {
	it('accepts a value on its own axis', () => {
		expect(isValid('domain', 'research')).toBe(true);
		expect(isValid('type', 'living')).toBe(true);
	});

	it('refuses a nested value', () => {
		expect(isValid('domain', 'research/wp1')).toBe(false);
	});

	it('refuses a value from another axis', () => {
		expect(isValid('domain', 'article')).toBe(false);
	});
});

describe('label', () => {
	it('spells out the acronyms', () => {
		expect(label('phd')).toBe('PhD');
		expect(label('ai')).toBe('AI');
	});

	it('capitalises the rest', () => {
		expect(label('prototype')).toBe('Prototype');
	});
});

describe('axisValue', () => {
	it('picks the value off its axis', () => {
		expect(axisValue(['domain/phd', 'type/inbox'], 'type')).toBe('inbox');
	});

	it('is null when the axis is absent', () => {
		expect(axisValue(['type/inbox'], 'domain')).toBeNull();
	});
});

describe('setAxis', () => {
	it('replaces the value already on the axis', () => {
		expect(setAxis(['domain/vault', 'type/inbox'], 'domain', 'phd')).toEqual(['domain/phd', 'type/inbox']);
	});

	it('adds the axis when it is missing', () => {
		expect(setAxis(['type/inbox'], 'domain', 'research')).toEqual(['domain/research', 'type/inbox']);
	});

	it('drops the axis with null, which is how a note gets no source', () => {
		expect(setAxis(['domain/research', 'type/filed'], 'domain', null)).toEqual(['type/filed']);
	});

	it('sorts, because the Linter does', () => {
		expect(setAxis(['type/inbox'], 'domain', 'phd')).toEqual(['domain/phd', 'type/inbox']);
	});

	it('files an inbox note without disturbing the other axes', () => {
		expect(setAxis(['domain/phd', 'type/inbox'], 'type', 'filed')).toEqual([
			'domain/phd',
			'type/filed',
		]);
	});
});

describe('readTags', () => {
	it('takes a list as it is', () => {
		expect(readTags(['domain/phd', 'type/inbox'])).toEqual(['domain/phd', 'type/inbox']);
	});

	it('splits the inline form', () => {
		expect(readTags('domain/phd, type/inbox')).toEqual(['domain/phd', 'type/inbox']);
	});

	it('is empty when there are no tags', () => {
		expect(readTags(undefined)).toEqual([]);
		expect(readTags(null)).toEqual([]);
	});

	it('drops entries that are not strings', () => {
		expect(readTags(['domain/phd', 3, null])).toEqual(['domain/phd']);
	});
});

describe('parseDomains', () => {
	it('splits a comma separated list', () => {
		expect(parseValues('research, teaching, admin', DOMAIN)).toEqual(['research', 'teaching', 'admin']);
	});

	it('takes a list as it is', () => {
		expect(parseValues(['research', 'teaching'], DOMAIN)).toEqual(['research', 'teaching']);
	});

	it('lowercases and hyphenates, so the value is a usable tag', () => {
		expect(parseValues('Side Projects', DOMAIN)).toEqual(['side-projects']);
	});

	it('flattens a nested value rather than dropping what was typed', () => {
		expect(parseValues('research/wp1', DOMAIN)).toEqual(['researchwp1']);
	});

	it('drops duplicates and blanks', () => {
		expect(parseValues('research, , research,  ,teaching', DOMAIN)).toEqual(['research', 'teaching']);
	});

	it('falls back rather than leaving filing with nothing to offer', () => {
		expect(parseValues('', DOMAIN)).toEqual([...DOMAIN]);
		expect(parseValues('   ,  ', DOMAIN)).toEqual([...DOMAIN]);
		expect(parseValues(null, DOMAIN)).toEqual([...DOMAIN]);
	});

	it('validates against the list it is given, not the shipped one', () => {
		const mine = { ...DEFAULT_VOCABULARY, domains: ['fieldwork'] };
		expect(isValid('domain', 'fieldwork', mine)).toBe(true);
		expect(isValid('domain', 'research', mine)).toBe(false);
	});
});

describe('roles', () => {
	const mine = { inbox: 'new', filed: 'sorted', living: 'evergreen' };

	it('reads the part a value plays, not the word', () => {
		expect(roleOf(mine, 'new')).toBe('inbox');
		expect(roleOf(mine, 'sorted')).toBe('filed');
		expect(roleOf(mine, 'evergreen')).toBe('living');
	});

	it('does not recognise the default names once they are renamed', () => {
		// The whole point: the workflow follows the configuration, and a note
		// still tagged with the old word is an orphan rather than an inbox note.
		expect(roleOf(mine, 'inbox')).toBeNull();
	});

	it('is null for a value on no role, and for no value', () => {
		expect(roleOf(TYPE, 'archived')).toBeNull();
		expect(roleOf(TYPE, null)).toBeNull();
	});

	it('names the parts after themselves by default', () => {
		expect(roleOf(TYPE, 'inbox')).toBe('inbox');
		expect(roleOf(TYPE, 'filed')).toBe('filed');
		expect(roleOf(TYPE, 'living')).toBe('living');
	});
});

/**
 * Filing is the ordering principle, so a new note joins the loop unless its
 * template explicitly opted out.
 */
describe('typeForNewNote', () => {
	const types = { inbox: 'inbox', filed: 'filed', living: 'living' };

	it('keeps a type the template declared', () => {
		expect(typeForNewNote(['type/living'], types)).toBe('living');
		expect(typeForNewNote(['type/inbox'], types)).toBe('inbox');
	});

	it('puts a template that declared nothing into the loop', () => {
		expect(typeForNewNote([], types)).toBe('inbox');
		expect(typeForNewNote(['domain/research'], types)).toBe('inbox');
	});

	it('puts a template naming a type nothing recognises into the loop', () => {
		// A note tagged with a word the vocabulary lost is a note the workflow
		// cannot see, which is the one outcome filing exists to prevent.
		expect(typeForNewNote(['type/scratch'], types)).toBe('inbox');
	});

	it('follows a renamed vocabulary rather than the shipped words', () => {
		const mine = { inbox: 'new', filed: 'sorted', living: 'evergreen' };
		expect(typeForNewNote([], mine)).toBe('new');
		expect(typeForNewNote(['type/evergreen'], mine)).toBe('evergreen');
		expect(typeForNewNote(['type/living'], mine)).toBe('new');
	});
});
