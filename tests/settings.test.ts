import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_VERSION, loadSettings, migrate, retireStatusTag } from '../src/core/settings';

describe('loadSettings', () => {
	it('fills in defaults', () => {
		expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
	});

	it('keeps valid data and drops invalid entries', () => {
		expect(loadSettings({ keyField: ' citekey ' }).keyField).toBe('citekey');
	});
});

describe('loadSettings, the address fields', () => {
	it('trims, because a stray space in a folder name is a silent miss', () => {
		expect(loadSettings({ papersFolder: '  Lit  ' }).papersFolder).toBe('Lit');
	});

	it('falls back when a field is blanked, rather than pointing at nothing', () => {
		expect(loadSettings({ papersFolder: '   ', claimHeading: '', assessmentHeading: '  ' })).toMatchObject({
			papersFolder: 'Literature',
			claimHeading: 'Claim',
			assessmentHeading: 'Assessment',
		});
	});

	it('keeps an empty collection, where empty means the whole library', () => {
		expect(loadSettings({ collection: '' }).collection).toBe('');
	});

	it('is opt-in about triage, so Zotero\'s save button is the first pass by default', () => {
		expect(loadSettings(null).triage).toBe(false);
		expect(loadSettings({ triage: true }).triage).toBe(true);
		// Anything that is not a boolean is not an answer.
		expect(loadSettings({ triage: 'yes' }).triage).toBe(false);
	});
});

describe('versioning', () => {
	it('stamps the current version on fresh settings', () => {
		expect(loadSettings(null).version).toBe(SETTINGS_VERSION);
	});

	it('treats data written before versioning as version 0', () => {
		expect(migrate({ papersFolder: 'Literature' })).toMatchObject({ version: SETTINGS_VERSION });
	});

	it('leaves already-current data alone', () => {
		const current = { version: SETTINGS_VERSION, papersFolder: 'Lit' };
		expect(migrate(current)).toBe(current);
	});

	it('does not lose a setting while migrating', () => {
		expect(migrate({ papersFolder: 'Papers' })).toMatchObject({

			papersFolder: 'Papers',
		});
	});

	it('upgrades on load, so a saved file never has to be touched by hand', () => {
		expect(loadSettings({ papersFolder: 'Lit' })).toMatchObject({ version: SETTINGS_VERSION, papersFolder: 'Lit' });
	});
});

/**
 * The settings tab writes values back through `loadSettings`, so anything the
 * loader coerces or rejects is coerced or rejected on the way in too. These
 * pin the cases a text box can produce.
 */
describe('a value written back is a value the loader would accept', () => {
	it('falls back rather than storing a port that is not a number', () => {
		// Stored verbatim, every request goes to a malformed URL and reports
		// itself as "could not reach Zotero", which blames the wrong thing.
	});

	it('trims a folder someone typed with a trailing space', () => {
		expect(loadSettings({ papersFolder: 'Literature ' }).papersFolder).toBe('Literature');
	});

	it('is idempotent, so writing settings back repeatedly cannot drift', () => {
		const once = loadSettings({ papersFolder: ' Papers ' });
		expect(loadSettings(once)).toEqual(once);
	});
});

/**
 * The two settings that are preferences rather than addresses. Both are named
 * as exceptions where they are declared, so a third should have to argue.
 */
describe('the toggles', () => {
	it('shows the status pill unless you say otherwise', () => {
		expect(loadSettings(null).statusPill).toBe(true);
		expect(loadSettings({ statusPill: false }).statusPill).toBe(false);
	});

	it('takes only a boolean as an answer, on either of them', () => {
		expect(loadSettings({ statusPill: 'no' }).statusPill).toBe(true);
		expect(loadSettings({ triage: 'yes' }).triage).toBe(false);
	});
});

/**
 * The plugin remembering what it wrote, so a renamed namespace can be taken
 * back out. Not a thing anyone sets: it is written when the setting changes.
 */
describe('retireStatusTag', () => {
	const at = (statusTag: string, retiredStatusTags: string[] = []) =>
		loadSettings({ ...DEFAULT_SETTINGS, statusTag, retiredStatusTags });

	it('retires the namespace being left behind', () => {
		expect(retireStatusTag(at('literature'), 'status')).toEqual(['literature']);
	});

	it('retires it when the setting is cleared, which is when it matters most', () => {
		expect(retireStatusTag(at('literature'), '')).toEqual(['literature']);
	});

	it('keeps the ones retired earlier, because a paper may still carry any of them', () => {
		expect(retireStatusTag(at('reading', ['literature']), 'status')).toEqual(['literature', 'reading']);
	});

	// Those tags are wanted again, not owed a removal.
	it('un-retires a namespace you go back to', () => {
		expect(retireStatusTag(at('status', ['literature']), 'literature')).toEqual(['status']);
	});

	it('retires nothing when the setting was empty to begin with', () => {
		expect(retireStatusTag(at(''), 'status')).toEqual([]);
	});

	it('ignores the padding a text box leaves on what was typed', () => {
		expect(retireStatusTag(at('literature'), '  literature  ')).toEqual([]);
	});
});

describe('the retired list as it is loaded', () => {
	it('defaults to nothing', () => {
		expect(loadSettings(null).retiredStatusTags).toEqual([]);
	});

	it('drops blanks, duplicates and anything that is not a string', () => {
		const saved = { retiredStatusTags: ['status', ' status ', '', 42, null, 'literature'] };
		expect(loadSettings(saved).retiredStatusTags).toEqual(['literature', 'status']);
	});

	it('survives a saved value of the wrong shape entirely', () => {
		expect(loadSettings({ retiredStatusTags: 'status' }).retiredStatusTags).toEqual([]);
	});
});

describe('quieter notifications', () => {
	it('is off, so the plugin answers until you ask it not to', () => {
		expect(loadSettings(null).quietNotices).toBe(false);
	});

	it('takes the toggle', () => {
		expect(loadSettings({ quietNotices: true }).quietNotices).toBe(true);
	});

	it('ignores a saved value of the wrong shape', () => {
		expect(loadSettings({ quietNotices: 'yes' }).quietNotices).toBe(false);
	});
});
