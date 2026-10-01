# Zotero

Everything Paper Trail needs is on Zotero's local server, port 23119: the local
API under `/api/`, which mirrors Web API v3, and Better BibTeX under
`/better-bibtex/`. Not `zotero.sqlite`, which is locked while Zotero runs, and
not Zotero's storage folder.

## Requests

All of them are in `src/source.ts`. Paths are under `/api/`, and
`users/0` is the user's own library (group libraries use `groups/<id>`).

| Path | Used for |
| --- | --- |
| `users/0/items/top?since=<v>` | What changed since library version `v`, paged. The catch-up on focus |
| `users/0/collections/<key>/items/top?since=<v>` | The same, scoped to one collection |
| `users/0/collections` | Collection names, for the **Papers from** setting |
| `users/0/items/top?q=<query>` | **Insert citation** search |
| `users/0/items/top?sort=dateAdded&direction=desc` | **Insert citation** before anything is typed |
| `<library>/items/<key>` | One item's metadata, for writing a note |
| `<library>/items/<key>/children` | An item's attachments |
| `<library>/items/<attachment>/children?itemType=annotation` | An attachment's annotations |
| `/better-bibtex/cayw?format=json` | Better BibTeX's citation dialog. No timeout, since it waits on the user |

Zotero puts the library version and the result count on every response
(`Last-Modified-Version`, `Total-Results`), and `src/http.ts` keeps both, so
neither costs its own request.

## Quirks

**Requests that look like a web page are dropped.** Zotero refuses any request
with a `Mozilla/` user agent or an `Origin` header, so that websites cannot read
your library. Obsidian's `requestUrl` sends both. `src/http.ts` uses Node's
`http` instead, which sends neither. This is why the plugin is desktop only.

**Annotations are children of the attachment, not the item.** And on the local
API, `/children` alone omits them: `?itemType=annotation` is required. The web
API behaves differently, so code written from its documentation returns an
empty list and reports no error.

**A sort index can name only the page.** `annotationSortIndex` is page,
character offset and distance from the top, zero-padded so it sorts as text.
An annotation made on a page whose text the reader had not loaded gets offset
and top both zero, `00002|000000|00000`, and sorts to the top of its page.
Reading Mode in Zotero 10 does this. `annotations()` places those by the
rectangles in `annotationPosition` instead.

**`Total-Results` counts the query, not the library.** On a `?since=` request it
is how much changed, and nothing like the number of items Zotero holds.

**The port is fixed.** Zotero has no setting for it, so neither does Paper
Trail.

## When Zotero is not there

Every request goes through `api()` in `src/source.ts`, which records whether
Zotero answered (`lastContact`). The queue reads that to say Zotero is closed or
refusing, rather than drawing an empty list. A refused request means the local
API is off: *Allow other applications on this computer to communicate with
Zotero*, in Zotero's Settings → Advanced.

## Better BibTeX

Optional. With it, a note is named for the citation key; without it, for
author, title and year. **Insert citation** needs it, since without it there is
no key to insert. Nothing else changes.

## Not to depend on

Zotero's storage folder and `.zotero-ft-cache`. A pane once read the full-text
cache to show a paper's outline, introduction and conclusion. Measured on a real
shelf it found the conclusion once in four, because the papers that failed had
no Conclusion heading to find. Cutting it removed a data-directory setting, an
attachment cache and every filesystem call, and what is left cannot break
because a library is somewhere the plugin did not guess.
