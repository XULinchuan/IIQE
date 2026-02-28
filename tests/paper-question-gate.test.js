const { loadPage, createPageInstance } = require('./pageTestUtils');

describe('paper/question access gate', () => {
  beforeEach(() => {
    wx.setNavigationBarTitle = jest.fn();
    wx.navigateBack = jest.fn();
    wx.redirectTo = jest.fn();
  });

  test('paper onLoad blocks premium paper without entitlement', async () => {
    jest.doMock('../utils/auth', () => ({ requireLogin: jest.fn().mockResolvedValue(true) }));
    jest.doMock('../utils/entitlement', () => ({
      hasPremiumAccessLocal: jest.fn(() => false),
      isAgentLocal: jest.fn(() => false),
      refreshPremiumAccess: jest.fn(),
      refreshMyAgentProfile: jest.fn(),
    }));
    jest.doMock('../utils/exam-data', () => ({
      getPaperById: jest.fn(() => ({ id: 'p1', title: 'P1', premium: true })),
      getQuestionsByPaperId: jest.fn(() => []),
      chapterTitleMap: {},
    }));

    const def = loadPage('../pages/exam/paper/paper.js');
    const page = createPageInstance(def);
    page.safeBack = jest.fn();

    await page.onLoad({ paperId: 'p1' });

    expect(wx.showToast).toHaveBeenCalledWith({ title: '该试卷需先授权', icon: 'none' });
    expect(page.safeBack).toHaveBeenCalledWith('/pages/exam/home/home');
  });

  test('paper onLoad allows premium paper when agent has access', async () => {
    jest.doMock('../utils/auth', () => ({ requireLogin: jest.fn().mockResolvedValue(true) }));
    jest.doMock('../utils/entitlement', () => ({
      hasPremiumAccessLocal: jest.fn(() => false),
      isAgentLocal: jest.fn(() => true),
      refreshPremiumAccess: jest.fn(),
      refreshMyAgentProfile: jest.fn(),
    }));
    jest.doMock('../utils/exam-data', () => ({
      getPaperById: jest.fn(() => ({ id: 'p1', title: 'P1', premium: true })),
      getQuestionsByPaperId: jest.fn(() => []),
      chapterTitleMap: {},
    }));

    const def = loadPage('../pages/exam/paper/paper.js');
    const page = createPageInstance(def);
    page.refreshStats = jest.fn();

    await page.onLoad({ paperId: 'p1' });

    expect(page.data.paperId).toBe('p1');
    expect(page.refreshStats).toHaveBeenCalled();
    expect(wx.showToast).not.toHaveBeenCalledWith({ title: '该试卷需先授权', icon: 'none' });
  });

  test('question onLoad blocks premium paper without entitlement', async () => {
    jest.doMock('../utils/auth', () => ({ requireLogin: jest.fn().mockResolvedValue(true) }));
    jest.doMock('../utils/entitlement', () => ({
      hasPremiumAccessLocal: jest.fn(() => false),
      isAgentLocal: jest.fn(() => false),
      refreshPremiumAccess: jest.fn(),
      refreshMyAgentProfile: jest.fn(),
    }));
    jest.doMock('../utils/exam-data', () => ({
      getPaperById: jest.fn(() => ({ id: 'p1', title: 'P1', premium: true })),
      getQuestionsByPaperId: jest.fn(() => []),
    }));

    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.backToPaper = jest.fn();

    await page.onLoad({ paperId: 'p1', mode: 'random' });

    expect(wx.showToast).toHaveBeenCalledWith({ title: '该试卷需先授权', icon: 'none' });
    expect(page.backToPaper).toHaveBeenCalled();
  });

  test('question onLoad enters when premium access is true', async () => {
    jest.doMock('../utils/auth', () => ({ requireLogin: jest.fn().mockResolvedValue(true) }));
    jest.doMock('../utils/entitlement', () => ({
      hasPremiumAccessLocal: jest.fn(() => true),
      isAgentLocal: jest.fn(() => false),
      refreshPremiumAccess: jest.fn(),
      refreshMyAgentProfile: jest.fn(),
    }));
    jest.doMock('../utils/exam-data', () => ({
      getPaperById: jest.fn(() => ({ id: 'p1', title: 'P1', premium: true })),
      getQuestionsByPaperId: jest.fn(() => [{ id: 'q1', chapter: '1.1', answer: 0 }]),
    }));

    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'p1', mode: 'random' });

    expect(page.data.current).toEqual(expect.objectContaining({ id: 'q1' }));
    expect(page.data.finished).toBe(false);
  });
});
