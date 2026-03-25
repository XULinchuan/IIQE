const {
  getPapersByType,
  getQuestionsByPaperId,
  chapterTitleMap,
} = require('./exam-data');

function getProgressKey(paperId) {
  return `iiqe_progress_${paperId}`;
}

function initProgress() {
  return {
    answers: {},
    correctCount: 0,
    favorites: [],
    wrongIds: [],
  };
}

function getPaperProgress(paperId) {
  return wx.getStorageSync(getProgressKey(paperId)) || initProgress();
}

function getVolumePapers(volumeId) {
  return getPapersByType(volumeId) || [];
}

function hasVolumePremium(volumeId) {
  return getVolumePapers(volumeId).some((paper) => !!paper.premium);
}

function getChapterNo(chapter) {
  return String(chapter || '').split('.')[0] || '';
}

function chapterSortKey(chapterNo) {
  const raw = String(chapterNo || '');
  const match = raw.match(/^(\d+)(.*)$/);
  if (!match) return { num: Number.MAX_SAFE_INTEGER, suffix: raw };
  return {
    num: Number(match[1]),
    suffix: match[2] || '',
  };
}

function compareChapterNo(a, b) {
  const ak = chapterSortKey(a);
  const bk = chapterSortKey(b);
  if (ak.num !== bk.num) return ak.num - bk.num;
  return ak.suffix.localeCompare(bk.suffix, 'zh-Hant');
}

function questionNoSortValue(no) {
  const n = Number(no);
  if (Number.isFinite(n)) return n;
  const raw = String(no || '');
  const match = raw.match(/(\d+)/);
  if (match) return Number(match[1]);
  return Number.MAX_SAFE_INTEGER;
}

function matchChapter(chapter, chapterNo) {
  const raw = String(chapter || '');
  const target = String(chapterNo || '');
  if (!target || target === 'all') return true;
  return (
    raw === target
    || raw.startsWith(`${target}.`)
    || raw.startsWith(`${target}(`)
  );
}

function sortVolumeQuestions(list) {
  return [...list].sort((a, b) => {
    const ca = getChapterNo(a.chapter);
    const cb = getChapterNo(b.chapter);
    const chapterCmp = compareChapterNo(ca, cb);
    if (chapterCmp !== 0) return chapterCmp;
    const na = questionNoSortValue(a.no);
    const nb = questionNoSortValue(b.no);
    if (na !== nb) return na - nb;
    return String(a.id || '').localeCompare(String(b.id || ''), 'zh-Hant');
  });
}

function getCollectionIds(progress, type) {
  if (type === 'favorite') return progress.favorites || [];
  return progress.wrongIds || [];
}

function getVolumeCollectionQuestions(volumeId, type, chapterNo = 'all') {
  const papers = getVolumePapers(volumeId);
  const rows = [];
  papers.forEach((paper) => {
    const progress = getPaperProgress(paper.id);
    const selectedIds = new Set(getCollectionIds(progress, type));
    if (!selectedIds.size) return;
    const questions = getQuestionsByPaperId(paper.id);
    questions.forEach((q) => {
      if (!selectedIds.has(q.id)) return;
      if (!matchChapter(q.chapter, chapterNo)) return;
      rows.push({
        ...q,
        sourcePaperId: paper.id,
        sourcePaperTitle: paper.title,
      });
    });
  });
  return sortVolumeQuestions(rows);
}

function getVolumeCollectionSummary(volumeId, type) {
  const questions = getVolumeCollectionQuestions(volumeId, type, 'all');
  const progressCache = {};
  const chapterMap = {};
  let answered = 0;
  let correct = 0;

  questions.forEach((q) => {
    const sourcePaperId = q.sourcePaperId;
    if (!progressCache[sourcePaperId]) {
      progressCache[sourcePaperId] = getPaperProgress(sourcePaperId);
    }
    const progress = progressCache[sourcePaperId];
    const answers = progress.answers || {};
    const chapterNo = getChapterNo(q.chapter);
    if (!chapterMap[chapterNo]) {
      chapterMap[chapterNo] = {
        chapterNo,
        title: chapterTitleMap[chapterNo] || `第${chapterNo}章`,
        total: 0,
        answered: 0,
        correct: 0,
      };
    }
    const row = chapterMap[chapterNo];
    row.total += 1;
    if (Object.prototype.hasOwnProperty.call(answers, q.id)) {
      row.answered += 1;
      answered += 1;
      if (answers[q.id] === q.answer) {
        row.correct += 1;
        correct += 1;
      }
    }
  });

  const chapterStats = Object.values(chapterMap)
    .sort((a, b) => compareChapterNo(a.chapterNo, b.chapterNo))
    .map((item) => ({
      ...item,
      accuracy: item.answered ? `${Math.round((item.correct / item.answered) * 100)}%` : '0%',
    }));

  const total = questions.length;
  const accuracy = answered ? `${Math.round((correct / answered) * 100)}%` : '0%';
  return {
    total,
    answered,
    correct,
    accuracy,
    chapterStats,
  };
}

module.exports = {
  getVolumePapers,
  hasVolumePremium,
  getVolumeCollectionQuestions,
  getVolumeCollectionSummary,
  getChapterNo,
  compareChapterNo,
};

