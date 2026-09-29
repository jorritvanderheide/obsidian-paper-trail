--- Turn Obsidian wikilinks into pandoc citations.
---
--- Paper Trail writes a citation as `[[citekey]]` rather than `[@citekey]`.
--- That is a link, so inside the vault it resolves, opens the paper, previews
--- it on hover, and puts every use of a source into that source's backlinks,
--- which is the question a thesis asks of its own corpus. Outside the vault it
--- is not a citation yet. This is what makes it one.
---
--- Two things beyond a bare key:
---
--- - A page in the label, after the first comma: `[[key|key, p. 12]]` cites
---   page 12, as `[@key, p. 12]` would. That is what Insert citation writes,
---   and what the reader sees in Obsidian is what the export cites. The label
---   rather than `[[key#p. 12]]`, because Obsidian reads that as a heading and
---   its hover preview reports the section missing instead of showing the paper.
--- - Neighbouring citations share brackets: `[[a|a, p. 12]]; [[b|b, p. 3]]` is
---   "(A 2024, 12; B 2025, 3)", as `[@a, p. 12; @b, p. 3]` would be.
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
--- Locator terms, so a label is read as carrying a page only when it does:
--- `[[key|key, p. 12]]` cites page 12, `[[key|Smith, Jones]]` is just a label.
---
--- Every abbreviation Insert citation writes is here (`LOCATOR_LABELS` in
--- src/core/zotero.ts, which a test holds to this list), with the plurals and
--- the full words someone might type by hand.
local LOCATOR_TERMS = {}
for term in ([[
  p. pp. page pages
  ch. chap. chapter subch. subchapter
  sec. section subsec. subsection
  para. paragraph subpara. subparagraph
  fig. figure col. column l. ll. line
  n. note vol. volume no. issue
  art. article op. opus pt. part r. rule
  vrs. verse sv. sch. schedule tit. title
  book folio
]]):gmatch('%S+') do LOCATOR_TERMS[term] = true end

--- The page in a link's label, after its first comma, or nil when it names none.
--- The first comma rather than the last, so `key, pp. 4, 6` keeps both pages.
local function locator_of(el)
  local ref = pandoc.utils.stringify(el.content):match(",%s*(.-)%s*$")
  if not ref then return nil end
  if ref:match("^%d") or ref:match("^§") then return ref end
  local term = ref:match("^(%a+%.?)")
  if term and LOCATOR_TERMS[term:lower()] then return ref end
  return nil
end

local function link(el)
  local key = key_of(el.target)
  if keys[key] then
    local citation = pandoc.Citation(key, 'NormalCitation')
    local text = '@' .. key
    local locator = locator_of(el)
    if locator then
      citation.suffix = pandoc.Inlines(', ' .. locator)
      text = text .. ', ' .. locator
    end
    return pandoc.Cite({ pandoc.Str(text) }, { citation })
  end

  if reachable(el.target) then return nil end
  return el.content
end

--- Whether an inline is a citation that can share brackets with its neighbour.
--- `NormalCitation` only, so "Jacobs (2024) argues", written as `@key`, is never
--- pulled into the parentheses next to it.
local function groupable(el)
  if el == nil or el.t ~= "Cite" then return false end
  for _, citation in ipairs(el.citations) do
    if citation.mode ~= "NormalCitation" then return false end
  end
  return true
end

--- What may stand between two citations that belong together: spaces, a line
--- break, and at most one `;`, the separator pandoc itself uses.
local function separator(el)
  return el.t == "Space" or el.t == "SoftBreak" or (el.t == "Str" and el.text == ";")
end

--- Neighbouring citations become one: `[[a|a, p. 12]]; [[b|b, p. 3]]` exports as
--- "(A 2024, 12; B 2025, 3)", the way `[@a, p. 12; @b, p. 3]` would.
local function group(inlines)
  local out = pandoc.Inlines({})
  local i = 1
  while i <= #inlines do
    local cite = inlines[i]
    local j = i + 1
    if groupable(cite) then
      while true do
        local k, semicolons = j, 0
        while inlines[k] and separator(inlines[k]) do
          if inlines[k].t == "Str" then semicolons = semicolons + 1 end
          k = k + 1
        end
        if semicolons > 1 or not groupable(inlines[k]) then break end
        local citations = pandoc.List({})
        citations:extend(cite.citations)
        citations:extend(inlines[k].citations)
        local content = pandoc.Inlines({})
        content:extend(cite.content)
        content:extend({ pandoc.Str(";"), pandoc.Space() })
        content:extend(inlines[k].content)
        cite = pandoc.Cite(content, citations)
        j = k + 1
      end
    end
    out:insert(cite)
    i = j
  end
  return out
end

-- Three passes, in this order, and not one filter with all of them in it: a
-- single filter walks inlines before it reaches the metadata, so every link
-- would be tested against a bibliography that had not been read yet.
return {
  { Meta = load },
  { Link = link },
  { Inlines = group },
}
