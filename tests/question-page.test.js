const { loadPage, createPageInstance } = require('./pageTestUtils');

function mockDeps({ premiumLocal = true, agentLocal = false, refreshPremium = false, refreshAgent = false } = {}) {
  jest.doMock('../utils/auth', () => ({
    requireLogin: jest.fn().mockResolvedValue(true),
  }));
  jest.doMock('../utils/entitlement', () => ({
    hasPremiumAccessLocal: jest.fn(() => premiumLocal),
    isAgentLocal: jest.fn(() => agentLocal),
    refreshPremiumAccess: jest.fn(async () => refreshPremium),
    refreshMyAgentProfile: jest.fn(async () => ({ isAgent: refreshAgent, status: refreshAgent ? 'active' : 'disabled' })),
  }));
  jest.doMock('../utils/exam-data', () => ({
    getPaperById: jest.fn((paperId) => (paperId ? { id: paperId, title: 'Test Paper', premium: true } : null)),
    getQuestionsByPaperId: jest.fn(() => [
      { id: 'q1', chapter: '1.1', answer: 0 },
      { id: 'q2', chapter: '1.2', answer: 1 },
      { id: 'q3', chapter: '2', answer: 2 },
    ]),
  }));
}

describe('pages/exam/question/question.js', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('onLoad chapter mode filters questions and sets title', async () => {
    mockDeps();
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'p1', mode: 'chapter', chapterNo: '1' });

    expect(page.data.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(page.data.current.id).toBe('q1');
    expect(page.data.navTitle).toBe('Test Paper');
    expect(wx.setNavigationBarTitle).toHaveBeenCalledWith({ title: 'Test Paper' });
  });

  test('onLoad wrong/favorite mode uses progress list', async () => {
    mockDeps();
    wx.setStorageSync('iiqe_progress_p1', {
      answers: {},
      correctCount: 0,
      wrongIds: ['q2'],
      favorites: ['q3'],
    });

    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'p1', mode: 'wrong' });
    expect(page.data.questions.map((q) => q.id)).toEqual(['q2']);
    expect(page.data.navTitle).toBe('错题集');

    await page.onLoad({ paperId: 'p1', mode: 'favorite' });
    expect(page.data.questions.map((q) => q.id)).toEqual(['q3']);
    expect(page.data.navTitle).toBe('收藏题');
  });

  test('onLoad sets finished when selected mode has no question', async () => {
    mockDeps();
    wx.setStorageSync('iiqe_progress_p1', {
      answers: {},
      correctCount: 0,
      wrongIds: [],
      favorites: [],
    });
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'p1', mode: 'wrong' });

    expect(page.data.finished).toBe(true);
    expect(page.data.emptyReason).toBe('当前模式暂无题目');
  });

  test('onShow denies when refreshed entitlement also missing', async () => {
    mockDeps({ premiumLocal: false, agentLocal: false, refreshPremium: false, refreshAgent: false });
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.backToPaper = jest.fn();
    page.setData({ paperId: 'p1' });

    await page.onShow();

    expect(wx.showToast).toHaveBeenCalledWith({ title: '授权状态已失效', icon: 'none' });
    expect(page.backToPaper).toHaveBeenCalled();
  });

  test('chooseOption ignores when already submitted', () => {
    mockDeps();
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.answerCurrentQuestion = jest.fn();
    page.setData({ submitted: true });

    page.chooseOption({ currentTarget: { dataset: { index: 2 } } });

    expect(page.answerCurrentQuestion).not.toHaveBeenCalled();
  });

  test('toggleFavorite adds and removes favorite', () => {
    mockDeps();
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.setData({ paperId: 'p1', current: { id: 'q1' } });

    page.toggleFavorite();
    let progress = wx.getStorageSync('iiqe_progress_p1');
    expect(progress.favorites).toEqual(['q1']);
    expect(page.data.isFavorite).toBe(true);

    page.toggleFavorite();
    progress = wx.getStorageSync('iiqe_progress_p1');
    expect(progress.favorites).toEqual([]);
    expect(page.data.isFavorite).toBe(false);
  });

  test('nextQuestion advances and marks finished at end', () => {
    mockDeps();
    wx.setStorageSync('iiqe_progress_p1', { answers: {}, correctCount: 0, wrongIds: [], favorites: ['q2'] });
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.setData({
      paperId: 'p1',
      questions: [{ id: 'q1', answer: 0 }, { id: 'q2', answer: 1 }],
      idx: 0,
      current: { id: 'q1', answer: 0 },
    });

    page.nextQuestion();
    expect(page.data.idx).toBe(1);
    expect(page.data.current.id).toBe('q2');
    expect(page.data.isFavorite).toBe(true);

    page.nextQuestion();
    expect(page.data.finished).toBe(true);
    expect(page.data.emptyReason).toBe('本次练习已完成');
  });

  test('resetPaperProgress only clears answers/correctCount then back', () => {
    mockDeps();
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.backToPaper = jest.fn();
    page.setData({ paperId: 'p1' });
    wx.setStorageSync('iiqe_progress_p1', {
      answers: { q1: 0 },
      correctCount: 1,
      wrongIds: ['q1'],
      favorites: ['q2'],
    });

    page.resetPaperProgress();
    const progress = wx.getStorageSync('iiqe_progress_p1');
    expect(progress.answers).toEqual({});
    expect(progress.correctCount).toBe(0);
    expect(progress.wrongIds).toEqual(['q1']);
    expect(progress.favorites).toEqual(['q2']);

    jest.advanceTimersByTime(300);
    expect(page.backToPaper).toHaveBeenCalled();
  });

  test('backToPaper navigates by stack/paperId/home and onUnload clears timer', () => {
    mockDeps();
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);

    page._nextTimer = setTimeout(() => {}, 1000);
    global.getCurrentPages = () => [{}, {}];
    page.backToPaper();
    expect(wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });

    global.getCurrentPages = () => [{}];
    page.setData({ paperId: 'p1' });
    page.backToPaper();
    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/exam/paper/paper?paperId=p1' });

    page.setData({ paperId: '' });
    page.backToPaper();
    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/exam/home/home' });

    page._nextTimer = setTimeout(() => {}, 1000);
    page.onUnload();
    expect(() => jest.runOnlyPendingTimers()).not.toThrow();
  });
});
