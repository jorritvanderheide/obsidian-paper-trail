// Zotero's local server drops any request that looks like it came from a web
// page, one with a `Mozilla/` user agent or an Origin header, so that sites
// cannot read your library. Obsidian's requestUrl sends both, so talk to it
// with Node's http instead, which sends neither.
import { get } from 'http';

/**
 * Zotero's local server, which is always here. The port is fixed in Zotero and
 * has no setting in its interface, so asking for it was a text box nobody
 * would ever have a reason to touch.
 */
const PORT = 23119;

/**
 * Only the headers anything here reads. Zotero puts the library's version and
 * the size of the result set on every response, and both answer questions that
 * would otherwise cost their own request.
 */
export interface Headers {
	/** The library version this answer reflects, for asking what changed after it. */
	version: number;
	/**
	 * How many objects match the request, not how many this page holds.
	 *
	 * Scoped to the query and not to the library, which is easy to read the
	 * wrong way round: on a `?since=` request this counts what has changed, and
	 * is nothing like the number of items Zotero holds.
	 */
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

export function getText(path: string, timeout = TIMEOUT): Promise<Response> {
	return new Promise((resolve, reject) => {
		// Zotero listens on IPv4 only, and localhost may resolve to ::1 first.
		const request = get({ host: '127.0.0.1', port: PORT, path, headers: { Accept: 'application/json' } }, (response) => {
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

export async function getJson(path: string): Promise<JsonResponse> {
	const { status, body, headers } = await getText(path);
	let json: unknown = null;
	try {
		json = JSON.parse(body);
	} catch {
		// Error responses are plain text.
	}
	return { status, json, headers };
}
