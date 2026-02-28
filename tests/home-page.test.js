const { loadPage, createPageInstance } = require('./pageTestUtils');

function mockDeps({ requireOk = true, localPremium = false, localAgent = false } = {}) {
  jest.doMock('../utils/auth', () => ({
    requireLogin: jest.fn().mockResolvedValue(requireOk),
  }));
  const refreshPremiumAccess = jest.fn(async () => localPremium);
  const refreshMyAgentProfile = jest.fn(async () => ({ isAgent: localAgent, status: localAgent ? 'active' : '' }));
  jest.doMock('../utils/entitlement', () => ({
    hasPremiumAccessLocal: jest.fn(() => localPremium),
    refreshPremiumAccess,
    setPremiumAccess: jest.fn(),
    isAgentLocal: jest.fn(() => localAgent),
    refreshMyAgentProfile,
    getActivationQrLocal: jest.fn(() => '/assets/wechat_qr.jpg'),
    refreshActivationQrByUser: jest.fn(async () => '/assets/wechat_qr.jpg'),
  }));
  jest.doMock('../utils/exam-data', () => ({
    getPapersByType: jest.fn(() => [
      { id: 'p1', premium: false },
      { id: 'p2', premium: true },
    ]),
  }));
}

describe('pages/exam/home/home.js', () => {
  test('onShow exits when login required fails', async () => {
    mockDeps({ requireOk: false });
    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);
    page.loadEntitlement = jest.fn();
    page.loadPapers = jest.fn();

    await page.onShow();

    expect(page.loadEntitlement).not.toHaveBeenCalled();
    expect(page.loadPapers).not.toHaveBeenCalled();
  });

  test('switchType ignores invalid type and switches valid type', () => {
    mockDeps();
    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);
    page.loadPapers = jest.fn();

    page.switchType({ currentTarget: { dataset: { type: '' } } });
    page.switchType({ currentTarget: { dataset: { type: '卷三' } } });
    expect(page.loadPapers).not.toHaveBeenCalled();

    page.switchType({ currentTarget: { dataset: { type: '卷一' } } });
    expect(page.data.activeType).toBe('卷一');
    expect(page.loadPapers).toHaveBeenCalled();
  });

  test('goPaper opens activation dialog when premium locked', async () => {
    mockDeps();
    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);
    page.loadActivationQr = jest.fn();
    page.setData({ papers: [{ id: 'p2', premium: true }], hasPremiumAccess: false, isAgent: false });

    await page.goPaper({ currentTarget: { dataset: { id: 'p2' } } });

    expect(page.data.showActivationDialog).toBe(true);
    expect(page.loadActivationQr).toHaveBeenCalled();
  });

  test('redeemActivationCode handles guard/success/fail', async () => {
    mockDeps();
    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);

    await page.redeemActivationCode();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '请输入授权码', icon: 'none' });

    page.setData({ activationCode: 'ABCDEFGH' });
    const oldCloud = wx.cloud;
    wx.cloud = null;
    await page.redeemActivationCode();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '服务暂时不可用，请稍后重试', icon: 'none' });
    wx.cloud = oldCloud;

    page.setData({ activationCode: 'ABCDEFGH' });
    wx.cloud.callFunction.mockResolvedValueOnce({ result: { ok: true } });
    await page.redeemActivationCode();
    expect(page.data.hasPremiumAccess).toBe(true);

    page.setData({ activationCode: 'ABCDEFGH' });
    wx.cloud.callFunction.mockResolvedValueOnce({ result: { ok: false, message: '授权码不存在' } });
    await page.redeemActivationCode();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '授权码不存在', icon: 'none' });
  });
});
