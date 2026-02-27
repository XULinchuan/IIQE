const { getPapersByType } = require('../../../utils/exam-data');
const { requireLogin } = require('../../../utils/auth');

function getProgressKey(paperId) {
  return `iiqe_progress_${paperId}`;
}

Page({
  data: {
    rows: [],
  },

  onShow() {
    if (!requireLogin('/pages/exam/records/records')) return;
    this.loadRows();
  },

  loadRows() {
    const allPapers = [...getPapersByType('卷三'), ...getPapersByType('卷一')];
    const rows = allPapers.map((p) => {
      const progress = wx.getStorageSync(getProgressKey(p.id)) || { answers: {}, wrongIds: [], favorites: [] };
      return {
        id: p.id,
        title: p.title,
        answered: Object.keys(progress.answers || {}).length,
        wrong: (progress.wrongIds || []).length,
        favorites: (progress.favorites || []).length,
      };
    });
    this.setData({ rows });
  },

  openPaper(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/exam/paper/paper?paperId=${id}`,
      fail: () => {
        wx.redirectTo({
          url: `/pages/exam/paper/paper?paperId=${id}`,
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
