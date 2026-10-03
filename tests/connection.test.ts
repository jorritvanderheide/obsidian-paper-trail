import { describe, expect, it } from 'vitest';
import { connectionStatus } from '../src/core/connection';

describe('connectionStatus', () => {
	it('says it is asking before anything has', () => {
		expect(connectionStatus(null, null)).toBe('Asking Zotero…');
	});

	it("says why Zotero didn't answer, whatever Better BibTeX said", () => {
		// A closed Zotero takes Better BibTeX with it, so "missing" here would send
		// you to install something you already have.
		const reason = 'Zotero is not answering. Is it running?';
		expect(connectionStatus({ reachable: false, reason }, 'missing')).toBe(reason);
		expect(connectionStatus({ reachable: false, reason }, null)).toBe(reason);
	});

	it('names papers for citation keys when Better BibTeX is there', () => {
		expect(connectionStatus({ reachable: true }, 'ready')).toMatch(/Better BibTeX is installed/);
	});

	it('says what changes without Better BibTeX, rather than calling it an error', () => {
		const text = connectionStatus({ reachable: true }, 'missing');
		expect(text).toMatch(/author, title and year/);
		expect(text).not.toMatch(/⚠/);
	});

	it('asks for patience while Better BibTeX is starting', () => {
		expect(connectionStatus({ reachable: true }, 'starting')).toMatch(/still starting/);
	});

	it('says only what it knows when Better BibTeX could not be asked', () => {
		expect(connectionStatus({ reachable: true }, null)).toBe('Zotero is answering.');
	});
});
