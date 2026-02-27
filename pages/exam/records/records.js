const { getPapersByType } = require('../../../utils/exam-data');
const { requireLogin } = require('../../../utils/auth');

function getProgressKey(paperId) {
  return `iiqe_progress_${paperId}`;
}

Page({
  data: {
    rows: [],
    navTop: 0,
    navHeight: 0,
  },

  onLoad() {
    const sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
    const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const statusBarHeight = Number(sys.statusBarHeight || 20);
    const menuTop = Number((menu && menu.top) || 0);
    const menuHeight = Number((menu && menu.height) || 32);
    const navTop = menuTop > 0 ? menuTop : statusBarHeight;
    const navHeight = menuHeight > 0 ? menuHeight : 32;
    this.setData({
      navTop,
      navHeight,
    });
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
