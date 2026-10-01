# Security policy

## Supported versions

Security fixes go into the latest release of Paper Trail. Older releases don't
get separate fixes, so please update before you report.

## Reporting a problem

Please don't open a public issue for a security problem. Report it privately
through GitHub instead:

https://github.com/jorritvanderheide/obsidian-paper-trail/security/advisories/new

Include the Paper Trail, Obsidian and Zotero versions, your operating system,
and the steps to reproduce it. Reports are looked at before anything about them
is made public.

## What counts

Paper Trail talks to Zotero's local server on `127.0.0.1:23119` and writes to
the notes in your vault, as listed in
[section 13 of the README](README.md#13-network-and-file-disclosure). Anything
that makes it connect somewhere else, read or write files outside your vault,
or run code that came from a paper's metadata or annotations is a security
problem.

A bug that changes or loses text in your notes is serious too, but it isn't
secret: please report that as a normal issue, so others can see it.
