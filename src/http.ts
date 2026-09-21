// Zotero's local server drops any request that looks like it came from a web
// page, one with a `Mozilla/` user agent or an Origin header, so that sites
// cannot read your library. Obsidian's requestUrl sends both, so talk to it
// with Node's http instead, which sends neither.
import { get } from 'http';

/**
 * Only the headers anything here reads. Zotero puts the library's version and
 * the size of the result set on every response, and both answer questions that
 * would otherwise cost their own request.
 */
export interface Headers {
	/** The library version this answer reflects, for asking what changed after it. */
	version: number;
	/** How many items are in the whole set, not just this page of it. */
	total: number;
}

export interface Response {
	status: number;
	body: string;
	headers: Headers;
}

export interface JsonResponse {
	status: number;
	json: unknown;
	headers: Headers;
}

/** Five seconds is plenty for a database read on localhost. */
const TIMEOUT = 5000;

export function getText(port: number, path: string, timeout = TIMEOUT): Promise<Response> {
	return new Promise((resolve, reject) => {
		// Zotero listens on IPv4 only, and localhost may resolve to ::1 first.
		const request = get({ host: '127.0.0.1', port, path, headers: { Accept: 'application/json' } }, (response) => {
			let body = '';
			response.setEncoding('utf8');
			response.on('data', (chunk: string) => (body += chunk));
			response.on('end', () =>
				resolve({
					status: response.statusCode ?? 0,
					body,
					headers: {
						version: Number(response.headers['last-modified-version'] ?? 0),
						total: Number(response.headers['total-results'] ?? 0),
					},
				}),
			);
		});
		if (timeout > 0) request.setTimeout(timeout, () => request.destroy(new Error('Timed out')));
		request.on('error', reject);
	});
}

export async function getJson(port: number, path: string): Promise<JsonResponse> {
	const { status, body, headers } = await getText(port, path);
	let json: unknown = null;
	try {
		json = JSON.parse(body);
	} catch {
		// Error responses are plain text.
	}
	return { status, json, headers };
}
