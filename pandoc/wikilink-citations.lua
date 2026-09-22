--- Turn Obsidian wikilinks into pandoc citations.
---
--- Paper Trail writes a citation as `[[citekey]]` rather than `[@citekey]`.
--- That is a link, so inside the vault it resolves, opens the paper, previews
--- it on hover, and puts every use of a source into that source's backlinks,
--- which is the question a thesis asks of its own corpus. Outside the vault it
--- is not a citation yet. This is what makes it one.
---
--- Usage, and the order matters:
---
---   pandoc chapter.md \
---     --from=markdown+wikilinks_title_after_pipe \
---     --lua-filter=pandoc/wikilink-citations.lua \
---     --bibliography=Literature/library.bib \
---     --citeproc \
---     --output=chapter.docx
---
--- `--from` because pandoc does not read `[[...]]` as anything at all without
--- it, and the filter would have nothing to work on. The filter before
--- `--citeproc` because pandoc runs them in the order you write them, and
--- citeproc can only resolve citations that already exist when it runs.

local keys = {}

--- Every entry key in a .bib file.
---
--- Read rather than guessed, and this is the whole of the filter's judgement.
--- Every wikilink in a vault is a link: to a paper, to a concept note, to
--- yesterday's daily note. Only the ones naming an entry in the bibliography
--- are citations. Without this check a link to your own writing would come out
--- as a citation to a work that does not exist, and citeproc would either drop
--- it or print a bracketed question mark into the middle of a sentence.
local function read_bib(path)
  local file = io.open(path, 'r')
  if not file then
    io.stderr:write('wikilink-citations: could not read ' .. path .. '\n')
    return
  end
  for line in file:lines() do
    -- `@article{key,` and every other entry type. Anything indented or inside
    -- a field cannot match, because the @ has to open the line.
    local key = line:match('^%s*@%w+%s*[{(]%s*([^,%s]+)%s*,')
    if key then keys[key] = true end
  end
  file:close()
end

--- The bibliographies pandoc was given, however they were given.
---
--- `--bibliography=x` sets this metadata field, and so does a `bibliography:`
--- line in the document's own front matter. Either can be one path or a list,
--- so both shapes are unwrapped here rather than at the call site.
local function load(meta)
  local bibliography = meta.bibliography
  if not bibliography then
    io.stderr:write('wikilink-citations: no bibliography, so no wikilink is a citation\n')
    return nil
  end

  if bibliography.t == 'MetaList' then
    for _, entry in ipairs(bibliography) do read_bib(pandoc.utils.stringify(entry)) end
  else
    read_bib(pandoc.utils.stringify(bibliography))
  end
  return nil
end

--- The citation key a wikilink target names, or nil when it names none.
---
--- Obsidian writes the target three ways depending on a setting nobody
--- remembers choosing: bare, with the folder in front, and occasionally with
--- the extension. A heading or block reference can follow. All of them are the
--- same paper, so all of them are the same citation.
local function key_of(target)
  local path = target:gsub('[#^].*$', '')
  local name = path:match('([^/]+)$') or path
  return (name:gsub('%.md$', ''))
end

--- Whether a link still means anything once the vault is behind you.
---
--- A scheme means something outside this document knows how to resolve it: a
--- reader can follow `https:`, and their machine can follow `zotero:`. A `#`
--- means somewhere in the exported document itself. Everything else points at a
--- file in the vault, which the export does not have and will never have.
local function reachable(target)
  return target:match('^%a[%w+.-]*:') ~= nil or target:sub(1, 1) == '#'
end

--- One link: a citation, a link, or the words it was made of.
---
--- `NormalCitation` rather than `AuthorInText`, because `[[key]]` stands in a
--- sentence where `[@key]` would, and nothing in the link says whether the
--- author was named in the prose. Anyone wanting "as Keshav (2007) argues" can
--- still write `@key` by hand; pandoc reads that already.
---
--- A link to one of your own notes is unwrapped rather than kept, because a
--- link is a promise that something is at the other end. In the vault there is.
--- In a Word file handed to a supervisor there is a dead reference to a path on
--- your laptop, and the reader finds that out by clicking it. The words stay,
--- which is all the sentence needed from it: whether that is the note's name or
--- a label you wrote, it is what you chose to have on the page.
local function link(el)
  local key = key_of(el.target)
  if keys[key] then
    return pandoc.Cite({ pandoc.Str('@' .. key) }, { pandoc.Citation(key, 'NormalCitation') })
  end

  if reachable(el.target) then return nil end
  return el.content
end

-- Two passes, in this order, and not one filter with both functions in it: a
-- single filter walks inlines before it reaches the metadata, so every link
-- would be tested against a bibliography that had not been read yet.
return {
  { Meta = load },
  { Link = link },
}
