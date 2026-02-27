function getUserKey() {
  return 'iiqe_user_profile';
}

function isLoggedIn() {
  const user = wx.getStorageSync(getUserKey());
  return !!(user && user.id);
}

function requireLogin(currentPageUrl) {
  if (isLoggedIn()) return true;
  if (currentPageUrl) {
    wx.setStorageSync('iiqe_login_redirect', currentPageUrl);
  }
  wx.showToast({ title: '请先登录', icon: 'none' });
  wx.reLaunch({ url: '/pages/exam/me/me' });
  return false;
}

module.exports = {
  getUserKey,
  isLoggedIn,
  requireLogin,
};
