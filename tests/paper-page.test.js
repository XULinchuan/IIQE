const { loadPage, createPageInstance } = require('./pageTestUtils');

function mockDeps({
  premiumLocal = false,
  agentLocal = false,
  refreshPremium = false,
  refreshAgent = false,
  requireOk = true,
  paperPremium = true,
} = {}) {
  jest.doMock('../utils/auth', () => ({
    requireLogin: jest.fn().mockResolvedValue(requireOk),
  }));
  jest.doMock('../utils/entitlement', () => ({
    hasPremiumAccessLocal: jest.fn(() => premiumLocal),
    isAgentLocal: jest.fn(() => agentLocal),
    refreshPremiumAccess: jest.fn(async () => refreshPremium),
    refreshMyAgentProfile: jest.fn(async () => ({ isAgent: refreshAgent, status: refreshAgent ? 'active' : 'disabled' })),
  }));
  jest.doMock('../utils/exam-data', () => ({
    getPaperById: jest.fn((id) => (id ? { id, title: 'Paper', premium: paperPremium } : null)),
    getQuestionsByPaperId: jest.fn(() => [
      { id: 'q1', chapter: '1.1', answer: 0 },
      { id: 'q2', chapter: '1.2', answer: 1 },
    ]),
    chapterTitleMap: { '1': '第1章' },
  }));
}

describe('pages/exam/paper/paper.js', () => {
  test('enforcePaperAccess returns true after refreshed entitlement', async () => {
    mockDeps({ premiumLocal: false, agentLocal: false, refreshPremium: true, refreshAgent: false });
    const def = loadPage('../pages/exam/paper/paper.js');
    const page = createPageInstance(def);
    page.setData({ paperId: 'p1' });

    const ok = await page.enforcePaperAccess();

    expect(ok).toBe(true);
  });

  test('enforcePaperAccess denies and safeBack on no access', async () => {
    mockDeps({ premiumLocal: false, agentLocal: false, refreshPremium: false, refreshAgent: false });
    const def = loadPage('../pages/exam/paper/paper.js');
    const page = createPageInstance(def);
    page.safeBack = jest.fn();
    page.setData({ paperId: 'p1' });

    const ok = await page.enforcePaperAccess();

    expect(ok).toBe(false);
    expect(wx.showToast).toHaveBeenCalledWith({ title: '授权状态已失效', icon: 'none' });
    expect(page.safeBack).toHaveBeenCalledWith('/pages/exam/home/home');
  });

  test('refreshStats computes metrics and chapter stats', () => {
    mockDeps({ premiumLocal: true, agentLocal: false });
    const def = loadPage('../pages/exam/paper/paper.js');
    const page = createPageInstance(def);

    wx.setStorageSync('iiqe_progress_p1', {
      answers: { q1: 0, q2: 0 },
      correctCount: 1,
      favorites: [],
      wrongIds: ['q2'],
    });
    page.setData({ paperId: 'p1' });

    page.refreshStats();

    expect(page.data.total).toBe(2);
    expect(page.data.answered).toBe(2);
    expect(page.data.correct).toBe(1);
    expect(page.data.accuracy).toBe('50%');
    expect(page.data.chapterStats[0]).toEqual(expect.objectContaining({ title: '第1章', total: 2 }));
  });

  test('openQuestion does not navigate when enforce fails', async () => {
    mockDeps({ premiumLocal: true });
    const def = loadPage('../pages/exam/paper/paper.js');
    const page = createPageInstance(def);
    page.enforcePaperAccess = jest.fn(async () => false);

    await page.openQuestion('/pages/exam/question/question?paperId=p1&mode=random');

    expect(wx.navigateTo).not.toHaveBeenCalled();
  });

  test('onLoad allows trial paper without login', async () => {
    mockDeps({ requireOk: false, paperPremium: false, premiumLocal: false, agentLocal: false });
    const def = loadPage('../pages/exam/paper/paper.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'p_trial' });

    expect(page.data.paperId).toBe('p_trial');
    expect(wx.setNavigationBarTitle).toHaveBeenCalledWith({ title: 'Paper' });
    expect(wx.showToast).not.toHaveBeenCalledWith({ title: '请先登录', icon: 'none' });
  });
});
