// Bible Livre identifiers are local metadata, not user input or Scripture quotes.
// Never guess verses that are absent from the licensed corpus.
const TEXT_UNIT_PATTERN = /^tu_(work_[a-z0-9]+)_([1-9][0-9]*)_([1-9][0-9]*)$/;

export function parseTextUnitId(value) {
  if (typeof value !== "string") return null;
  const match = TEXT_UNIT_PATTERN.exec(value);
  if (!match) return null;
  const chapter = Number(match[2]);
  const verse = Number(match[3]);
  if (!Number.isSafeInteger(chapter) || !Number.isSafeInteger(verse)) return null;
  return { workId: match[1], chapter, verse };
}

export function formatTextUnitReference(value, works) {
  const parsed = parseTextUnitId(value);
  if (!parsed) return "Referência não reconhecida";
  const work = works.find((item) => item.work_id === parsed.workId);
  return `${work?.title || parsed.workId} ${parsed.chapter}:${parsed.verse}`;
}
