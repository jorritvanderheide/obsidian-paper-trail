import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_VERSION, loadSettings, migrate } from '../src/core/settings';

describe('loadSettings', () => {
	it('fills in defaults', () => {
		expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
	});

	it('keeps valid data and drops invalid entries', () => {
		const settings = loadSettings({
			keyField: ' citekey ',
			apiPort: 99999,
			attachments: { ABCD2345: 'EFGH2345', bad: 3 },
		});
		expect(settings.keyField).toBe('citekey');
		expect(settings.apiPort).toBe(23119);
		expect(settings.attachments).toEqual({ ABCD2345: 'EFGH2345' });
	});
});

describe('loadSettings, the address fields', () => {
	it('trims, because a stray space in a folder name is a silent miss', () => {
		expect(loadSettings({ notesFolder: '  Nota  ' }).notesFolder).toBe('Nota');
	});

	it('falls back when a field is blanked, rather than pointing at nothing', () => {
		expect(loadSettings({ notesFolder: '   ', claimHeading: '', assessmentHeading: '  ' })).toMatchObject({
			notesFolder: 'Notes',
			claimHeading: 'Claim',
			assessmentHeading: 'Assessment',
		});
	});

	it('keeps an empty data directory, where empty means ask Zotero', () => {
		expect(loadSettings({ dataDir: '' }).dataDir).toBe('');
	});
});

describe('versioning', () => {
	it('stamps the current version on fresh settings', () => {
		expect(loadSettings(null).version).toBe(SETTINGS_VERSION);
	});

	it('treats data written before versioning as version 0', () => {
		expect(migrate({ notesFolder: 'Notes' })).toMatchObject({ version: SETTINGS_VERSION });
	});

	it('leaves already-current data alone', () => {
		const current = { version: SETTINGS_VERSION, notesFolder: 'Nota' };
		expect(migrate(current)).toBe(current);
	});

	it('does not lose a setting while migrating', () => {
		expect(migrate({ notesFolder: 'Nota', papersFolder: 'Papers' })).toMatchObject({
			notesFolder: 'Nota',
			papersFolder: 'Papers',
		});
	});

	it('upgrades on load, so a saved file never has to be touched by hand', () => {
		expect(loadSettings({ notesFolder: 'Nota' })).toMatchObject({ version: SETTINGS_VERSION, notesFolder: 'Nota' });
	});
});


describe('domains as a setting', () => {
	it('defaults to the shipped list', () => {
		expect(loadSettings(null).domains).toEqual(['research', 'teaching', 'admin', 'personal']);
	});

	it('takes what was typed', () => {
		expect(loadSettings({ domains: 'fieldwork, writing' }).domains).toEqual(['fieldwork', 'writing']);
	});
});

/**
 * The settings tab writes values back through `loadSettings`, so anything the
 * loader coerces or rejects is coerced or rejected on the way in too. These
 * pin the cases a text box can produce.
 */
describe('a value written back is a value the loader would accept', () => {
	it('coerces a port typed into a text box, which arrives as a string', () => {
		expect(loadSettings({ apiPort: '24119' }).apiPort).toBe(24119);
	});

	it('falls back rather than storing a port that is not a number', () => {
		// Stored verbatim, every request goes to a malformed URL and reports
		// itself as "could not reach Zotero", which blames the wrong thing.
		expect(loadSettings({ apiPort: '2311x' }).apiPort).toBe(23119);
		expect(loadSettings({ apiPort: '' }).apiPort).toBe(23119);
	});

	it('refuses a port outside the range a port can be', () => {
		expect(loadSettings({ apiPort: '0' }).apiPort).toBe(23119);
		expect(loadSettings({ apiPort: '70000' }).apiPort).toBe(23119);
	});

	it('trims a folder someone typed with a trailing space', () => {
		expect(loadSettings({ papersFolder: 'Literature ' }).papersFolder).toBe('Literature');
	});

	it('is idempotent, so writing settings back repeatedly cannot drift', () => {
		const once = loadSettings({ apiPort: '24119', papersFolder: ' Papers ' });
		expect(loadSettings(once)).toEqual(once);
	});
});
