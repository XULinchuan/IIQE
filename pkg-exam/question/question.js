const {
  getQuestionsByPaperId,
  getPaperById,
  chapterTitleMap,
  isDynamicMockPaperId,
  getActiveDynamicMockSessionId,
  getDynamicMockSessionState,
  updateDynamicMockRemainingMs,
  markDynamicMockSessionSubmitted,
  prepareDynamicMockSession,
} = require('../utils/exam-data');
const {
  getVolumeCollectionQuestions,
  getVolumePapers,
} = require('../utils/volume-collection');
const { requireLogin } = require('../../utils/auth');
const {
  hasPremiumAccessLocal,
  isAgentLocal,
  refreshPremiumAccess,
  refreshMyAgentProfile,
} = require('../../utils/entitlement');
const { normalizeChapterRef, getChapterGroupKey } = require('../utils/chapter-normalize');

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

function shuffle(arr) {
  const list = [...arr];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function hasPaperAccess(paper) {
  if (!paper) return false;
  if (!paper.premium) return true;
  return hasPremiumAccessLocal() || isAgentLocal();
}

function inferChapterName(chapter) {
  const raw = normalizeChapterRef(chapter);
  if (!raw) return '';
  if (chapterTitleMap && chapterTitleMap[raw]) return chapterTitleMap[raw];
  const first = getChapterGroupKey(raw);
  if (chapterTitleMap && chapterTitleMap[first]) return chapterTitleMap[first];
  if (first && !/^\d+$/.test(first)) return first;
  const match = raw.match(/^(\d+)/);
  if (match) return `第${match[1]}章`;
  return '第1章';
}

function withChapterName(question) {
  if (!question) return question;
  if (question.chapterName) return question;
  return {
    ...question,
    chapterName: inferChapterName(question.chapter),
  };
}

function getStoredAnswer(questionId, progress) {
  const answers = (progress && progress.answers) || {};
  if (!Object.prototype.hasOwnProperty.call(answers, questionId)) return -1;
  const value = Number(answers[questionId]);
  if (!Number.isInteger(value) || value < 0) return -1;
  return value;
}

function getQuestionUiState(question, progress) {
  const selected = getStoredAnswer(question.id, progress);
  const submitted = selected >= 0;
  const isCurrentCorrect = submitted && selected === question.answer;
  return {
    selected,
    submitted,
    isCurrentCorrect,
  };
}

function getWrongModeSource(paperId, progress) {
  const all = getQuestionsByPaperId(paperId).map(withChapterName);
  const wrongSet = new Set((progress && progress.wrongIds) || []);
  return all.filter((q) => wrongSet.has(q.id));
}

function shouldResetAnswerState(mode) {
  return mode === 'wrong' || mode === 'favorite' || mode === 'volume_wrong' || mode === 'volume_favorite';
}

function isVolumeMode(mode) {
  return mode === 'volume_wrong' || mode === 'volume_favorite';
}

function isWrongCollectionMode(mode) {
  return mode === 'wrong' || mode === 'volume_wrong';
}

function isMockExamMode(mode) {
  return mode !== 'wrong' && mode !== 'favorite' && mode !== 'volume_wrong' && mode !== 'volume_favorite';
}

function getVolumeCollectionTypeByMode(mode) {
  return mode === 'volume_favorite' ? 'favorite' : 'wrong';
}

function resolveScopeKey(data) {
  if (data && data.scopeKey) return data.scopeKey;
  return buildScopeKey({
    paperId: data && data.paperId,
    volumeId: data && data.volumeId,
    mode: data && data.mode,
    chapterNo: data && data.chapterNo,
  });
}

function buildScopeKey({
  paperId,
  volumeId,
  mode,
  chapterNo,
}) {
  const safePaperId = String(paperId || '');
  const safeVolumeId = String(volumeId || '');
  const safeMode = String(mode || 'chapter');
  const safeChapterNo = String(chapterNo || '');
  const isDynamic = typeof isDynamicMockPaperId === 'function' && isDynamicMockPaperId(safePaperId);
  const dynamicSessionId = isDynamic && typeof getActiveDynamicMockSessionId === 'function'
    ? String(getActiveDynamicMockSessionId(safePaperId) || '')
    : '';
  const paperScopeId = dynamicSessionId ? `${safePaperId}:session:${dynamicSessionId}` : safePaperId;
  if (safeMode === 'volume_wrong' || safeMode === 'volume_favorite') {
    const type = safeMode === 'volume_favorite' ? 'favorite' : 'wrong';
    return `volume:${safeVolumeId}:${type}:${safeChapterNo || 'all'}`;
  }
  if (safeMode === 'chapter') return `paper:${paperScopeId}:chapter:${safeChapterNo}`;
  return `paper:${paperScopeId}:${safeMode}`;
}

function getCursorStorageKey(scopeKey) {
  return `iiqe_cursor_${scopeKey}`;
}

function getRandomOrderStorageKey(scopeKey) {
  return `iiqe_random_order_${scopeKey}`;
}

function saveCursor(scopeKey, idx, questionId) {
  if (!scopeKey || !questionId) return;
  wx.setStorageSync(getCursorStorageKey(scopeKey), {
    lastIndex: Number(idx) || 0,
    lastQuestionId: questionId,
    updatedAt: Date.now(),
  });
}

function clearCursor(scopeKey) {
  if (!scopeKey) return;
  wx.removeStorageSync(getCursorStorageKey(scopeKey));
}

function getStartIndexByCursor(source, cursor) {
  if (!Array.isArray(source) || !source.length) return 0;
  if (cursor && cursor.lastQuestionId) {
    const found = source.findIndex((q) => q.id === cursor.lastQuestionId);
    if (found >= 0) return found;
  }
  const idx = Number(cursor && cursor.lastIndex);
  if (Number.isInteger(idx) && idx >= 0) {
    return Math.min(idx, source.length - 1);
  }
  return 0;
}

function saveRandomOrder(scopeKey, source) {
  if (!scopeKey || !Array.isArray(source) || !source.length) return;
  wx.setStorageSync(getRandomOrderStorageKey(scopeKey), {
    questionIds: source.map((q) => q.id),
    updatedAt: Date.now(),
  });
}

function rebuildByOrder(source, orderIds) {
  const map = new Map();
  source.forEach((q) => map.set(q.id, q));
  const ordered = [];
  orderIds.forEach((id) => {
    if (!map.has(id)) return;
    ordered.push(map.get(id));
    map.delete(id);
  });
  map.forEach((q) => ordered.push(q));
  return ordered;
}

function getRandomModeSource(source, scopeKey) {
  const orderState = wx.getStorageSync(getRandomOrderStorageKey(scopeKey)) || {};
  const orderIds = Array.isArray(orderState.questionIds) ? orderState.questionIds : [];

  if (!orderIds.length) {
    const shuffled = shuffle(source);
    saveRandomOrder(scopeKey, shuffled);
    return shuffled;
  }

  const rebuilt = rebuildByOrder(source, orderIds);
  if (!rebuilt.length) {
    const shuffled = shuffle(source);
    saveRandomOrder(scopeKey, shuffled);
    return shuffled;
  }
  saveRandomOrder(scopeKey, rebuilt);
  return rebuilt;
}

function matchesChapterForMode(chapter, chapterNo) {
  const target = normalizeChapterRef(chapterNo);
  if (!target || target === 'all') return true;
  const raw = normalizeChapterRef(chapter);
  if (getChapterGroupKey(raw) === target) return true;
  return (
    raw === target
    || raw.startsWith(`${target}.`)
    || raw.startsWith(`${target}(`)
  );
}

function getSourcePaperIdForQuestion(question, fallbackPaperId) {
  return (question && question.sourcePaperId) || fallbackPaperId || '';
}

function getProgressPaperId(question, fallbackPaperId, isDynamicMockPaper) {
  if (isDynamicMockPaper && fallbackPaperId) return String(fallbackPaperId);
  return getSourcePaperIdForQuestion(question, fallbackPaperId);
}

function getQuestionIdForProgress(question) {
  return question && question.id;
}

function formatRemainingMs(ms) {
  const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getPassScore(total) {
  return Math.ceil(Math.max(0, Number(total || 0)) * 0.7);
}

function buildMockExamSummary(paperId) {
  const questions = getQuestionsByPaperId(paperId);
  const progress = wx.getStorageSync(getProgressKey(paperId)) || initProgress();
  const answers = (progress && progress.answers) || {};
  let answered = 0;
  let correct = 0;
  questions.forEach((q) => {
    if (!Object.prototype.hasOwnProperty.call(answers, q.id)) return;
    answered += 1;
    if (Number(answers[q.id]) === q.answer) correct += 1;
  });
  const total = questions.length;
  const passScore = getPassScore(total);
  return {
    total,
    answered,
    correct,
    passScore,
    passed: correct >= passScore,
  };
}

Page({
  data: {
    paperId: '',
    volumeId: '',
    mode: 'chapter',
    chapterNo: '',
    scopeKey: '',
    questions: [],
    idx: 0,
    current: null,
    isFirstQuestion: true,
    selected: -1,
    submitted: false,
    isCurrentCorrect: false,
    isLastQuestion: false,
    isFavorite: false,
    finished: false,
    emptyReason: '',
    navTitle: '',
    disableCursorPersist: false,
    isDynamicMockPaper: false,
    showExamTimerControls: false,
    examRemainingMs: 0,
    examTimerText: '00:00',
    examSubmitted: false,
  },

  async onLoad(options) {
    const paperId = options.paperId || '';
    const volumeId = decodeURIComponent(options.volumeId || '').trim();
    const mode = options.mode || 'chapter';
    const chapterNo = options.chapterNo || (isVolumeMode(mode) ? 'all' : '');
    let navTitle = '练习';
    let source = [];
    let progress = null;
    const dynamicMockPaper = !!(paperId && typeof isDynamicMockPaperId === 'function' && isDynamicMockPaperId(paperId));
    let examState = null;
    const scopeKey = buildScopeKey({
      paperId,
      volumeId,
      mode,
      chapterNo,
    });

    if (isVolumeMode(mode)) {
      if (!volumeId) {
        wx.showToast({ title: '题集不存在', icon: 'none' });
        this.safeRedirectToHome();
        return;
      }
      const collectionType = getVolumeCollectionTypeByMode(mode);
      navTitle = `${volumeId}${collectionType === 'favorite' ? '收藏题' : '错题集'}`;
      wx.setNavigationBarTitle({ title: navTitle });
      source = getVolumeCollectionQuestions(volumeId, collectionType, chapterNo);
      source = source.filter((q) => matchesChapterForMode(q.chapter, chapterNo)).map(withChapterName);
    } else {
      const paper = getPaperById(paperId);
      if (!paper) {
        wx.showToast({ title: '试卷不存在', icon: 'none' });
        this.backToPaper();
        return;
      }
      navTitle = (paper && paper.title) || '练习';
      if (mode === 'wrong') navTitle = '错题集';
      if (mode === 'favorite') navTitle = '收藏题';
      wx.setNavigationBarTitle({ title: navTitle });
      if (paper.premium && !await requireLogin('/pkg-exam/question/question')) return;
      if (!hasPaperAccess(paper)) {
        wx.showToast({ title: '该试卷需先授权', icon: 'none' });
        this.backToPaper();
        return;
      }

      source = getQuestionsByPaperId(paperId);
      progress = wx.getStorageSync(getProgressKey(paperId)) || initProgress();
      if (dynamicMockPaper && isMockExamMode(mode) && typeof getDynamicMockSessionState === 'function') {
        examState = getDynamicMockSessionState(paperId);
      }

      if (mode === 'chapter') {
        source = source.filter((q) => matchesChapterForMode(q.chapter, chapterNo));
      } else if (mode === 'random') {
        source = getRandomModeSource(source, scopeKey);
      } else if (mode === 'wrong') {
        source = getWrongModeSource(paperId, progress);
      } else if (mode === 'favorite') {
        const favSet = new Set(progress.favorites || []);
        source = source.filter((q) => favSet.has(q.id));
      }

      source = source.map(withChapterName);
    }

    if (!source.length) {
      clearCursor(scopeKey);
      this.setData({
        paperId,
        volumeId,
        mode,
        chapterNo,
        scopeKey,
        navTitle,
        finished: true,
        emptyReason: '当前模式暂无题目',
        disableCursorPersist: false,
        isDynamicMockPaper: dynamicMockPaper,
        showExamTimerControls: dynamicMockPaper && isMockExamMode(mode),
        examRemainingMs: examState ? Number(examState.remainingMs || 0) : 0,
        examTimerText: formatRemainingMs(examState ? Number(examState.remainingMs || 0) : 0),
        examSubmitted: false,
      });
      return;
    }

    const cursor = wx.getStorageSync(getCursorStorageKey(scopeKey)) || {};
    const startIndex = getStartIndexByCursor(source, cursor);
    const first = source[startIndex];
    const uiState = shouldResetAnswerState(mode)
      ? { selected: -1, submitted: false, isCurrentCorrect: false }
      : getQuestionUiState(first, progress);
    const firstSourcePaperId = getProgressPaperId(first, paperId, dynamicMockPaper);
    const firstQuestionId = getQuestionIdForProgress(first);
    const firstProgress = wx.getStorageSync(getProgressKey(firstSourcePaperId)) || initProgress();

    this.setData({
      paperId,
      volumeId,
      mode,
      chapterNo,
      scopeKey,
      navTitle,
      questions: source,
      idx: startIndex,
      current: first,
      isFirstQuestion: startIndex === 0,
      isLastQuestion: startIndex === source.length - 1,
      isFavorite: (firstProgress.favorites || []).includes(firstQuestionId),
      disableCursorPersist: false,
      isDynamicMockPaper: dynamicMockPaper,
      showExamTimerControls: dynamicMockPaper && isMockExamMode(mode),
      examRemainingMs: examState ? Number(examState.remainingMs || 0) : 0,
      examTimerText: formatRemainingMs(examState ? Number(examState.remainingMs || 0) : 0),
      examSubmitted: false,
      ...uiState,
    });
    saveCursor(scopeKey, startIndex, first.id);

    if (dynamicMockPaper && isMockExamMode(mode)) {
      this.startExamTimer();
    }
  },

  async onShow() {
    const { paperId, mode, volumeId } = this.data;
    if (isVolumeMode(mode)) {
      if (!volumeId) return;
      return;
    }

    if (!paperId) return;
    const paper = getPaperById(paperId);
    if (!paper) return;
    if (!paper.premium) {
      if (this.data.isDynamicMockPaper && isMockExamMode(mode)) this.startExamTimer();
      return;
    }
    if (!await requireLogin('/pkg-exam/question/question')) return;
    if (hasPaperAccess(paper)) {
      if (this.data.isDynamicMockPaper && isMockExamMode(mode)) this.startExamTimer();
      return;
    }

    try {
      const [premium, profile] = await Promise.all([
        refreshPremiumAccess(),
        refreshMyAgentProfile(),
      ]);
      const isAgent = !!(profile && profile.isAgent && profile.status !== 'disabled');
      if (premium || isAgent) {
        if (this.data.isDynamicMockPaper && isMockExamMode(mode)) this.startExamTimer();
        return;
      }
    } catch (err) {}

    wx.showToast({ title: '授权状态已失效', icon: 'none' });
    this.backToPaper();
  },

  startExamTimer() {
    const { paperId, isDynamicMockPaper, examSubmitted } = this.data;
    if (!isDynamicMockPaper || !paperId || examSubmitted) return;
    this.stopExamTimer({ persist: true });
    let remainingMs = Number(this.data.examRemainingMs || 0);
    if (remainingMs <= 0) {
      this.forceSubmitByTimeout();
      return;
    }
    this._examLastTickAt = Date.now();
    this._examTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, now - (this._examLastTickAt || now));
      this._examLastTickAt = now;
      remainingMs = Math.max(0, remainingMs - elapsed);
      this.setData({
        examRemainingMs: remainingMs,
        examTimerText: formatRemainingMs(remainingMs),
      });
      if (typeof updateDynamicMockRemainingMs === 'function') {
        updateDynamicMockRemainingMs(paperId, remainingMs);
      }
      if (remainingMs <= 0) {
        this.forceSubmitByTimeout();
      }
    }, 1000);
  },

  stopExamTimer({ persist = false } = {}) {
    const hadTimer = !!this._examTimer;
    if (this._examTimer) {
      clearInterval(this._examTimer);
      this._examTimer = null;
    }
    if (!persist || !hadTimer) return;
    const { isDynamicMockPaper, paperId, examSubmitted } = this.data;
    if (!isDynamicMockPaper || !paperId || examSubmitted) return;
    const now = Date.now();
    const elapsed = Math.max(0, now - (this._examLastTickAt || now));
    const remainingMs = Math.max(0, Number(this.data.examRemainingMs || 0) - elapsed);
    this._examLastTickAt = now;
    this.setData({
      examRemainingMs: remainingMs,
      examTimerText: formatRemainingMs(remainingMs),
    });
    if (typeof updateDynamicMockRemainingMs === 'function') {
      updateDynamicMockRemainingMs(paperId, remainingMs);
    }
  },

  submitDynamicMockPaper() {
    const { isDynamicMockPaper } = this.data;
    if (!isDynamicMockPaper) return;
    wx.showModal({
      title: '确认交卷',
      content: '交卷后本次模拟卷结束，下次进入将刷新新试卷。',
      success: (res) => {
        if (!res || !res.confirm) return;
        this.finishDynamicMockPaper('manual');
      },
    });
  },

  forceSubmitByTimeout() {
    this.finishDynamicMockPaper('timeout');
  },

  finishDynamicMockPaper(reason) {
    const { isDynamicMockPaper, paperId, examSubmitted } = this.data;
    if (!isDynamicMockPaper || !paperId || examSubmitted) return;
    if (reason === 'timeout') {
      this.setData({ examRemainingMs: 0, examTimerText: '00:00' });
      if (typeof updateDynamicMockRemainingMs === 'function') {
        updateDynamicMockRemainingMs(paperId, 0);
      }
    }
    this.stopExamTimer({ persist: true });
    if (typeof markDynamicMockSessionSubmitted === 'function') {
      markDynamicMockSessionSubmitted(paperId, reason || 'manual');
    }
    const summary = buildMockExamSummary(paperId);
    this.setData({
      examSubmitted: true,
      disableCursorPersist: true,
    });
    const prefix = reason === 'timeout' ? '时间到，已自动交卷。' : '已交卷。';
    const resultText = summary.passed ? '已通过' : '未通过';
    wx.showModal({
      title: summary.passed ? '交卷结果：通过' : '交卷结果：未通过',
      content: `${prefix}答对 ${summary.correct}/${summary.total} 题，及格线 ${summary.passScore} 题（70%），${resultText}。`,
      showCancel: false,
      success: () => {
        this.backToPaper();
      },
    });
  },

  chooseOption(e) {
    if (this.data.submitted) return;
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ selected: index }, () => {
      this.answerCurrentQuestion(index);
    });
  },

  toggleFavorite() {
    const { paperId, current, isDynamicMockPaper } = this.data;
    if (!current) return;
    const sourcePaperId = getProgressPaperId(current, paperId, isDynamicMockPaper);
    if (!sourcePaperId) return;
    const questionId = getQuestionIdForProgress(current);
    const progress = wx.getStorageSync(getProgressKey(sourcePaperId)) || initProgress();
    const favorites = new Set(progress.favorites || []);
    if (favorites.has(questionId)) {
      favorites.delete(questionId);
    } else {
      favorites.add(questionId);
    }
    progress.favorites = [...favorites];
    wx.setStorageSync(getProgressKey(sourcePaperId), progress);
    this.setData({ isFavorite: favorites.has(questionId) });
  },

  answerCurrentQuestion(selected) {
    const {
      current,
      paperId,
      isLastQuestion,
      mode,
      idx,
      isDynamicMockPaper,
    } = this.data;
    if (!current) return;

    const sourcePaperId = getProgressPaperId(current, paperId, isDynamicMockPaper);
    const questionId = getQuestionIdForProgress(current);
    if (!sourcePaperId || !questionId) return;

    const progress = wx.getStorageSync(getProgressKey(sourcePaperId)) || initProgress();
    const answers = progress.answers || {};
    answers[questionId] = selected;
    progress.answers = answers;

    const all = getQuestionsByPaperId(sourcePaperId);
    const questionMap = {};
    all.forEach((q) => {
      questionMap[q.id] = q;
    });

    const wrongIds = [];
    let correctCount = 0;
    Object.keys(answers).forEach((qid) => {
      const q = questionMap[qid];
      if (!q) return;
      if (q.answer === answers[qid]) {
        correctCount += 1;
      } else {
        wrongIds.push(qid);
      }
    });
    progress.wrongIds = wrongIds;
    progress.correctCount = correctCount;
    wx.setStorageSync(getProgressKey(sourcePaperId), progress);

    const isCurrentCorrect = selected === current.answer;
    this.setData({
      submitted: true,
      isCurrentCorrect,
    });

    if (this._nextTimer) clearTimeout(this._nextTimer);
    if (isWrongCollectionMode(mode) && isCurrentCorrect) {
      this._nextTimer = setTimeout(() => {
        this.goToQuestion(idx);
      }, 1000);
      return;
    }
    if (isCurrentCorrect && !isLastQuestion) {
      this._nextTimer = setTimeout(() => {
        this.nextQuestion();
      }, 1000);
    }
  },

  goToQuestion(nextIdx, { showSkipTip = false } = {}) {
    const {
      questions,
      paperId,
      volumeId,
      chapterNo,
      submitted,
      mode,
    } = this.data;
    const scopeKey = resolveScopeKey(this.data);
    if (this._nextTimer) clearTimeout(this._nextTimer);
    let source = questions;
    if (isWrongCollectionMode(mode)) {
      if (mode === 'wrong') {
        const progress = wx.getStorageSync(getProgressKey(paperId)) || initProgress();
        source = getWrongModeSource(paperId, progress);
      } else {
        source = getVolumeCollectionQuestions(volumeId, 'wrong', chapterNo || 'all').map(withChapterName);
      }
      if (!source.length) {
        clearCursor(scopeKey);
        this.setData({
          questions: [],
          current: null,
          idx: 0,
          isFirstQuestion: true,
          isLastQuestion: true,
          selected: -1,
          submitted: false,
          isCurrentCorrect: false,
          finished: true,
          emptyReason: '当前模式暂无题目',
        });
        return;
      }
    }

    const maxIdx = source.length - 1;
    let targetIdx = Number(nextIdx);
    if (targetIdx < 0) return;
    if (targetIdx > maxIdx) targetIdx = maxIdx;

    if (showSkipTip && !submitted) {
      wx.showToast({ title: '当前题未作答，已跳过', icon: 'none' });
    }

    const next = withChapterName(source[targetIdx]);
    const sourcePaperId = getProgressPaperId(next, paperId, this.data.isDynamicMockPaper);
    const questionId = getQuestionIdForProgress(next);
    const progress = wx.getStorageSync(getProgressKey(sourcePaperId)) || initProgress();
    const uiState = shouldResetAnswerState(mode)
      ? { selected: -1, submitted: false, isCurrentCorrect: false }
      : getQuestionUiState(next, progress);

    this.setData({
      questions: source,
      idx: targetIdx,
      current: next,
      isFirstQuestion: targetIdx === 0,
      isLastQuestion: targetIdx === maxIdx,
      isFavorite: (progress.favorites || []).includes(questionId),
      ...uiState,
    });
    saveCursor(scopeKey, targetIdx, next.id);
  },

  prevQuestion() {
    const { idx } = this.data;
    if (idx <= 0) {
      wx.showToast({ title: '已是第一题', icon: 'none' });
      return;
    }
    this.goToQuestion(idx - 1);
  },

  nextQuestion() {
    const { idx, questions } = this.data;
    const nextIdx = idx + 1;
    if (nextIdx >= questions.length) {
      wx.showToast({ title: '已是最后一题', icon: 'none' });
      return;
    }
    this.goToQuestion(nextIdx, { showSkipTip: true });
  },

  resetPaperProgress() {
    const { mode, paperId, volumeId } = this.data;
    const scopeKey = resolveScopeKey(this.data);
    this.stopExamTimer({ persist: true });
    if (isVolumeMode(mode)) {
      const papers = getVolumePapers(volumeId);
      papers.forEach((paper) => {
        const key = getProgressKey(paper.id);
        const progress = wx.getStorageSync(key) || initProgress();
        progress.answers = {};
        progress.correctCount = 0;
        progress.wrongIds = [];
        wx.setStorageSync(key, progress);
      });
    } else {
      const key = getProgressKey(paperId);
      const progress = wx.getStorageSync(key) || initProgress();
      progress.answers = {};
      progress.correctCount = 0;
      wx.setStorageSync(key, progress);
      if (this.data.isDynamicMockPaper && typeof prepareDynamicMockSession === 'function') {
        prepareDynamicMockSession(paperId, { force: true });
      }
    }
    clearCursor(scopeKey);
    if (mode === 'random') {
      wx.removeStorageSync(getRandomOrderStorageKey(scopeKey));
    }
    this.setData({ disableCursorPersist: true });
    wx.showToast({ title: '已清空进度', icon: 'none' });
    if (this._backTimer) clearTimeout(this._backTimer);
    this._backTimer = setTimeout(() => {
      this.backToPaper();
      this._backTimer = null;
    }, 300);
  },

  safeRedirectToHome() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.redirectTo({ url: '/pages/exam/home/home' });
  },

  safeRedirectToVolumeCollection(volumeId, type) {
    if (!volumeId) {
      this.safeRedirectToHome();
      return;
    }
    const url = `/pkg-exam/volume_collection/volume_collection?volumeId=${encodeURIComponent(volumeId)}&type=${type || 'wrong'}`;
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.redirectTo({ url });
  },

  backToPaper() {
    this.stopExamTimer({ persist: true });
    this.persistCursor();
    if (this._nextTimer) clearTimeout(this._nextTimer);
    if (this._backTimer) {
      clearTimeout(this._backTimer);
      this._backTimer = null;
    }
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    const { paperId, mode, volumeId } = this.data;
    if (isVolumeMode(mode) && volumeId) {
      const type = getVolumeCollectionTypeByMode(mode);
      wx.redirectTo({
        url: `/pkg-exam/volume_collection/volume_collection?volumeId=${encodeURIComponent(volumeId)}&type=${type}`,
      });
      return;
    }
    if (paperId) {
      wx.redirectTo({
        url: `/pkg-exam/paper/paper?paperId=${paperId}`,
      });
      return;
    }
    wx.redirectTo({ url: '/pages/exam/home/home' });
  },

  onUnload() {
    this.stopExamTimer({ persist: true });
    this.persistCursor();
    if (this._nextTimer) clearTimeout(this._nextTimer);
    if (this._backTimer) clearTimeout(this._backTimer);
  },

  onHide() {
    this.stopExamTimer({ persist: true });
    this.persistCursor();
    if (this._nextTimer) clearTimeout(this._nextTimer);
    if (this._backTimer) clearTimeout(this._backTimer);
  },

  persistCursor() {
    const { current, idx, disableCursorPersist } = this.data;
    if (disableCursorPersist) return;
    if (!current || !current.id) return;
    const scopeKey = resolveScopeKey(this.data);
    saveCursor(scopeKey, idx, current.id);
  },
});
