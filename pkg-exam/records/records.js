const { getPapersByType } = require('../utils/exam-data');
const { requireLogin } = require('../../utils/auth');

function getProgressKey(paperId) {
  return `iiqe_progress_${paperId}`;
}

Page({
  data: {
    rows: [],
  },

  async onShow() {
    if (!await requireLogin('/pkg-exam/records/records')) return;
    this.loadRows();
  },

  loadRows() {
    const allPapers = [
      ...getPapersByType('卷三'),
      ...getPapersByType('卷一'),
      ...getPapersByType('卷二'),
      ...getPapersByType('卷四'),
      ...getPapersByType('卷五'),
    ];
    const rows = allPapers.map((p) => {
      const progress = wx.getStorageSync(getProgressKey(p.id)) || { answers: {}, wrongIds: [], favorites: [] };
      const answered = Object.keys(progress.answers || {}).length;
      const wrong = (progress.wrongIds || []).length;
      const storedCorrect = Number(progress.correctCount);
      const correct = Number.isFinite(storedCorrect) ? storedCorrect : Math.max(0, answered - wrong);
      return {
        id: p.id,
        title: p.title,
        answered,
        correct,
        wrong,
        favorites: (progress.favorites || []).length,
      };
    });
    this.setData({ rows });
  },

  openPaper(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pkg-exam/paper/paper?paperId=${id}`,
      fail: () => {
        wx.redirectTo({
          url: `/pkg-exam/paper/paper?paperId=${id}`,
        });
      },
    });
  },

  back() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.redirectTo({ url: '/pages/exam/me/me' });
  },
});
