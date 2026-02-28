const { getQuestionsByPaperId, getPaperById } = require('../../../utils/exam-data');
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

Page({
  data: {
    paperId: '',
    mode: 'chapter',
    chapterNo: '',
    questions: [],
    idx: 0,
    current: null,
    selected: -1,
    submitted: false,
    isCurrentCorrect: false,
    showNextButton: false,
    isLastQuestion: false,
    isFavorite: false,
    finished: false,
    emptyReason: '',
    navTitle: '',
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
    if (paper.premium && !await requireLogin('/pages/exam/question/question')) return;
    if (!hasPaperAccess(paper)) {
      wx.showToast({ title: '该试卷需先授权', icon: 'none' });
      this.backToPaper();
      return;
    }
    let navTitle = (paper && paper.title) || '练习';
    if (mode === 'wrong') navTitle = '错题集';
    if (mode === 'favorite') navTitle = '收藏题';

    let source = getQuestionsByPaperId(paperId);
    const progress = wx.getStorageSync(getProgressKey(paperId)) || initProgress();

    if (mode === 'chapter') {
      source = source.filter((q) => String(q.chapter).startsWith(`${chapterNo}.`) || String(q.chapter) === chapterNo);
    } else if (mode === 'random') {
      source = shuffle(source);
    } else if (mode === 'wrong') {
      const wrongSet = new Set(progress.wrongIds || []);
      source = source.filter((q) => wrongSet.has(q.id));
    } else if (mode === 'favorite') {
      const favSet = new Set(progress.favorites || []);
      source = source.filter((q) => favSet.has(q.id));
    }

    if (!source.length) {
      this.setData({
        paperId,
        mode,
        chapterNo,
        navTitle,
        finished: true,
        emptyReason: '当前模式暂无题目',
      });
      wx.setNavigationBarTitle({ title: navTitle });
      return;
    }

    this.setData({
      paperId,
      mode,
      chapterNo,
      navTitle,
      questions: source,
      current: source[0],
      isLastQuestion: source.length <= 1,
      isFavorite: (progress.favorites || []).includes(source[0].id),
    });
    wx.setNavigationBarTitle({ title: navTitle });
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
    const { current, paperId } = this.data;
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
      showNextButton: !isCurrentCorrect,
    });

    if (this._nextTimer) clearTimeout(this._nextTimer);
    if (isCurrentCorrect) {
      this._nextTimer = setTimeout(() => {
        this.nextQuestion();
      }, 1000);
    }
  },

  nextQuestion() {
    const { idx, questions, paperId } = this.data;
    const nextIdx = idx + 1;
    if (nextIdx >= questions.length) {
      this.setData({
        finished: true,
        emptyReason: '本次练习已完成',
      });
      return;
    }

    const progress = wx.getStorageSync(getProgressKey(paperId)) || initProgress();
    const next = questions[nextIdx];

    this.setData({
      idx: nextIdx,
      current: next,
      selected: -1,
      submitted: false,
      isCurrentCorrect: false,
      showNextButton: false,
      isLastQuestion: nextIdx === questions.length - 1,
      isFavorite: (progress.favorites || []).includes(next.id),
    });
  },

  resetPaperProgress() {
    const key = getProgressKey(this.data.paperId);
    const progress = wx.getStorageSync(key) || initProgress();
    progress.answers = {};
    progress.correctCount = 0;
    wx.setStorageSync(key, progress);
    wx.showToast({ title: '已清空进度', icon: 'none' });
    setTimeout(() => {
      this.backToPaper();
    }, 300);
  },

  backToPaper() {
    if (this._nextTimer) clearTimeout(this._nextTimer);
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
    if (this._nextTimer) clearTimeout(this._nextTimer);
  },
});
