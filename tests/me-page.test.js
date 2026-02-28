const { loadPage, createPageInstance } = require('./pageTestUtils');

function mockDeps({ user = null, premium = false, agentProfile = null } = {}) {
  const restoreUserFromCloud = jest.fn(async () => user);
  const upsertUserProfileToCloud = jest.fn(async () => ({ ok: true, user: user || { id: 'u1', nickName: 'N', avatarUrl: '' } }));

  jest.doMock('../utils/auth', () => ({
    getUserLocal: jest.fn(() => user),
    normalizeRedirectUrl: jest.fn((u) => u),
    restoreUserFromCloud,
    upsertUserProfileToCloud,
  }));

  jest.doMock('../utils/entitlement', () => ({
    hasPremiumAccessLocal: jest.fn(() => premium),
    setPremiumAccess: jest.fn(),
    refreshPremiumAccess: jest.fn(async () => premium),
    setAgentProfile: jest.fn(),
    getAgentProfileLocal: jest.fn(() => agentProfile),
    refreshMyAgentProfile: jest.fn(async () => agentProfile || { isAgent: false, status: '', agentId: '' }),
    getActivationQrLocal: jest.fn(() => '/assets/wechat_qr.jpg'),
    refreshActivationQrByUser: jest.fn(async () => '/assets/wechat_qr.jpg'),
  }));

  return { restoreUserFromCloud, upsertUserProfileToCloud };
}

