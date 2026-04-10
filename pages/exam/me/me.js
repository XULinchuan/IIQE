const {
  getUserLocal,
  normalizeRedirectUrl,
  restoreUserFromCloud,
  upsertUserProfileToCloud,
} = require('../../../utils/auth');
const {
  hasPremiumAccessLocal,
  setPremiumAccess,
  refreshPremiumAccess,
  setAgentProfile,
  getAgentProfileLocal,
  refreshMyAgentProfile,
  refreshActivationQrByUser,
} = require('../../../utils/entitlement');
const { safeUserMessage } = require('../../../utils/user-message');

function pickMessage(result, fallback) {
  const msg = result && typeof result.message === 'string' ? result.message : '';
  return safeUserMessage(msg, fallback);
}

function pickCloudErrorMessage(err, fallback) {
  const candidates = [
    err && err.result && err.result.message,
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const item = typeof candidates[i] === 'string' ? candidates[i].trim() : '';
    if (item) return item;
  }
  return fallback;
}

function pickActivationErrorMessage(result, fallback) {
  const code = result && result.errorCode;
  if (code === 'RATE_LIMIT') return '请求过于频繁，请1分钟后重试';
  if (code === 'VERIFY_FAILED') return '系统繁忙，请稍后重试';
  if (code === 'RATE_CHECK_FAILED') return '系统繁忙，请稍后重试';
  return pickMessage(result, fallback);
}

