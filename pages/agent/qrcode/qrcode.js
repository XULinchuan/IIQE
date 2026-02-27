const { requireLogin } = require('../../../utils/auth');
const { refreshMyAgentProfile, setAgentProfile } = require('../../../utils/entitlement');

Page({
  data: {
    isAgent: false,
    agentId: '',
    status: '',
    wxQrFileID: '',
    shareCodeFileID: '',
    generating: false,
    uploadingQr: false,
  },

  onShow() {
    if (!requireLogin('/pages/agent/qrcode/qrcode')) return;
    this.loadProfile();
  },

  async loadProfile() {
    const profile = await refreshMyAgentProfile();
    const isAgent = !!(profile && profile.isAgent);
    this.setData({
      isAgent,
      agentId: (profile && profile.agentId) || '',
      status: (profile && profile.status) || '',
      wxQrFileID: (profile && profile.wxQrFileID) || '',
    });
    if (!isAgent) {
      wx.showToast({ title: '请先开通代理人', icon: 'none' });
      setTimeout(() => this.back(), 300);
    }
  },

  async generateShareCode() {
    if (!this.data.isAgent) return;
    this.setData({ generating: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'agentGenerateShareCode',
        data: {
          envVersion: 'trial',
        },
      });
      const result = res && res.result;
      if (result && result.ok && result.fileID) {
        this.setData({ shareCodeFileID: result.fileID });
        wx.showToast({ title: '生成成功', icon: 'success' });
      } else {
        wx.showToast({ title: (result && result.message) || '生成失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: (err && err.errMsg) || '生成失败', icon: 'none' });
    } finally {
      this.setData({ generating: false });
    }
  },

  async uploadMyWxQr() {
    if (!this.data.isAgent) return;
    this.setData({ uploadingQr: true });
    try {
      const pick = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      });
      const file = pick && pick.tempFiles && pick.tempFiles[0];
      if (!file || !file.tempFilePath) {
        wx.showToast({ title: '未选择图片', icon: 'none' });
        this.setData({ uploadingQr: false });
        return;
      }

      const upload = await wx.cloud.uploadFile({
        cloudPath: `agent-wx-qrs/${this.data.agentId}-${Date.now()}.jpg`,
        filePath: file.tempFilePath,
      });

      const saveRes = await wx.cloud.callFunction({
        name: 'agentUpdateWxQr',
        data: {
          wxQrFileID: upload.fileID,
        },
      });
      const result = saveRes && saveRes.result;
      if (result && result.ok) {
        this.setData({ wxQrFileID: upload.fileID });
        setAgentProfile({
          isAgent: true,
          agentId: this.data.agentId,
          status: this.data.status || 'active',
          wxQrFileID: upload.fileID,
        });
        wx.showToast({ title: '更新成功', icon: 'success' });
      } else {
        wx.showToast({ title: (result && result.message) || '更新失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: (err && err.errMsg) || '上传失败', icon: 'none' });
    } finally {
      this.setData({ uploadingQr: false });
    }
  },

  previewShareCode() {
    if (!this.data.shareCodeFileID) return;
    wx.previewImage({
      urls: [this.data.shareCodeFileID],
      current: this.data.shareCodeFileID,
    });
  },

  previewMyQr() {
    if (!this.data.wxQrFileID) return;
    wx.previewImage({
      urls: [this.data.wxQrFileID],
      current: this.data.wxQrFileID,
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
