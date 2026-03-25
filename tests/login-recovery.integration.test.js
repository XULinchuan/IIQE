const { loadPage, createPageInstance } = require('./pageTestUtils');

describe('integration: login recovery across pages', () => {
  beforeEach(() => {
    wx.reLaunch = jest.fn();
    wx.redirectTo = jest.fn();
    wx.showToast = jest.fn();
    wx.getUserProfile = jest.fn();
  });

  test('home onShow keeps guest state and loads trial papers without forcing login', async () => {
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        ok: true,
        user: {
          id: 'openid_auto',
          nickName: 'AutoUser',
          avatarUrl: 'cloud://avatar-auto.jpg',
          createdAt: 100,
          updatedAt: 101,
        },
      },
    });

    jest.doMock('../utils/entitlement', () => ({
      hasPremiumAccessLocal: jest.fn(() => false),
      setPremiumAccess: jest.fn(),
      refreshPremiumAccess: jest.fn(async () => false),
      isAgentLocal: jest.fn(() => false),
      refreshMyAgentProfile: jest.fn(async () => ({ isAgent: false, status: '' })),
      getActivationQrLocal: jest.fn(() => '/assets/wechat_qr.jpg'),
      refreshActivationQrByUser: jest.fn(async () => '/assets/wechat_qr.jpg'),
    }));
    jest.doMock('../utils/exam-data', () => ({
      getPapersByType: jest.fn(() => [{ id: 'p1', premium: false }]),
    }));

    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);

    await page.onShow();

    expect(wx.reLaunch).not.toHaveBeenCalledWith({ url: '/pages/exam/me/me' });
    expect(wx.getStorageSync('iiqe_user_profile')).toBeUndefined();
    expect(page.data.papers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'p1', premium: false, unlocked: true }),
    ]));
  });

  test('blocked page sets redirect and login page consumes redirect after login', async () => {
    wx.cloud.callFunction.mockResolvedValueOnce({ result: { ok: true, user: null } });

    const { requireLogin } = require('../utils/auth');
    const allow = await requireLogin('/pages/exam/paper/paper?paperId=p_1');
    expect(allow).toBe(false);
    expect(wx.reLaunch).toHaveBeenCalledWith({ url: '/pages/exam/me/me' });
    expect(wx.getStorageSync('iiqe_login_redirect')).toBe('/pages/exam/paper/paper?paperId=p_1');

    jest.doMock('../utils/entitlement', () => ({
      hasPremiumAccessLocal: jest.fn(() => false),
      setPremiumAccess: jest.fn(),
      refreshPremiumAccess: jest.fn(async () => false),
      setAgentProfile: jest.fn(),
      getAgentProfileLocal: jest.fn(() => null),
      refreshMyAgentProfile: jest.fn(async () => ({ isAgent: false, status: '' })),
      getActivationQrLocal: jest.fn(() => '/assets/wechat_qr.jpg'),
      refreshActivationQrByUser: jest.fn(async () => '/assets/wechat_qr.jpg'),
    }));

    const meDef = loadPage('../pages/exam/me/me.js');
    const mePage = createPageInstance(meDef);

    wx.getUserProfile.mockImplementation(({ success }) => {
      success({
        userInfo: {
          nickName: 'Leo',
          avatarUrl: 'https://example.com/a.jpg',
        },
      });
    });

    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        ok: true,
        user: {
          id: 'openid_2',
          nickName: 'Leo',
          avatarUrl: 'https://example.com/a.jpg',
          createdAt: 200,
          updatedAt: 201,
        },
      },
    });

    mePage.loginOrRegister();
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(wx.redirectTo).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/exam/paper/paper?paperId=p_1' }));
    expect(wx.getStorageSync('iiqe_login_redirect')).toBeUndefined();
    expect(wx.getStorageSync('iiqe_user_profile')).toEqual(expect.objectContaining({ id: 'openid_2' }));
  });
});
