const {
  getPaperById,
  getQuestionsByPaperId,
  chapterTitleMap,
  isDynamicMockPaperId,
  prepareDynamicMockSession,
} = require('../utils/exam-data');
const { getChapterNo, compareChapterNo } = require('../utils/volume-collection');
const { requireLogin } = require('../../utils/auth');
const {
  hasPremiumAccessLocal,
  isAgentLocal,
  refreshPremiumAccess,
  refreshMyAgentProfile,
} = require('../../utils/entitlement');

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

function isDynamicMockPaper(paperId) {
  return typeof isDynamicMockPaperId === 'function' && isDynamicMockPaperId(paperId);
}

function buildPaperPageUrl(paperId) {
  const id = String(paperId || '').trim();
  return id ? `/pkg-exam/paper/paper?paperId=${encodeURIComponent(id)}` : '/pkg-exam/paper/paper';
}

function getPassScore(total) {
  return Math.ceil(Math.max(0, Number(total || 0)) * 0.7);
}

Page({
  data: {
    paperId: '',
    paperTitle: '',
    isDynamicMockPaper: false,
    total: 0,
    answered: 0,
    correct: 0,
    accuracy: '0%',
    passScore: 0,
    passRateText: '',
    chapterStats: [],
  },

  async onLoad(options) {
    const paperId = options.paperId || '';
    const paper = getPaperById(paperId);
    if (!paper) {
      wx.showToast({ title: '试卷不存在', icon: 'none' });
      this.safeBack('/pages/exam/home/home');
      return;
    }
    wx.setNavigationBarTitle({ title: paper.title });
    if (paper.premium && !await requireLogin(buildPaperPageUrl(paperId))) return;
    if (!hasPaperAccess(paper)) {
      wx.showToast({ title: '该试卷需先授权', icon: 'none' });
      this.safeBack('/pages/exam/home/home');
      return;
    }
    this.setData({
      paperId,
      paperTitle: paper.title,
      isDynamicMockPaper: isDynamicMockPaper(paperId),
    });
    if (isDynamicMockPaper(paperId) && typeof prepareDynamicMockSession === 'function') {
      prepareDynamicMockSession(paperId);
    }
    this.refreshStats();
  },

  async onShow() {
    const paperId = this.data.paperId;
    if (!paperId) return;
    const paper = getPaperById(paperId);
    if (!paper) return;
    if (paper.premium) {
      if (!await requireLogin(buildPaperPageUrl(paperId))) return;
      this.enforcePaperAccess();
    }
    this.refreshStats();
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
    const dynamicMock = isDynamicMockPaper(paperId);
    const passScore = dynamicMock ? getPassScore(total) : 0;
    const passRateText = dynamicMock ? `及格要求 70%（${passScore}题）` : '';

    const chapterMap = {};
    questions.forEach((q) => {
      const chapterNo = getChapterNo(q.chapter);
      const key = chapterNo;
      if (!chapterMap[key]) {
        chapterMap[key] = {
          chapterNo: key,
          title: chapterTitleMap[key] || (/^\d+$/.test(key) ? `第${key}章` : (key || '未分类')),
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
      .sort((a, b) => compareChapterNo(a.chapterNo, b.chapterNo))
      .map((item) => ({
        ...item,
        accuracy: item.answered ? `${Math.round((item.correct / item.answered) * 100)}%` : '0%',
      }));

    this.setData({
      total,
      answered,
      correct,
      accuracy,
      chapterStats,
      isDynamicMockPaper: dynamicMock,
      passScore,
      passRateText,
    });
  },

  startRandom() {
    this.openQuestion(`/pkg-exam/question/question?paperId=${this.data.paperId}&mode=random`);
  },

  startWrong() {
    this.openQuestion(`/pkg-exam/question/question?paperId=${this.data.paperId}&mode=wrong`);
  },

  startFavorite() {
    this.openQuestion(`/pkg-exam/question/question?paperId=${this.data.paperId}&mode=favorite`);
  },

  startChapter(e) {
    const chapterNo = e.currentTarget.dataset.chapterNo;
    this.openQuestion(`/pkg-exam/question/question?paperId=${this.data.paperId}&mode=chapter&chapterNo=${chapterNo}`);
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