describe('pages/exam/me/me.js', () => {
  test('loadUser restores from cloud when local empty', async () => {
    const { restoreUserFromCloud } = mockDeps({ user: null });
    restoreUserFromCloud.mockResolvedValueOnce({ id: 'u2', nickName: 'L' });

    const def = loadPage('../pages/exam/me/me.js');
    const page = createPageInstance(def);
    await page.loadUser();

    expect(page.data.isLoggedIn).toBe(true);
    expect(page.data.user).toEqual(expect.objectContaining({ id: 'u2' }));
  });

  test('loginOrRegister handles profile denial', () => {
    mockDeps({ user: null });
    const def = loadPage('../pages/exam/me/me.js');
    const page = createPageInstance(def);

    wx.getUserProfile.mockImplementation(({ fail }) => fail && fail());
    page.loginOrRegister();

    expect(wx.showToast).toHaveBeenCalledWith({ title: '未授权微信昵称', icon: 'none' });
  });

  test('loginOrRegister handles cloud sync failure', async () => {
    const { upsertUserProfileToCloud } = mockDeps({ user: null });
    upsertUserProfileToCloud.mockResolvedValueOnce({ ok: false, message: '保存失败' });

    const def = loadPage('../pages/exam/me/me.js');
    const page = createPageInstance(def);
    wx.getUserProfile.mockImplementation(({ success }) => success({ userInfo: { nickName: 'Leo' } }));

    page.loginOrRegister();
    await Promise.resolve();

    expect(wx.showToast).toHaveBeenCalledWith({ title: '保存失败', icon: 'none' });
  });

  test('openActivationDialog blocks when already authorized', () => {
    mockDeps({ premium: true });
    const def = loadPage('../pages/exam/me/me.js');
    const page = createPageInstance(def);
    page.setData({ hasPremiumAccess: true });

    page.openActivationDialog();

    expect(wx.showToast).toHaveBeenCalledWith({ title: '已授权，无需重复输入', icon: 'none' });
  });

  test('redeemActivationCode guards on login/code/cloud', async () => {
    mockDeps();
    const def = loadPage('../pages/exam/me/me.js');
    const page = createPageInstance(def);

    await page.redeemActivationCode();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '请先登录', icon: 'none' });

    page.setData({ isLoggedIn: true, activationCode: '' });
    await page.redeemActivationCode();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '请输入授权码', icon: 'none' });

    const oldCloud = wx.cloud;
    wx.cloud = null;
    page.setData({ activationCode: 'ABCDEFGH' });
    await page.redeemActivationCode();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '服务暂时不可用，请稍后重试', icon: 'none' });
    wx.cloud = oldCloud;
  });

  test('redeemActivationCode success and failure paths', async () => {
    mockDeps();
    const def = loadPage('../pages/exam/me/me.js');
    const page = createPageInstance(def);
    page.setData({ isLoggedIn: true, activationCode: 'ABCDEFGH' });

    wx.cloud.callFunction.mockResolvedValueOnce({ result: { ok: true } });
    await page.redeemActivationCode();
    expect(page.data.hasPremiumAccess).toBe(true);

    page.setData({ activationCode: 'ABCDEFGH' });
    wx.cloud.callFunction.mockResolvedValueOnce({ result: { ok: false, message: '授权码不存在' } });
    await page.redeemActivationCode();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '授权码不存在', icon: 'none' });

    page.setData({ activationCode: 'ABCDEFGH' });
    wx.cloud.callFunction.mockRejectedValueOnce(new Error('boom'));
    await page.redeemActivationCode();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '授权失败，请稍后重试', icon: 'none' });
  });

  test('redeemAgentCode handles success and fail', async () => {
    mockDeps();
    const def = loadPage('../pages/exam/me/me.js');
    const page = createPageInstance(def);

    page.setData({ agentCode: '' });
    await page.redeemAgentCode();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '请输入代理人码', icon: 'none' });

    page.setData({ agentCode: 'AGENT001' });
    wx.cloud.callFunction.mockResolvedValueOnce({ result: { ok: true, agentId: 'agt_1', profileStatus: 'active' } });
    await page.redeemAgentCode();
    expect(page.data.isAgent).toBe(true);

    page.setData({ agentCode: 'AGENT002' });
    wx.cloud.callFunction.mockResolvedValueOnce({ result: { ok: false, message: '代理人码不存在' } });
    await page.redeemAgentCode();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '代理人码不存在', icon: 'none' });
  });

  test('onChooseAvatar handles no login / no avatar / upload fail / success', async () => {
    const { upsertUserProfileToCloud } = mockDeps({ user: { id: 'u1', nickName: 'N' } });
    const def = loadPage('../pages/exam/me/me.js');
    const page = createPageInstance(def);

    await page.onChooseAvatar({ detail: { avatarUrl: '/tmp/a.jpg' } });

    page.setData({ isLoggedIn: true, user: { id: 'u1', nickName: 'N' } });
    await page.onChooseAvatar({ detail: {} });
    expect(wx.showToast).toHaveBeenCalledWith({ title: '未选择头像', icon: 'none' });

    wx.cloud.uploadFile.mockRejectedValueOnce(new Error('up fail'));
    await page.onChooseAvatar({ detail: { avatarUrl: '/tmp/a.jpg' } });
    expect(wx.showToast).toHaveBeenCalledWith({ title: '头像更新失败，请稍后重试', icon: 'none' });

    wx.cloud.uploadFile.mockResolvedValueOnce({ fileID: 'cloud://avatar.jpg' });
    upsertUserProfileToCloud.mockResolvedValueOnce({ ok: true, user: { id: 'u1', nickName: 'N', avatarUrl: 'cloud://avatar.jpg' } });
    await page.onChooseAvatar({ detail: { avatarUrl: '/tmp/a.jpg' } });
    expect(page.data.user.avatarUrl).toBe('cloud://avatar.jpg');
  });

  test('openAgentCenter and back route fallback', () => {
    mockDeps();
    const def = loadPage('../pages/exam/me/me.js');
    const page = createPageInstance(def);

    page.openAgentCenter();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '请先开通代理人', icon: 'none' });

    page.setData({ isAgent: true });
    wx.navigateTo.mockImplementation(({ fail }) => fail && fail());
    page.openAgentCenter();
    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/agent/qrcode/qrcode' });

    global.getCurrentPages = () => [{}, {}];
    page.back();
    expect(wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });

    global.getCurrentPages = () => [{}];
    page.back();
    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/exam/home/home' });
  });
});
