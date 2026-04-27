const PAPER_BLUEPRINTS = {
  '卷一': {
    paperId: 'paper1-random-mock',
    title: '卷一随机模拟试卷',
    total: 75,
    durationMinutes: 120,
    chapterCounts: { '1': 9, '2': 12, '3': 22, '4': 7, '5': 4, '6': 16, '7': 5 },
  },
  '卷二': {
    paperId: 'paper2-random-mock',
    title: '卷二随机模拟试卷',
    total: 50,
    durationMinutes: 75,
    chapterCounts: { '1': 23, '2': 17, '3': 5, '4': 5 },
  },
  '卷三': {
    paperId: 'paper3-random-mock',
    title: '卷三随机模拟试卷',
    total: 50,
    durationMinutes: 75,
    chapterCounts: { '1': 5, '2': 10, '3': 12, '4': 12, '5': 11 },
  },
  '卷四': {
    paperId: 'paper4-random-mock',
    title: '卷四随机模拟试卷',
    total: 80,
    durationMinutes: 120,
    chapterCounts: { '1': 1, '2': 4, '3': 36, '4': 4, '5': 15, '6': 4, '7': 16 },
  },
  '卷五': {
    paperId: 'paper5-random-mock',
    title: '卷五随机模拟试卷',
    total: 80,
    durationMinutes: 120,
    chapterCounts: { '1': 2, '2': 16, '3': 28, '4': 26, '5': 8 },
  },
};
const { getChapterGroupKey } = require('./chapter-normalize');

const DYNAMIC_PAPERS = Object.keys(PAPER_BLUEPRINTS).map((type) => {
  const spec = PAPER_BLUEPRINTS[type];
  return {
    id: spec.paperId,
    type,
    title: spec.title,
    premium: true,
    isMock: true,
    isDynamicMock: true,
    total: spec.total,
  };
});

const PAPER_BY_ID = DYNAMIC_PAPERS.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

let api = null;
const memoryStore = {};

function configureRandomMockPaperAPI(nextApi) {
  api = nextApi || null;
}

function getDynamicMockPapersByType(type) {
  return DYNAMIC_PAPERS.filter((item) => item.type === type).map((item) => ({ ...item }));
}

function getDynamicMockPaperById(paperId) {
  const item = PAPER_BY_ID[String(paperId || '')];
  return item ? { ...item } : null;
}

function isDynamicMockPaperId(paperId) {
  return !!PAPER_BY_ID[String(paperId || '')];
}

function getActiveSessionStorageKey(paperId) {
  return `iiqe_dynamic_mock_session_${paperId}`;
}

function getProgressStorageKey(paperId) {
  return `iiqe_progress_${paperId}`;
}

function getDurationMsByPaperId(paperId) {
  const paper = getDynamicMockPaperById(paperId);
  if (!paper) return 0;
  const spec = PAPER_BLUEPRINTS[paper.type];
  const minutes = Number(spec && spec.durationMinutes) || 0;
  return minutes > 0 ? minutes * 60 * 1000 : 0;
}

function safeGetStorage(key) {
  if (typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function') {
    return wx.getStorageSync(key);
  }
  return memoryStore[key];
}

function safeSetStorage(key, value) {
  if (typeof wx !== 'undefined' && wx && typeof wx.setStorageSync === 'function') {
    wx.setStorageSync(key, value);
    return;
  }
  memoryStore[key] = value;
}

function getPaperByIdOrNull(paperId) {
  if (!api || typeof api.getPaperById !== 'function') return null;
  return api.getPaperById(paperId);
}

function getPapersByTypeOrEmpty(type) {
  if (!api || typeof api.getPapersByType !== 'function') return [];
  return api.getPapersByType(type) || [];
}

function getQuestionsByPaperIdOrEmpty(paperId) {
  if (!api || typeof api.getQuestionsByPaperId !== 'function') return [];
  return api.getQuestionsByPaperId(paperId) || [];
}

function getChapterNo(question) {
  return String(getChapterGroupKey((question && question.chapter) || '') || '');
}

