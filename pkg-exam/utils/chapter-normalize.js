function normalizeChapterRef(value) {
  let s = String(value || '').trim();
  if (!s) return '';

  // Source data may contain mixed/full-width punctuation and random spaces.
  s = s
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, '')
    .replace(/[／∕]/g, '/')
    .replace(/[．。]/g, '.')
    .replace(/[（）]/g, (m) => (m === '（' ? '(' : ')'))
    .replace(/[﹥＞]/g, '>')
    .replace(/[﹤＜]/g, '<')
    .replace(/[：﹕]/g, ':');
  // Normalize appendix Roman numerals case, e.g. 附錄Vi -> 附錄VI.
  s = s.replace(/附錄([ivxlcdm]+)/gi, (_, roman) => `附錄${String(roman).toUpperCase()}`);

  return s;
}

function isGuideRef(normalized) {
  return normalized.indexOf('註冊中介人操守要求指引') >= 0;
}

function getChapterGroupKey(chapter) {
  const normalized = normalizeChapterRef(chapter);
  if (!normalized) return '';
  if (isGuideRef(normalized)) return '<註冊中介人操守要求指引>';
  if (normalized.indexOf('2017年補充資料') === 0) return '2017年補充資料';
  const leading = normalized.match(/^(\d+)/);
  if (leading) return leading[1];
  const idx = normalized.indexOf('.');
  if (idx < 0) return normalized;
  const key = normalized.slice(0, idx);
  return key || normalized;
}

module.exports = {
  normalizeChapterRef,
  getChapterGroupKey,
};
