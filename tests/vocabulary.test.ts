import { describe, expect, it } from 'vitest';
import {
	DEFAULT_VOCABULARY,
	DOMAIN,
	axisValue,
	isValid,
	label,
	parseValues,
	readTags,
	setAxis,
} from '../src/core/vocabulary';

describe('isValid', () => {
	it('accepts a value on its own axis', () => {
		expect(isValid('domain', 'research')).toBe(true);

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
		expect(axisValue(['type/inbox', 'domain/phd'], 'domain')).toBe('phd');
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