Page({
  data: {
    user: null,
    isLoggedIn: false,
    hasPremiumAccess: false,
    showActivationDialog: false,
    activationCode: '',
    redeeming: false,
    isAgent: false,
    agentStatus: '',
    agentId: '',
    showAgentDialog: false,
    agentCode: '',
    redeemingAgent: false,
    activationQrSrc: '',
    activationQrLoading: false,
    showNickDialog: false,
    nickDraft: '',
    updatingNick: false,
  },

  async onLoad(options) {
    await this.loadUser();
    if (options && options.openActivation) {
      if (!this.data.isLoggedIn) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        return;
      }
      await this.openActivationDialog();
    }
  },

  async onShow() {
    await this.loadUser();
    this.loadEntitlement();
  },

  async loadUser() {
    let user = getUserLocal();
    if (!user) {
      user = await restoreUserFromCloud();
    }
    this.setData({
      user: user || null,
      isLoggedIn: !!user,
    });
  },

  loadEntitlement() {
    const localAgent = getAgentProfileLocal();
    this.setData({
      hasPremiumAccess: hasPremiumAccessLocal(),
      isAgent: !!(localAgent && localAgent.isAgent && localAgent.status !== 'disabled'),
      agentStatus: (localAgent && localAgent.status) || '',
      agentId: (localAgent && localAgent.agentId) || '',
    });
    refreshPremiumAccess()
      .then((enabled) => {
        this.setData({ hasPremiumAccess: !!enabled });
      })
      .catch(() => {});
    refreshMyAgentProfile()
      .then((profile) => {
        this.setData({
          isAgent: !!(profile && profile.isAgent && profile.status !== 'disabled'),
          agentStatus: (profile && profile.status) || '',
          agentId: (profile && profile.agentId) || '',
        });
      })
      .catch(() => {});
  },

  loginOrRegister() {
    wx.getUserProfile({
      desc: '用于获取微信昵称',
      success: async (res) => {
        const wxUser = res.userInfo || {};
        const oldUser = getUserLocal();
        const syncRes = await upsertUserProfileToCloud({
          nickName: wxUser.nickName || (oldUser && oldUser.nickName) || '微信用户',
        });
        if (!syncRes.ok || !syncRes.user) {
          wx.showToast({ title: syncRes.message || '登录失败，请稍后重试', icon: 'none' });
          return;
        }
        const user = syncRes.user;
        this.setData({
          user,
          isLoggedIn: true,
        });
        wx.showToast({ title: oldUser ? '登录成功' : '注册成功', icon: 'none' });

        const redirectUrl = normalizeRedirectUrl(wx.getStorageSync('iiqe_login_redirect'));
        if (redirectUrl) {
          wx.removeStorageSync('iiqe_login_redirect');
          if (this._loginRedirectTimer) clearTimeout(this._loginRedirectTimer);
          this._loginRedirectTimer = setTimeout(() => {
            wx.redirectTo({
              url: redirectUrl,
              fail: () => {
                wx.reLaunch({ url: '/pages/exam/home/home' });
              },
            });
            this._loginRedirectTimer = null;
          }, 250);
        }
      },
      fail: () => {
        wx.showToast({ title: '未授权微信昵称', icon: 'none' });
      },
    });
  },

  async onChooseAvatar(e) {
    if (!this.data.isLoggedIn) return;
    const rawAvatarUrl = e && e.detail && e.detail.avatarUrl;
    if (!rawAvatarUrl) {
      wx.showToast({ title: '未选择头像', icon: 'none' });
      return;
    }
    let avatarUrl = rawAvatarUrl;
    if (!/^cloud:\/\//.test(rawAvatarUrl)) {
      if (!wx.cloud || !wx.cloud.uploadFile) {
        wx.showToast({ title: '头像更新失败，请稍后重试', icon: 'none' });
        return;
      }
      let uploadPath = rawAvatarUrl;
      if (/^https?:\/\//.test(rawAvatarUrl)) {
        try {
          const dl = await new Promise((resolve, reject) => {
            wx.downloadFile({
              url: rawAvatarUrl,
              success: resolve,
              fail: reject,
            });
          });
          if (!(dl && dl.statusCode === 200 && dl.tempFilePath)) {
            wx.showToast({ title: '头像更新失败，请稍后重试', icon: 'none' });
            return;
          }
          uploadPath = dl.tempFilePath;
        } catch (err) {
          wx.showToast({ title: '头像更新失败，请稍后重试', icon: 'none' });
          return;
        }
      }
      try {
        const upload = await wx.cloud.uploadFile({
          cloudPath: `user-avatars/${this.data.user.id}-${Date.now()}.jpg`,
          filePath: uploadPath,
        });
        avatarUrl = upload.fileID;
      } catch (err) {
        wx.showToast({ title: '头像更新失败，请稍后重试', icon: 'none' });
        return;
      }
    }
    const oldUser = this.data.user || {};
    const syncRes = await upsertUserProfileToCloud({
      nickName: oldUser.nickName || '微信用户',
      avatarUrl,
    });
    if (!syncRes.ok || !syncRes.user) {
      wx.showToast({ title: syncRes.message || '头像更新失败，请稍后重试', icon: 'none' });
      return;
    }
    const user = syncRes.user;
    this.setData({ user });
    wx.showToast({ title: '头像已更新', icon: 'success' });
  },

  openNickDialog() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    this.setData({
      showNickDialog: true,
      nickDraft: ((this.data.user && this.data.user.nickName) || '').slice(0, 20),
    });
  },

  closeNickDialog() {
    this.setData({
      showNickDialog: false,
      nickDraft: '',
      updatingNick: false,
    });
  },

  onNickInput(e) {
    const value = ((e && e.detail && e.detail.value) || '').replace(/\r?\n/g, '');
    this.setData({ nickDraft: value.slice(0, 20) });
  },

  onNickFormSubmit(e) {
    const formNick = (((e && e.detail && e.detail.value) || {}).nickname || '').replace(/\r?\n/g, '').slice(0, 20);
    if (formNick && formNick !== this.data.nickDraft) {
      this.setData({ nickDraft: formNick });
    }
    return this.saveNickName(formNick);
  },

  async saveNickName(nickNameOverride = '') {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const nickName = (nickNameOverride || this.data.nickDraft || '').trim();
    if (!nickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    this.setData({ updatingNick: true });
    const oldUser = this.data.user || {};
    const syncRes = await upsertUserProfileToCloud({
      nickName,
      avatarUrl: oldUser.avatarUrl || '',
    });
    if (!syncRes.ok || !syncRes.user) {
      this.setData({ updatingNick: false });
      wx.showToast({ title: syncRes.message || '昵称更新失败，请稍后重试', icon: 'none' });
      return;
    }
    this.setData({
      user: syncRes.user,
      updatingNick: false,
      showNickDialog: false,
      nickDraft: '',
    });
    wx.showToast({ title: '昵称已更新', icon: 'success' });
  },

  async loadActivationQr() {
    this.setData({ activationQrLoading: true, activationQrSrc: '' });
    try {
      const src = await refreshActivationQrByUser();
      this.setData({ activationQrSrc: src || '/assets/wechat_qr.jpg' });
    } finally {
      this.setData({ activationQrLoading: false });
    }
  },

  async openActivationDialog() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (this.data.hasPremiumAccess) {
      wx.showToast({ title: '已授权，无需重复输入', icon: 'none' });
      return;
    }
    this.setData({
      showActivationDialog: true,
      activationCode: '',
      activationQrLoading: true,
      activationQrSrc: '',
    });
    await this.loadActivationQr();
  },

  closeActivationDialog() {
    this.setData({
      showActivationDialog: false,
      activationCode: '',
      activationQrLoading: false,
      activationQrSrc: '',
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
      if (wx.cloud && wx.cloud.getTempFileURL) {
        const tempUrlRes = await wx.cloud.getTempFileURL({ fileList: [target] }).catch(() => null);
        const tempItem = tempUrlRes && tempUrlRes.fileList && tempUrlRes.fileList[0];
        const tempUrl = tempItem && (tempItem.tempFileURL || tempItem.tempFileUrl);
        if (tempUrl) {
          const cloudTempDownload = await new Promise((resolve, reject) => {
            wx.downloadFile({
              url: tempUrl,
              success: resolve,
              fail: reject,
            });
          }).catch(() => null);
          if (cloudTempDownload && cloudTempDownload.statusCode === 200 && cloudTempDownload.tempFilePath) {
            return cloudTempDownload.tempFilePath;
          }
        }
      }
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

  async previewActivationQr() {
    const src = this.data.activationQrSrc || '/assets/wechat_qr.jpg';
    try {
      if (String(src).indexOf('cloud://') === 0 && wx.cloud && wx.cloud.getTempFileURL) {
        const tempUrlRes = await wx.cloud.getTempFileURL({ fileList: [src] }).catch(() => null);
        const tempItem = tempUrlRes && tempUrlRes.fileList && tempUrlRes.fileList[0];
        const tempUrl = tempItem && (tempItem.tempFileURL || tempItem.tempFileUrl);
        if (tempUrl) {
          wx.previewImage({
            current: tempUrl,
            urls: [tempUrl],
          });
          return;
        }
      }
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

  noop() {},

  async redeemActivationCode() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
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
        });
        wx.showToast({ title: '授权成功', icon: 'success' });
      } else {
        wx.showToast({ title: pickActivationErrorMessage(res && res.result, '授权码无效或已使用'), icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: pickCloudErrorMessage(err, '授权失败，请稍后重试'), icon: 'none' });
    } finally {
      this.setData({ redeeming: false });
    }
  },

  openAgentDialog() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (this.data.isAgent) {
      wx.showToast({ title: '已是代理人', icon: 'none' });
      return;
    }
    this.setData({
      showAgentDialog: true,
      agentCode: '',
    });
  },

  closeAgentDialog() {
    this.setData({
      showAgentDialog: false,
      agentCode: '',
    });
  },

  onAgentCodeInput(e) {
    const value = ((e && e.detail && e.detail.value) || '').toUpperCase();
    this.setData({
      agentCode: value.replace(/\s+/g, '').slice(0, 20),
    });
  },

  async redeemAgentCode() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const code = (this.data.agentCode || '').trim().toUpperCase();
    if (!code) {
      wx.showToast({ title: '请输入代理人码', icon: 'none' });
      return;
    }
    if (!wx.cloud || !wx.cloud.callFunction) {
      wx.showToast({ title: '服务暂时不可用，请稍后重试', icon: 'none' });
      return;
    }
    this.setData({ redeemingAgent: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'redeemAgentInviteCode',
        data: { code },
      });
      const result = res && res.result;
      if (result && result.ok) {
        setPremiumAccess(true);
        const profile = {
          isAgent: true,
          agentId: result.agentId || '',
          status: result.profileStatus || 'active',
          name: '',
          wxQrFileID: '',
        };
        setAgentProfile(profile);
        this.setData({
          hasPremiumAccess: true,
          isAgent: true,
          agentStatus: profile.status,
          agentId: profile.agentId,
          showAgentDialog: false,
          agentCode: '',
        });
        wx.showToast({ title: result.alreadyAgent ? '已是代理人' : '代理人开通成功', icon: 'success' });
      } else {
        wx.showToast({ title: pickMessage(result, '代理人码无效或已使用'), icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '兑换失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ redeemingAgent: false });
    }
  },

  pasteAgentCode() {
    wx.getClipboardData({
      success: (res) => {
        const text = ((res && res.data) || '').toUpperCase().replace(/\s+/g, '');
        this.setData({ agentCode: text.slice(0, 20) });
      },
      fail: () => {
        wx.showToast({ title: '粘贴失败，请手动输入', icon: 'none' });
      },
    });
  },

  openAgentCenter() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (!this.data.isAgent) {
      wx.showToast({ title: '请先开通代理人', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/agent/qrcode/qrcode',
      fail: () => {
        wx.redirectTo({ url: '/pages/agent/qrcode/qrcode' });
      },
    });
  },

  openRecords() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/exam/records/records',
      fail: () => {
        wx.redirectTo({
          url: '/pages/exam/records/records',
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
    wx.redirectTo({ url: '/pages/exam/home/home' });
  },

  onUnload() {
    if (this._loginRedirectTimer) {
      clearTimeout(this._loginRedirectTimer);
      this._loginRedirectTimer = null;
    }
  },
});