function isGuideQuestion(question) {
  return getChapterNo(question) === '<註冊中介人操守要求指引>';
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandomItems(pool, count) {
  if (count <= 0) return [];
  if (!Array.isArray(pool) || !pool.length) return [];
  const arr = shuffle(pool);
  return arr.slice(0, Math.min(count, arr.length));
}

function buildSessionQuestions(paperId) {
  const paper = getDynamicMockPaperById(paperId);
  if (!paper) return [];
  const spec = PAPER_BLUEPRINTS[paper.type];
  if (!spec) return [];

  const sourcePapers = getPapersByTypeOrEmpty(paper.type).filter((item) => !!item.isMock && !isDynamicMockPaperId(item.id));
  const allSourceRows = [];
  sourcePapers.forEach((sourcePaper) => {
    const rows = getQuestionsByPaperIdOrEmpty(sourcePaper.id);
    rows.forEach((q) => {
      if (isGuideQuestion(q)) return;
      allSourceRows.push({
        ...q,
        __sourcePaperId: sourcePaper.id,
      });
    });
  });

  const byChapter = {};
  allSourceRows.forEach((row) => {
    const key = getChapterNo(row);
    if (!key) return;
    if (!byChapter[key]) byChapter[key] = [];
    byChapter[key].push(row);
  });

  const selected = [];
  const used = new Set();
  Object.keys(spec.chapterCounts).forEach((chapterNo) => {
    const need = Number(spec.chapterCounts[chapterNo]) || 0;
    const pool = (byChapter[chapterNo] || []).filter((row) => !used.has(row.id));
    const picked = pickRandomItems(pool, need);
    picked.forEach((row) => {
      used.add(row.id);
      selected.push(row);
    });
  });

  if (selected.length < spec.total) {
    const fillPool = allSourceRows.filter((row) => !used.has(row.id));
    const fills = pickRandomItems(fillPool, spec.total - selected.length);
    fills.forEach((row) => {
      used.add(row.id);
      selected.push(row);
    });
  }

  return shuffle(selected).slice(0, spec.total).map((row, idx) => ({
    id: `${paperId}-${String(idx + 1).padStart(3, '0')}`,
    no: idx + 1,
    chapter: row.chapter,
    stem: row.stem,
    options: Array.isArray(row.options) ? [...row.options] : [],
    answer: row.answer,
    explain: row.explain || '',
    sourceQuestionId: row.id,
    sourcePaperId: row.__sourcePaperId || '',
  }));
}

function createSession(paperId) {
  const durationMs = getDurationMsByPaperId(paperId);
  const questions = buildSessionQuestions(paperId);
  const session = {
    sessionId: `${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
    createdAt: Date.now(),
    submitted: false,
    submitReason: '',
    submittedAt: 0,
    durationMs,
    remainingMs: durationMs,
    questions,
  };
  safeSetStorage(getActiveSessionStorageKey(paperId), session);
  safeSetStorage(getProgressStorageKey(paperId), {
    answers: {},
    correctCount: 0,
    favorites: [],
    wrongIds: [],
  });
  return session;
}

function getActiveSession(paperId) {
  if (!isDynamicMockPaperId(paperId)) return null;
  const saved = safeGetStorage(getActiveSessionStorageKey(paperId)) || {};
  if (saved && Array.isArray(saved.questions) && saved.questions.length && !saved.submitted) return saved;
  return createSession(paperId);
}

function prepareDynamicMockSession(paperId, options = {}) {
  if (!isDynamicMockPaperId(paperId)) return null;
  const force = !!(options && options.force);
  if (!force) {
    const saved = safeGetStorage(getActiveSessionStorageKey(paperId)) || {};
    if (saved && Array.isArray(saved.questions) && saved.questions.length && !saved.submitted) return saved;
  }
  return createSession(paperId);
}

function getActiveDynamicMockSessionId(paperId) {
  const session = getActiveSession(paperId);
  return session && session.sessionId ? String(session.sessionId) : '';
}

function getDynamicMockSessionQuestions(paperId) {
  const session = getActiveSession(paperId);
  return session && Array.isArray(session.questions) ? session.questions.map((q) => ({ ...q })) : [];
}

function getDynamicMockSessionState(paperId) {
  const session = getActiveSession(paperId);
  if (!session) return null;
  return {
    sessionId: String(session.sessionId || ''),
    durationMs: Number(session.durationMs || 0),
    remainingMs: Math.max(0, Number(session.remainingMs || 0)),
    submitted: !!session.submitted,
    submitReason: String(session.submitReason || ''),
    submittedAt: Number(session.submittedAt || 0),
  };
}

function updateDynamicMockRemainingMs(paperId, remainingMs) {
  if (!isDynamicMockPaperId(paperId)) return null;
  const key = getActiveSessionStorageKey(paperId);
  const saved = safeGetStorage(key) || {};
  if (!saved || !Array.isArray(saved.questions) || !saved.questions.length) return null;
  const next = {
    ...saved,
    remainingMs: Math.max(0, Number(remainingMs || 0)),
  };
  safeSetStorage(key, next);
  return next;
}

function markDynamicMockSessionSubmitted(paperId, reason = 'manual') {
  if (!isDynamicMockPaperId(paperId)) return null;
  const key = getActiveSessionStorageKey(paperId);
  const saved = safeGetStorage(key) || {};
  if (!saved || !Array.isArray(saved.questions) || !saved.questions.length) return null;
  const next = {
    ...saved,
    submitted: true,
    submitReason: String(reason || 'manual'),
    submittedAt: Date.now(),
  };
  safeSetStorage(key, next);
  return next;
}

module.exports = {
  configureRandomMockPaperAPI,
  getDynamicMockPapersByType,
  getDynamicMockPaperById,
  getDynamicMockSessionQuestions,
  getDynamicMockSessionState,
  updateDynamicMockRemainingMs,
  markDynamicMockSessionSubmitted,
  getDurationMsByPaperId,
  getActiveDynamicMockSessionId,
  isDynamicMockPaperId,
  prepareDynamicMockSession,
};
