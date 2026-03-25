const { getVolumeCollectionSummary } = require('../../../utils/volume-collection');

function isValidType(type) {
  return type === 'wrong' || type === 'favorite';
}

function getModeByType(type) {
  return type === 'favorite' ? 'volume_favorite' : 'volume_wrong';
}

function getTitle(volumeId, type) {
  return `${volumeId}${type === 'favorite' ? '收藏集' : '错题集'}`;
}

Page({
  data: {
    volumeId: '',
    type: 'wrong',
    title: '',
    countLabel: '当前错题数',
    total: 0,
    answered: 0,
    correct: 0,
    accuracy: '0%',
    chapterStats: [],
  },

  async onLoad(options) {
    const volumeId = decodeURIComponent(options.volumeId || '').trim();
    const type = (options.type || 'wrong').trim();
    if (!volumeId || !isValidType(type)) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      this.safeBack('/pages/exam/home/home');
      return;
    }
    const title = getTitle(volumeId, type);
    wx.setNavigationBarTitle({ title });

    this.setData({
      volumeId,
      type,
      title,
      countLabel: type === 'favorite' ? '当前收藏数' : '当前错题数',
    });
    this.refreshStats();
  },

  async onShow() {
    const { volumeId } = this.data;
    if (!volumeId) return;
    this.refreshStats();
  },

  refreshStats() {
    const { volumeId, type } = this.data;
    const summary = getVolumeCollectionSummary(volumeId, type);
    this.setData({
      total: summary.total,
      answered: summary.answered,
      correct: summary.correct,
      accuracy: summary.accuracy,
      chapterStats: summary.chapterStats,
    });
  },

  async startAll() {
    this.openQuestion('all');
  },

  async startChapter(e) {
    const chapterNo = e.currentTarget.dataset.chapterNo;
    if (!chapterNo) return;
    this.openQuestion(chapterNo);
  },

  openQuestion(chapterNo) {
    const { volumeId, type } = this.data;
    const mode = getModeByType(type);
    const url = `/pages/exam/question/question?mode=${mode}&volumeId=${encodeURIComponent(volumeId)}&chapterNo=${encodeURIComponent(chapterNo)}`;
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
