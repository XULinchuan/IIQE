const { loadPage, createPageInstance } = require('./pageTestUtils');

describe('integration: route stability', () => {
  beforeEach(() => {
    wx.navigateTo = jest.fn();
    wx.navigateBack = jest.fn();
    wx.redirectTo = jest.fn();
    wx.setNavigationBarTitle = jest.fn();
    wx.showToast = jest.fn();
  });

  test('paper.safeBack uses navigateBack when stack has history', () => {
    jest.doMock('../utils/auth', () => ({ requireLogin: jest.fn().mockResolvedValue(true) }));
    jest.doMock('../utils/entitlement', () => ({
      hasPremiumAccessLocal: jest.fn(() => true),
      isAgentLocal: jest.fn(() => false),
      refreshPremiumAccess: jest.fn(),
      refreshMyAgentProfile: jest.fn(),
    }));
    jest.doMock('../utils/exam-data', () => ({
      getPaperById: jest.fn(),
      getQuestionsByPaperId: jest.fn(() => []),
      chapterTitleMap: {},
    }));

    global.getCurrentPages = () => [{}, {}];

    const def = loadPage('../pages/exam/paper/paper.js');
    const page = createPageInstance(def);
    page.safeBack('/pages/exam/home/home');

    expect(wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });
    expect(wx.redirectTo).not.toHaveBeenCalled();
  });

  test('paper.safeBack redirects to fallback when no history', () => {
    jest.doMock('../utils/auth', () => ({ requireLogin: jest.fn().mockResolvedValue(true) }));
    jest.doMock('../utils/entitlement', () => ({
      hasPremiumAccessLocal: jest.fn(() => true),
      isAgentLocal: jest.fn(() => false),
      refreshPremiumAccess: jest.fn(),
      refreshMyAgentProfile: jest.fn(),
    }));
    jest.doMock('../utils/exam-data', () => ({
      getPaperById: jest.fn(),
      getQuestionsByPaperId: jest.fn(() => []),
      chapterTitleMap: {},
    }));

    global.getCurrentPages = () => [{}];

    const def = loadPage('../pages/exam/paper/paper.js');
    const page = createPageInstance(def);
    page.safeBack('/pages/exam/home/home');

    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/exam/home/home' });
  });

  test('question.backToPaper routes to paper when no history and paperId exists', () => {
    jest.doMock('../utils/auth', () => ({ requireLogin: jest.fn().mockResolvedValue(true) }));
    jest.doMock('../utils/entitlement', () => ({
      hasPremiumAccessLocal: jest.fn(() => true),
      isAgentLocal: jest.fn(() => false),
      refreshPremiumAccess: jest.fn(),
      refreshMyAgentProfile: jest.fn(),
    }));
    jest.doMock('../utils/exam-data', () => ({
      getPaperById: jest.fn(),
      getQuestionsByPaperId: jest.fn(() => []),
    }));

    global.getCurrentPages = () => [{}];

    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.data.paperId = 'p_202602';

    page.backToPaper();

    expect(wx.redirectTo).toHaveBeenCalledWith({
      url: '/pages/exam/paper/paper?paperId=p_202602',
    });
  });

  test('question.backToPaper routes home when no history and paperId missing', () => {
    jest.doMock('../utils/auth', () => ({ requireLogin: jest.fn().mockResolvedValue(true) }));
    jest.doMock('../utils/entitlement', () => ({
      hasPremiumAccessLocal: jest.fn(() => true),
      isAgentLocal: jest.fn(() => false),
      refreshPremiumAccess: jest.fn(),
      refreshMyAgentProfile: jest.fn(),
    }));
    jest.doMock('../utils/exam-data', () => ({
      getPaperById: jest.fn(),
      getQuestionsByPaperId: jest.fn(() => []),
    }));

    global.getCurrentPages = () => [{}];

    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);

    page.backToPaper();

    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/exam/home/home' });
  });

  test('home.goPaper falls back to redirectTo when navigateTo fails', async () => {
    jest.doMock('../utils/auth', () => ({ requireLogin: jest.fn().mockResolvedValue(true) }));
    jest.doMock('../utils/entitlement', () => ({
      hasPremiumAccessLocal: jest.fn(() => true),
      setPremiumAccess: jest.fn(),
      refreshPremiumAccess: jest.fn(),
      isAgentLocal: jest.fn(() => false),
      refreshMyAgentProfile: jest.fn(),
      getActivationQrLocal: jest.fn(() => '/assets/wechat_qr.jpg'),
      refreshActivationQrByUser: jest.fn(async () => '/assets/wechat_qr.jpg'),
    }));
    jest.doMock('../utils/exam-data', () => ({
      getPapersByType: jest.fn(() => [{ id: 'p1', premium: false }]),
    }));

    wx.navigateTo.mockImplementation(({ fail }) => fail && fail());

    const def = loadPage('../pages/exam/home/home.js');
    const page = createPageInstance(def);
    page.setData({ papers: [{ id: 'p1', premium: false }] });

    await page.goPaper({ currentTarget: { dataset: { id: 'p1' } } });

    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/exam/paper/paper?paperId=p1' });
  });
});
