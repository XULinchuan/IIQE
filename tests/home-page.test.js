const { loadPage, createPageInstance } = require('./pageTestUtils');

function mockDeps({ localPremium = false, localAgent = false, loggedIn = true } = {}) {
  jest.doMock('../utils/auth', () => ({
    getUserLocal: jest.fn(() => (loggedIn ? { id: 'u1' } : null)),
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
  test('onLoad loads papers and onShow loads entitlement', async () => {
    mockDeps();
    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);
    page.loadEntitlement = jest.fn();
    page.loadPapers = jest.fn();

    page.onLoad();
    await page.onShow();

    expect(page.loadPapers).toHaveBeenCalledTimes(1);
    expect(page.loadEntitlement).toHaveBeenCalledTimes(1);
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

  test('goPaper requires login before opening premium activation dialog', async () => {
    mockDeps({ loggedIn: false });
    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);
    page.loadActivationQr = jest.fn();
    page.setData({ papers: [{ id: 'p2', premium: true }], hasPremiumAccess: false, isAgent: false });

    await page.goPaper({ currentTarget: { dataset: { id: 'p2' } } });

    expect(wx.showToast).toHaveBeenCalledWith({ title: '请先登录', icon: 'none' });
    expect(wx.navigateTo).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/pages/exam/me/me' }),
    );
    expect(page.data.showActivationDialog).toBe(false);
    expect(page.loadActivationQr).not.toHaveBeenCalled();
  });

  test('goPaper login redirect falls back when navigateTo fails', async () => {
    mockDeps({ loggedIn: false });
    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);
    page.setData({ papers: [{ id: 'p2', premium: true }], hasPremiumAccess: false, isAgent: false });
    wx.navigateTo.mockImplementation(({ fail }) => fail && fail());

    await page.goPaper({ currentTarget: { dataset: { id: 'p2' } } });

    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/exam/me/me' });
  });

  test('goPaper rechecks entitlement and enters paper when cloud says authorized', async () => {
    mockDeps({ localPremium: false, localAgent: false });
    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);
    page.setData({ papers: [{ id: 'p2', premium: true }], hasPremiumAccess: false, isAgent: false });

    const entitlement = require('../utils/entitlement');
    entitlement.refreshPremiumAccess.mockResolvedValueOnce(true);
    entitlement.refreshMyAgentProfile.mockResolvedValueOnce({ isAgent: false, status: '' });

    await page.goPaper({ currentTarget: { dataset: { id: 'p2' } } });

    expect(page.data.showActivationDialog).toBe(false);
    expect(wx.navigateTo).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/pages/exam/paper/paper?paperId=p2' }),
    );
  });

  test('goPaper opens activation dialog when entitlement refresh throws', async () => {
    mockDeps({ localPremium: false, localAgent: false, loggedIn: true });
    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);
    page.loadActivationQr = jest.fn();
    page.setData({ papers: [{ id: 'p2', premium: true }], hasPremiumAccess: false, isAgent: false });

    const entitlement = require('../utils/entitlement');
    entitlement.refreshPremiumAccess.mockRejectedValueOnce(new Error('down'));
    entitlement.refreshMyAgentProfile.mockRejectedValueOnce(new Error('down'));

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

  test('previewActivationQr opens image preview with resolved path', async () => {
    mockDeps();
    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);
    page.setData({ activationQrSrc: '/assets/wechat_qr.jpg' });

    wx.getImageInfo = jest.fn(({ success }) => success({ path: '/tmp/home-qr.jpg' }));
    wx.previewImage = jest.fn();

    await page.previewActivationQr();

    expect(wx.previewImage).toHaveBeenCalledWith({
      current: '/tmp/home-qr.jpg',
      urls: ['/tmp/home-qr.jpg'],
    });
  });

  test('saveActivationQr shows setting modal on permission denied', async () => {
    mockDeps();
    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);
    page.setData({ activationQrSrc: '/assets/wechat_qr.jpg' });

    wx.getImageInfo = jest.fn(({ success }) => success({ path: '/tmp/home-qr.jpg' }));
    wx.saveImageToPhotosAlbum = jest.fn(({ fail }) => fail({ errMsg: 'saveImageToPhotosAlbum:fail auth denied' }));
    wx.showModal = jest.fn(({ success }) => success({ confirm: true }));
    wx.openSetting = jest.fn();

    await page.saveActivationQr();

    expect(wx.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '需要相册权限',
        content: '请在设置中允许保存到相册后重试',
      }),
    );
    expect(wx.openSetting).toHaveBeenCalled();
  });

  test('previewActivationQr prefers getTempFileURL for cloud file', async () => {
    mockDeps();
    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);
    page.setData({ activationQrSrc: 'cloud://x/qr.jpg' });

    wx.cloud.getTempFileURL = jest.fn(async () => ({
      fileList: [{ tempFileURL: 'https://tmp.example.com/home-qr.jpg' }],
    }));
    wx.previewImage = jest.fn();

    await page.previewActivationQr();

    expect(wx.cloud.getTempFileURL).toHaveBeenCalledWith({ fileList: ['cloud://x/qr.jpg'] });
    expect(wx.previewImage).toHaveBeenCalledWith({
      current: 'https://tmp.example.com/home-qr.jpg',
      urls: ['https://tmp.example.com/home-qr.jpg'],
    });
  });

  test('open/close activation dialog resets qr state to avoid flashing old/default image', async () => {
    mockDeps();
    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);
    page.setData({ activationQrSrc: '/assets/wechat_qr.jpg', activationQrLoading: false });
    page.loadActivationQr = jest.fn();

    page.openActivationDialog();
    expect(page.data.showActivationDialog).toBe(true);
    expect(page.data.activationQrLoading).toBe(true);
    expect(page.data.activationQrSrc).toBe('');

    page.setData({ activationQrSrc: 'cloud://agent/qr.jpg', activationQrLoading: false });
    page.closeActivationDialog();
    expect(page.data.showActivationDialog).toBe(false);
    expect(page.data.activationQrLoading).toBe(false);
    expect(page.data.activationQrSrc).toBe('');
  });
});
