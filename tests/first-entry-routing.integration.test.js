const { loadPage, createPageInstance } = require('./pageTestUtils');

function loadAppDef() {
  let captured = null;
  global.App = jest.fn((def) => {
    captured = def;
    return def;
  });
  // eslint-disable-next-line global-require
  require('../app.js');
  return captured;
}

function loadHomePageAsGuest() {
  jest.doMock('../utils/auth', () => ({
    getUserLocal: jest.fn(() => null),
  }));
  jest.doMock('../utils/entitlement', () => ({
    hasPremiumAccessLocal: jest.fn(() => false),
    refreshPremiumAccess: jest.fn(async () => false),
    setPremiumAccess: jest.fn(),
    isAgentLocal: jest.fn(() => false),
    refreshMyAgentProfile: jest.fn(async () => ({ isAgent: false, status: '' })),
    refreshActivationQrByUser: jest.fn(async () => '/assets/wechat_qr.jpg'),
  }));
  jest.doMock('../utils/exam-catalog', () => ({
    getPapersByType: jest.fn(() => [{ id: 'p2', premium: true, total: 100, title: '2026年2月真题' }]),
  }));
  const def = loadPage('../pages/exam/home/home.js');
  return createPageInstance(def);
}

describe('first entry routing integration', () => {
  test('referral entry lands on home; guest opening premium paper is redirected to me login', async () => {
    wx.cloud.callFunction = jest.fn().mockResolvedValue({});

    const app = loadAppDef();
    app.onShow({ path: 'pages/exam/me/me', query: { ref: 'agt_ref_1' } });

    expect(wx.reLaunch).toHaveBeenCalledWith({
      url: '/pages/exam/home/home?ref=agt_ref_1',
    });

    const home = loadHomePageAsGuest();
    home.setData({
      papers: [{ id: 'p2', premium: true, total: 100, title: '2026年2月真题' }],
      hasPremiumAccess: false,
      isAgent: false,
    });

    await home.goPaper({ currentTarget: { dataset: { id: 'p2' } } });

    expect(wx.showToast).toHaveBeenCalledWith({ title: '请先登录', icon: 'none' });
    expect(wx.navigateTo).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/pages/exam/me/me' }),
    );
    expect(home.data.showActivationDialog).toBe(false);
  });
});
