const { loadPage, createPageInstance } = require('./pageTestUtils');

function mockDeps({
  premiumLocal = false,
  agentLocal = false,
  refreshPremium = false,
  refreshAgent = false,
  requireOk = true,
  paperPremium = true,
  questions = null,
  dynamicMockPaper = false,
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
  jest.doMock('../pkg-exam/utils/exam-data', () => ({
    getPaperById: jest.fn((id) => (id ? {
      id,
      title: 'Paper',
      premium: paperPremium,
      isDynamicMock: dynamicMockPaper,
    } : null)),
    getQuestionsByPaperId: jest.fn(() => questions || [
      { id: 'q1', chapter: '1.1', answer: 0 },
      { id: 'q2', chapter: '1.2', answer: 1 },
    ]),
    chapterTitleMap: { '1': '第1章' },
    isDynamicMockPaperId: jest.fn(() => dynamicMockPaper),
    prepareDynamicMockSession: jest.fn(() => null),
  }));
}

describe('pkg-exam/paper/paper.js', () => {
  test('enforcePaperAccess returns true after refreshed entitlement', async () => {
    mockDeps({ premiumLocal: false, agentLocal: false, refreshPremium: true, refreshAgent: false });
    const def = loadPage('../pkg-exam/paper/paper.js');
    const page = createPageInstance(def);
    page.setData({ paperId: 'p1' });

    const ok = await page.enforcePaperAccess();

    expect(ok).toBe(true);
  });

  test('enforcePaperAccess denies and safeBack on no access', async () => {
    mockDeps({ premiumLocal: false, agentLocal: false, refreshPremium: false, refreshAgent: false });
    const def = loadPage('../pkg-exam/paper/paper.js');
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
    const def = loadPage('../pkg-exam/paper/paper.js');
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

  test('refreshStats exposes pass requirement for dynamic mock paper', () => {
    mockDeps({
      premiumLocal: true,
      dynamicMockPaper: true,
      questions: new Array(80).fill(null).map((_, i) => ({ id: `q${i + 1}`, chapter: '1.1', answer: i % 4 })),
    });
    const def = loadPage('../pkg-exam/paper/paper.js');
    const page = createPageInstance(def);
    page.setData({ paperId: 'paper4-random-mock' });

    page.refreshStats();

    expect(page.data.isDynamicMockPaper).toBe(true);
    expect(page.data.passScore).toBe(56);
    expect(page.data.passRateText).toBe('及格要求 70%（56题）');
  });

  test('refreshStats groups guideline refs into a dedicated guideline chapter', () => {
    mockDeps({
      premiumLocal: true,
      questions: [
        { id: 'q1', chapter: '<註冊中 介人操守 要求指引 >III.19b', answer: 0 },
        { id: 'q2', chapter: '<註冊中 介人操守 要求指引 > III.18', answer: 1 },
      ],
    });
    const def = loadPage('../pkg-exam/paper/paper.js');
    const page = createPageInstance(def);
    page.setData({ paperId: 'p1' });

    page.refreshStats();

    expect(page.data.chapterStats).toHaveLength(1);
    expect(page.data.chapterStats[0]).toEqual(expect.objectContaining({
      chapterNo: '<註冊中介人操守要求指引>',
      total: 2,
    }));
  });

  test('refreshStats normalizes appendix roman case and keeps 2017 material standalone', () => {
    mockDeps({
      premiumLocal: true,
      questions: [
        { id: 'q1', chapter: '附錄Vi.e', answer: 0 },
        { id: 'q2', chapter: '附錄VI.b', answer: 1 },
        { id: 'q3', chapter: '2017年補 充資料', answer: 0 },
      ],
    });
    const def = loadPage('../pkg-exam/paper/paper.js');
    const page = createPageInstance(def);
    page.setData({ paperId: 'p1' });

    page.refreshStats();

    const appendix = page.data.chapterStats.find((item) => item.chapterNo === '附錄VI');
    const y2017 = page.data.chapterStats.find((item) => item.chapterNo === '2017年補充資料');
    expect(appendix).toEqual(expect.objectContaining({ total: 2 }));
    expect(y2017).toEqual(expect.objectContaining({ total: 1, title: '2017年補充資料' }));
  });

  test('openQuestion does not navigate when enforce fails', async () => {
    mockDeps({ premiumLocal: true });
    const def = loadPage('../pkg-exam/paper/paper.js');
    const page = createPageInstance(def);
    page.enforcePaperAccess = jest.fn(async () => false);

    await page.openQuestion('/pkg-exam/question/question?paperId=p1&mode=random');

    expect(wx.navigateTo).not.toHaveBeenCalled();
  });

  test('onLoad allows trial paper without login', async () => {
    mockDeps({ requireOk: false, paperPremium: false, premiumLocal: false, agentLocal: false });
    const def = loadPage('../pkg-exam/paper/paper.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'p_trial' });

    expect(page.data.paperId).toBe('p_trial');
    expect(wx.setNavigationBarTitle).toHaveBeenCalledWith({ title: 'Paper' });
    expect(wx.showToast).not.toHaveBeenCalledWith({ title: '请先登录', icon: 'none' });
  });
});
