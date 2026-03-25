function getUserKey() {
  return 'iiqe_user_profile';
}
const { safeUserMessage } = require('./user-message');

function normalizeUser(raw) {
  const data = raw || {};
  const id = String(data.id || '').trim();
  if (!id) return null;
  return {
    id,
    nickName: String(data.nickName || '微信用户').slice(0, 40),
    avatarUrl: String(data.avatarUrl || '').slice(0, 500),
    createdAt: Number(data.createdAt || Date.now()),
    updatedAt: Number(data.updatedAt || Date.now()),
  };
}

function normalizeRedirectUrl(url) {
  const text = String(url || '').trim();
  if (!text.startsWith('/')) return '';
  if (text.startsWith('/pages/exam/') || text.startsWith('/pages/agent/')) {
    return text;
  }
  return '';
}

function isLoggedIn() {
  const user = wx.getStorageSync(getUserKey());
  return !!(user && user.id);
}

function getUserLocal() {
  return normalizeUser(wx.getStorageSync(getUserKey()));
}

function setUserLocal(user) {
  const normalized = normalizeUser(user);
  if (!normalized) return null;
  wx.setStorageSync(getUserKey(), normalized);
  return normalized;
}

let restoringPromise = null;

async function restoreUserFromCloud() {
  if (isLoggedIn()) return getUserLocal();
  if (!wx.cloud || !wx.cloud.callFunction) return null;
  if (restoringPromise) return restoringPromise;
  restoringPromise = (async () => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMyUserProfile',
      });
      const result = res && res.result;
      if (!(result && result.ok && result.user)) return null;
      return setUserLocal(result.user);
    } catch (err) {
      return null;
    } finally {
      restoringPromise = null;
    }
  })();
  return restoringPromise;
}

async function upsertUserProfileToCloud(userInput) {
  if (!wx.cloud || !wx.cloud.callFunction) {
    return { ok: false, message: '服务暂时不可用，请稍后重试' };
  }
  try {
    const res = await wx.cloud.callFunction({
      name: 'upsertUserProfile',
      data: {
        nickName: String((userInput && userInput.nickName) || '').slice(0, 40),
        avatarUrl: String((userInput && userInput.avatarUrl) || '').slice(0, 500),
      },
    });
    const result = res && res.result;
    if (!(result && result.ok && result.user)) {
      return {
        ok: false,
        message: safeUserMessage(result && result.message, '保存失败，请稍后重试'),
      };
    }
    const user = setUserLocal(result.user);
    return { ok: true, user };
  } catch (err) {
    return { ok: false, message: '保存失败，请稍后重试' };
  }
}

async function requireLogin(currentPageUrl) {
  if (isLoggedIn()) return true;
  await restoreUserFromCloud();
  if (isLoggedIn()) return true;
  const safeUrl = normalizeRedirectUrl(currentPageUrl);
  if (safeUrl) {
    wx.setStorageSync('iiqe_login_redirect', safeUrl);
  }
  wx.showToast({ title: '请先登录', icon: 'none' });
  wx.reLaunch({ url: '/pages/exam/me/me' });
  return false;
}

module.exports = {
  getUserKey,
  getUserLocal,
  setUserLocal,
  normalizeRedirectUrl,
  isLoggedIn,
  restoreUserFromCloud,
  upsertUserProfileToCloud,
  requireLogin,
};
