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
  getActivationQrLocal,
  refreshActivationQrByUser,
} = require('../../../utils/entitlement');

function pickMessage(result, fallback) {
  const msg = result && typeof result.message === 'string' ? result.message.trim() : '';
  return msg || fallback;
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
    activationQrSrc: '/assets/wechat_qr.jpg',
  },

  onLoad(options) {
    if (options && options.openActivation) {
      this.setData({ showActivationDialog: true });
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
    refreshPremiumAccess().then((enabled) => {
      this.setData({ hasPremiumAccess: !!enabled });
    });
    refreshMyAgentProfile().then((profile) => {
      this.setData({
        isAgent: !!(profile && profile.isAgent && profile.status !== 'disabled'),
        agentStatus: (profile && profile.status) || '',
        agentId: (profile && profile.agentId) || '',
      });
    });
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
          setTimeout(() => {
            wx.redirectTo({
              url: redirectUrl,
              fail: () => {
                wx.reLaunch({ url: '/pages/exam/home/home' });
              },
            });
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
    if (!/^https?:\/\//.test(rawAvatarUrl) && !/^cloud:\/\//.test(rawAvatarUrl)) {
      if (!wx.cloud || !wx.cloud.uploadFile) {
        wx.showToast({ title: '头像更新失败，请稍后重试', icon: 'none' });
        return;
      }
      try {
        const upload = await wx.cloud.uploadFile({
          cloudPath: `user-avatars/${this.data.user.id}-${Date.now()}.jpg`,
          filePath: rawAvatarUrl,
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

  openActivationDialog() {
    if (this.data.hasPremiumAccess) {
      wx.showToast({ title: '已授权，无需重复输入', icon: 'none' });
      return;
    }
    this.setData({
      showActivationDialog: true,
      activationCode: '',
      activationQrSrc: getActivationQrLocal(),
    });
    refreshActivationQrByUser().then((src) => {
      this.setData({ activationQrSrc: src || '/assets/wechat_qr.jpg' });
    });
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
        wx.showToast({ title: pickMessage(res && res.result, '授权码无效或已使用'), icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '授权失败，请稍后重试', icon: 'none' });
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
});
