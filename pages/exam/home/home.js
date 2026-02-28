const { getPapersByType } = require('../../../utils/exam-data');
const { requireLogin } = require('../../../utils/auth');
const {
  hasPremiumAccessLocal,
  refreshPremiumAccess,
  setPremiumAccess,
  isAgentLocal,
  refreshMyAgentProfile,
  getActivationQrLocal,
  refreshActivationQrByUser,
} = require('../../../utils/entitlement');

function pickMessage(result, fallback) {
  const msg = result && typeof result.message === 'string' ? result.message.trim() : '';
  return msg || fallback;
}

Page({
  data: {
    typeTabs: ['卷三', '卷一'],
    activeType: '卷三',
    papers: [],
    hasPremiumAccess: false,
    isAgent: false,
    showActivationDialog: false,
    activationCode: '',
    redeeming: false,
    activationQrSrc: '/assets/wechat_qr.jpg',
  },

  async onLoad() {
    await requireLogin('/pages/exam/home/home');
  },

  async onShow() {
    if (!await requireLogin('/pages/exam/home/home')) return;
    this.loadEntitlement();
    this.loadPapers();
  },

  switchType(e) {
    const { type } = e.currentTarget.dataset;
    if (!type || type === this.data.activeType) return;
    this.setData({ activeType: type }, () => this.loadPapers());
  },

  async goPaper(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    const paper = (this.data.papers || []).find((p) => p.id === id);
    if (paper && paper.premium) {
      const hasAccess = this.data.hasPremiumAccess || this.data.isAgent;
      if (!hasAccess) {
        this.setData({
          showActivationDialog: true,
          activationCode: '',
        });
        this.loadActivationQr();
        return;
      }
    }
    wx.navigateTo({
      url: `/pages/exam/paper/paper?paperId=${id}`,
      fail: () => {
        wx.redirectTo({
          url: `/pages/exam/paper/paper?paperId=${id}`,
        });
      },
    });
  },

  goMe() {
    wx.navigateTo({
      url: '/pages/exam/me/me',
      fail: () => {
        wx.redirectTo({
          url: '/pages/exam/me/me',
        });
      },
    });
  },

  loadPapers() {
    const papers = getPapersByType(this.data.activeType).map((paper) => ({
      ...paper,
      unlocked: !paper.premium || this.data.hasPremiumAccess || this.data.isAgent,
    }));
    this.setData({ papers });
  },

  loadEntitlement() {
    const localAgent = isAgentLocal();
    const localAccess = hasPremiumAccessLocal();
    this.setData({
      hasPremiumAccess: localAccess,
      isAgent: localAgent,
    }, () => this.loadPapers());
    refreshPremiumAccess().then((enabled) => {
      this.setData({ hasPremiumAccess: !!enabled }, () => this.loadPapers());
    });
    refreshMyAgentProfile().then((profile) => {
      const isAgent = !!(profile && profile.isAgent && profile.status !== 'disabled');
      this.setData({ isAgent }, () => this.loadPapers());
    });
  },

  loadActivationQr() {
    this.setData({ activationQrSrc: getActivationQrLocal() });
    refreshActivationQrByUser().then((src) => {
      this.setData({ activationQrSrc: src || '/assets/wechat_qr.jpg' });
    });
  },

  openActivationDialog() {
    this.setData({
      showActivationDialog: true,
      activationCode: '',
    });
    this.loadActivationQr();
  },

  closeActivationDialog() {
    this.setData({
      showActivationDialog: false,
      activationCode: '',
    });
  },

  onActivationInput(e) {
    const value = ((e && e.detail && e.detail.value) || '').toUpperCase();
    this.setData({
      activationCode: value.replace(/\s+/g, '').slice(0, 20),
    });
  },

  pasteActivationCode() {
    wx.getClipboardData({
      success: (res) => {
        const text = ((res && res.data) || '').toUpperCase().replace(/\s+/g, '');
        this.setData({ activationCode: text.slice(0, 20) });
      },
      fail: () => {
        wx.showToast({ title: '粘贴失败，请手动输入', icon: 'none' });
      },
    });
  },

  async resolveActivationQrTempFile(src) {
    const target = String(src || '').trim();
    if (!target) return '';
    if (target.indexOf('wxfile://') === 0) return target;

    if (target.indexOf('cloud://') === 0) {
      if (!wx.cloud || !wx.cloud.downloadFile) return '';
      const download = await wx.cloud.downloadFile({ fileID: target });
      return (download && download.tempFilePath) || '';
    }

    if (target.indexOf('http://') === 0 || target.indexOf('https://') === 0) {
      const download = await new Promise((resolve, reject) => {
        wx.downloadFile({
          url: target,
          success: resolve,
          fail: reject,
        });
      });
      if (download && download.statusCode === 200 && download.tempFilePath) {
        return download.tempFilePath;
      }
      return '';
    }

    const image = await new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: target,
        success: resolve,
        fail: reject,
      });
    });
    return (image && image.path) || '';
  },

  async previewActivationQr() {
    const src = this.data.activationQrSrc || '/assets/wechat_qr.jpg';
    try {
      const filePath = await this.resolveActivationQrTempFile(src);
      const current = filePath || src;
      wx.previewImage({
        current,
        urls: [current],
      });
    } catch (err) {
      wx.showToast({ title: '二维码暂不可预览，请稍后重试', icon: 'none' });
    }
  },

  async saveActivationQr() {
    const src = this.data.activationQrSrc || '/assets/wechat_qr.jpg';
    try {
      const filePath = await this.resolveActivationQrTempFile(src);
      if (!filePath) {
        wx.showToast({ title: '二维码暂不可保存，请稍后重试', icon: 'none' });
        return;
      }
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath,
          success: resolve,
          fail: reject,
        });
      });
      wx.showToast({ title: '二维码已保存到相册', icon: 'success' });
    } catch (err) {
      const msg = (err && err.errMsg) || '';
      if (msg.indexOf('auth deny') >= 0 || msg.indexOf('auth denied') >= 0) {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中允许保存到相册后重试',
          confirmText: '去设置',
          success: (res) => {
            if (res && res.confirm) {
              wx.openSetting({});
            }
          },
        });
        return;
      }
      wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' });
    }
  },

  noop() {},

  async redeemActivationCode() {
    const code = (this.data.activationCode || '').trim().toUpperCase();
    if (!code) {
      wx.showToast({ title: '请输入授权码', icon: 'none' });
      return;
    }
    if (!wx.cloud || !wx.cloud.callFunction) {
      wx.showToast({ title: '服务暂时不可用，请稍后重试', icon: 'none' });
      return;
    }
    this.setData({ redeeming: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'redeemActivationCode',
        data: { code },
      });
      if (res && res.result && res.result.ok) {
        setPremiumAccess(true);
        this.setData({
          hasPremiumAccess: true,
          showActivationDialog: false,
          activationCode: '',
        }, () => this.loadPapers());
        wx.showToast({ title: '授权成功', icon: 'success' });
      } else {
        wx.showToast({ title: pickMessage(res && res.result, '授权码无效或已使用'), icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '授权失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ redeeming: false });
    }
  },
});
