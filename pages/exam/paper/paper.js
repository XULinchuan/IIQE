const { getPaperById, getQuestionsByPaperId, chapterTitleMap } = require('../../../utils/exam-data');
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

function hasPaperAccess(paper) {
  if (!paper) return false;
  if (!paper.premium) return true;
  return hasPremiumAccessLocal() || isAgentLocal();
}

Page({
  data: {
    paperId: '',
    paperTitle: '',
    total: 0,
    answered: 0,
    correct: 0,
    accuracy: '0%',
    chapterStats: [],
  },

  onLoad(options) {
    if (!requireLogin('/pages/exam/paper/paper')) return;
    const paperId = options.paperId || '';
    const paper = getPaperById(paperId);
    if (!paper) {
      wx.showToast({ title: '试卷不存在', icon: 'none' });
      this.safeBack('/pages/exam/home/home');
      return;
    }
    if (!hasPaperAccess(paper)) {
      wx.showToast({ title: '该试卷需先授权', icon: 'none' });
      this.safeBack('/pages/exam/home/home');
      return;
    }
    this.setData({
      paperId,
      paperTitle: paper.title,
    });
    wx.setNavigationBarTitle({ title: paper.title });
    this.refreshStats();
  },

  onShow() {
    if (!requireLogin('/pages/exam/paper/paper')) return;
    if (this.data.paperId) this.enforcePaperAccess();
    if (this.data.paperId) this.refreshStats();
  },

  async enforcePaperAccess() {
    const paper = getPaperById(this.data.paperId);
    if (!paper || !paper.premium) return true;
    if (hasPaperAccess(paper)) return true;

    try {
      const [premium, profile] = await Promise.all([
        refreshPremiumAccess(),
        refreshMyAgentProfile(),
      ]);
      const isAgent = !!(profile && profile.isAgent && profile.status !== 'disabled');
      if (premium || isAgent) return true;
    } catch (err) {}

    wx.showToast({ title: '授权状态已失效', icon: 'none' });
    this.safeBack('/pages/exam/home/home');
    return false;
  },

  refreshStats() {
    const { paperId } = this.data;
    const questions = getQuestionsByPaperId(paperId);
    const progress = wx.getStorageSync(getProgressKey(paperId)) || initProgress();
    const answers = progress.answers || {};
    const answered = Object.keys(answers).length;
    const correct = progress.correctCount || 0;
    const total = questions.length;
    const accuracy = answered ? `${Math.round((correct / answered) * 100)}%` : '0%';

    const chapterMap = {};
    questions.forEach((q) => {
      const chapterNo = String(q.chapter).split('.')[0];
      const key = chapterNo;
      if (!chapterMap[key]) {
        chapterMap[key] = {
          chapterNo: key,
          title: chapterTitleMap[key] || `第${key}章`,
          total: 0,
          answered: 0,
          correct: 0,
        };
      }
      chapterMap[key].total += 1;
      if (answers[q.id] !== undefined) {
        chapterMap[key].answered += 1;
        if (answers[q.id] === q.answer) {
          chapterMap[key].correct += 1;
        }
      }
    });

    const chapterStats = Object.values(chapterMap)
      .sort((a, b) => Number(a.chapterNo) - Number(b.chapterNo))
      .map((item) => ({
        ...item,
        accuracy: item.answered ? `${Math.round((item.correct / item.answered) * 100)}%` : '0%',
      }));

    this.setData({ total, answered, correct, accuracy, chapterStats });
  },

  startRandom() {
    this.openQuestion(`/pages/exam/question/question?paperId=${this.data.paperId}&mode=random`);
  },

  startWrong() {
    this.openQuestion(`/pages/exam/question/question?paperId=${this.data.paperId}&mode=wrong`);
  },

  startFavorite() {
    this.openQuestion(`/pages/exam/question/question?paperId=${this.data.paperId}&mode=favorite`);
  },

  startChapter(e) {
    const chapterNo = e.currentTarget.dataset.chapterNo;
    this.openQuestion(`/pages/exam/question/question?paperId=${this.data.paperId}&mode=chapter&chapterNo=${chapterNo}`);
  },

  back() {
    this.safeBack('/pages/exam/home/home');
  },

  async openQuestion(url) {
    const ok = await this.enforcePaperAccess();
    if (!ok) return;
    wx.navigateTo({
      url,
      fail: () => {
        wx.redirectTo({ url });
      },
    });
  },

  safeBack(fallbackUrl) {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.redirectTo({ url: fallbackUrl });
  },
});
