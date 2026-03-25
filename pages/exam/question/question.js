const {
  getQuestionsByPaperId,
  getPaperById,
  chapterTitleMap,
} = require('../../../utils/exam-data');
const { requireLogin } = require('../../../utils/auth');
const {
  hasPremiumAccessLocal,
  isAgentLocal,
  refreshPremiumAccess,
  refreshMyAgentProfile,
} = require('../../../utils/entitlement');

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
  const raw = String(chapter || '').trim();
  if (!raw) return '';
  if (chapterTitleMap && chapterTitleMap[raw]) return chapterTitleMap[raw];
  const first = raw.split('.')[0];
  if (chapterTitleMap && chapterTitleMap[first]) return chapterTitleMap[first];
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
  return mode === 'wrong' || mode === 'favorite';
}

function resolveScopeKey(data) {
  if (data && data.scopeKey) return data.scopeKey;
  return buildScopeKey(data && data.paperId, data && data.mode, data && data.chapterNo);
}

function buildScopeKey(paperId, mode, chapterNo) {
  const safePaperId = String(paperId || '');
  const safeMode = String(mode || 'chapter');
  const safeChapterNo = String(chapterNo || '');
  if (safeMode === 'chapter') return `paper:${safePaperId}:chapter:${safeChapterNo}`;
  return `paper:${safePaperId}:${safeMode}`;
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

Page({
  data: {
    paperId: '',
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
  },

  async onLoad(options) {
    const paperId = options.paperId || '';
    const mode = options.mode || 'chapter';
    const chapterNo = options.chapterNo || '';
    const paper = getPaperById(paperId);
    if (!paper) {
      wx.showToast({ title: '试卷不存在', icon: 'none' });
      this.backToPaper();
      return;
    }
    let navTitle = (paper && paper.title) || '练习';
    if (mode === 'wrong') navTitle = '错题集';
    if (mode === 'favorite') navTitle = '收藏题';
    const scopeKey = buildScopeKey(paperId, mode, chapterNo);
    wx.setNavigationBarTitle({ title: navTitle });
    if (paper.premium && !await requireLogin('/pages/exam/question/question')) return;
    if (!hasPaperAccess(paper)) {
      wx.showToast({ title: '该试卷需先授权', icon: 'none' });
      this.backToPaper();
      return;
    }

    let source = getQuestionsByPaperId(paperId);
    const progress = wx.getStorageSync(getProgressKey(paperId)) || initProgress();

    if (mode === 'chapter') {
      source = source.filter((q) => String(q.chapter).startsWith(`${chapterNo}.`) || String(q.chapter) === chapterNo);
    } else if (mode === 'random') {
      source = getRandomModeSource(source, scopeKey);
    } else if (mode === 'wrong') {
      source = getWrongModeSource(paperId, progress);
    } else if (mode === 'favorite') {
      const favSet = new Set(progress.favorites || []);
      source = source.filter((q) => favSet.has(q.id));
    }

    source = source.map(withChapterName);

    if (!source.length) {
      clearCursor(scopeKey);
      this.setData({
        paperId,
        mode,
        chapterNo,
        scopeKey,
        navTitle,
        finished: true,
        emptyReason: '当前模式暂无题目',
        disableCursorPersist: false,
      });
      return;
    }

    const cursor = wx.getStorageSync(getCursorStorageKey(scopeKey)) || {};
    const startIndex = getStartIndexByCursor(source, cursor);
    const first = source[startIndex];
    const uiState = shouldResetAnswerState(mode)
      ? { selected: -1, submitted: false, isCurrentCorrect: false }
      : getQuestionUiState(first, progress);

    this.setData({
      paperId,
      mode,
      chapterNo,
      scopeKey,
      navTitle,
      questions: source,
      idx: startIndex,
      current: first,
      isFirstQuestion: startIndex === 0,
      isLastQuestion: startIndex === source.length - 1,
      isFavorite: (progress.favorites || []).includes(first.id),
      disableCursorPersist: false,
      ...uiState,
    });
    saveCursor(scopeKey, startIndex, first.id);
  },

  async onShow() {
    const paperId = this.data.paperId;
    if (!paperId) return;
    const paper = getPaperById(paperId);
    if (!paper || !paper.premium) return;
    if (!await requireLogin('/pages/exam/question/question')) return;
    if (hasPaperAccess(paper)) return;

    try {
      const [premium, profile] = await Promise.all([
        refreshPremiumAccess(),
        refreshMyAgentProfile(),
      ]);
      const isAgent = !!(profile && profile.isAgent && profile.status !== 'disabled');
      if (premium || isAgent) return;
    } catch (err) {}

    wx.showToast({ title: '授权状态已失效', icon: 'none' });
    this.backToPaper();
  },

  chooseOption(e) {
    if (this.data.submitted) return;
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ selected: index }, () => {
      this.answerCurrentQuestion(index);
    });
  },

  toggleFavorite() {
    const { paperId, current } = this.data;
    if (!current) return;
    const progress = wx.getStorageSync(getProgressKey(paperId)) || initProgress();
    const favorites = new Set(progress.favorites || []);
    if (favorites.has(current.id)) {
      favorites.delete(current.id);
    } else {
      favorites.add(current.id);
    }
    progress.favorites = [...favorites];
    wx.setStorageSync(getProgressKey(paperId), progress);
    this.setData({ isFavorite: favorites.has(current.id) });
  },

  answerCurrentQuestion(selected) {
    const {
      current,
      paperId,
      isLastQuestion,
      mode,
      idx,
    } = this.data;
    if (!current) return;

    const progress = wx.getStorageSync(getProgressKey(paperId)) || initProgress();
    const answers = progress.answers || {};
    answers[current.id] = selected;
    progress.answers = answers;

    const all = getQuestionsByPaperId(paperId);
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
    wx.setStorageSync(getProgressKey(paperId), progress);

    const isCurrentCorrect = selected === current.answer;
    this.setData({
      submitted: true,
      isCurrentCorrect,
    });

    if (this._nextTimer) clearTimeout(this._nextTimer);
    if (mode === 'wrong' && isCurrentCorrect) {
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
      submitted,
      mode,
    } = this.data;
    const scopeKey = resolveScopeKey(this.data);
    if (this._nextTimer) clearTimeout(this._nextTimer);
    let source = questions;
    if (mode === 'wrong') {
      const progress = wx.getStorageSync(getProgressKey(paperId)) || initProgress();
      source = getWrongModeSource(paperId, progress);
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

    const progress = wx.getStorageSync(getProgressKey(paperId)) || initProgress();
    const next = withChapterName(source[targetIdx]);
    const uiState = shouldResetAnswerState(mode)
      ? { selected: -1, submitted: false, isCurrentCorrect: false }
      : getQuestionUiState(next, progress);

    this.setData({
      questions: source,
      idx: targetIdx,
      current: next,
      isFirstQuestion: targetIdx === 0,
      isLastQuestion: targetIdx === maxIdx,
      isFavorite: (progress.favorites || []).includes(next.id),
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
    const key = getProgressKey(this.data.paperId);
    const scopeKey = resolveScopeKey(this.data);
    const progress = wx.getStorageSync(key) || initProgress();
    progress.answers = {};
    progress.correctCount = 0;
    wx.setStorageSync(key, progress);
    clearCursor(scopeKey);
    if (this.data.mode === 'random') {
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

  backToPaper() {
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
    const paperId = this.data.paperId;
    if (paperId) {
      wx.redirectTo({
        url: `/pages/exam/paper/paper?paperId=${paperId}`,
      });
      return;
    }
    wx.redirectTo({ url: '/pages/exam/home/home' });
  },

  onUnload() {
    this.persistCursor();
    if (this._nextTimer) clearTimeout(this._nextTimer);
    if (this._backTimer) clearTimeout(this._backTimer);
  },

  onHide() {
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
