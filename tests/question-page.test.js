const { loadPage, createPageInstance } = require('./pageTestUtils');

function mockDeps({
  premiumLocal = true,
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
    getPaperById: jest.fn((paperId) => (paperId ? { id: paperId, title: 'Test Paper', premium: paperPremium } : null)),
    getQuestionsByPaperId: jest.fn((paperId) => {
      if (paperId === 'pA') {
        return [{ id: 'pA-q1', chapter: '1.1', answer: 1 }];
      }
      if (paperId === 'pB') {
        return [{ id: 'pB-q1', chapter: '2.1', answer: 0 }];
      }
      return [
        { id: 'q1', chapter: '1.1', answer: 0 },
        { id: 'q2', chapter: '1.2', answer: 1 },
        { id: 'q3', chapter: '2', answer: 2 },
      ];
    }),
  }));
  jest.doMock('../utils/volume-collection', () => ({
    hasVolumePremium: jest.fn(() => true),
    getVolumePapers: jest.fn(() => [{ id: 'pA' }, { id: 'pB' }]),
    getVolumeCollectionQuestions: jest.fn((volumeId, type, chapterNo = 'all') => {
      const all = [
        { id: 'pA-q1', chapter: '1.1', answer: 1, sourcePaperId: 'pA', sourcePaperTitle: 'A' },
        { id: 'pB-q1', chapter: '2.1', answer: 0, sourcePaperId: 'pB', sourcePaperTitle: 'B' },
      ];
      if (chapterNo === 'all' || !chapterNo) return all;
      return all.filter((q) => String(q.chapter).startsWith(`${chapterNo}.`) || String(q.chapter) === chapterNo);
    }),
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

  test('onLoad random mode reuses saved order and restores cursor by question id', async () => {
    mockDeps();
    wx.setStorageSync('iiqe_random_order_paper:p1:random', {
      questionIds: ['q3', 'q1', 'q2'],
      updatedAt: Date.now(),
    });
    wx.setStorageSync('iiqe_cursor_paper:p1:random', {
      lastIndex: 0,
      lastQuestionId: 'q1',
      updatedAt: Date.now(),
    });

    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'p1', mode: 'random' });

    expect(page.data.questions.map((q) => q.id)).toEqual(['q3', 'q1', 'q2']);
    expect(page.data.idx).toBe(1);
    expect(page.data.current.id).toBe('q1');
  });

  test('onLoad wrong/favorite mode uses progress list', async () => {
    mockDeps();
    wx.setStorageSync('iiqe_progress_p1', {
      answers: { q2: 1, q3: 2 },
      correctCount: 0,
      wrongIds: ['q2'],
      favorites: ['q3'],
    });

    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'p1', mode: 'wrong' });
    expect(page.data.questions.map((q) => q.id)).toEqual(['q2']);
    expect(page.data.navTitle).toBe('错题集');
    expect(page.data.selected).toBe(-1);
    expect(page.data.submitted).toBe(false);

    await page.onLoad({ paperId: 'p1', mode: 'favorite' });
    expect(page.data.questions.map((q) => q.id)).toEqual(['q3']);
    expect(page.data.navTitle).toBe('收藏题');
    expect(page.data.selected).toBe(-1);
    expect(page.data.submitted).toBe(false);
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

  test('onLoad restores answered state and keeps question readonly', async () => {
    mockDeps();
    wx.setStorageSync('iiqe_progress_p1', {
      answers: { q1: 0 },
      correctCount: 1,
      wrongIds: [],
      favorites: [],
    });
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.answerCurrentQuestion = jest.fn();

    await page.onLoad({ paperId: 'p1', mode: 'chapter', chapterNo: '1' });
    page.chooseOption({ currentTarget: { dataset: { index: 2 } } });

    expect(page.data.selected).toBe(0);
    expect(page.data.submitted).toBe(true);
    expect(page.data.isCurrentCorrect).toBe(true);
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

  test('nextQuestion advances, skips unanswered with tip, and blocks at end', () => {
    mockDeps();
    wx.setStorageSync('iiqe_progress_p1', { answers: {}, correctCount: 0, wrongIds: [], favorites: ['q2'] });
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.setData({
      paperId: 'p1',
      questions: [{ id: 'q1', answer: 0 }, { id: 'q2', answer: 1 }],
      idx: 0,
      current: { id: 'q1', answer: 0 },
      submitted: false,
    });

    page.nextQuestion();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '当前题未作答，已跳过', icon: 'none' });
    expect(page.data.idx).toBe(1);
    expect(page.data.current.id).toBe('q2');
    expect(page.data.isFavorite).toBe(true);
    expect(page.data.submitted).toBe(false);

    page.nextQuestion();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '已是最后一题', icon: 'none' });
    expect(page.data.idx).toBe(1);
  });

  test('favorite mode navigation keeps question as unanswered state', () => {
    mockDeps();
    wx.setStorageSync('iiqe_progress_p1', {
      answers: { q1: 0, q2: 1 },
      correctCount: 2,
      wrongIds: [],
      favorites: ['q1', 'q2'],
    });
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.setData({
      mode: 'favorite',
      paperId: 'p1',
      questions: [{ id: 'q1', answer: 0 }, { id: 'q2', answer: 1 }],
      idx: 0,
      current: { id: 'q1', answer: 0 },
      submitted: true,
      selected: 0,
    });

    page.nextQuestion();

    expect(page.data.idx).toBe(1);
    expect(page.data.current.id).toBe('q2');
    expect(page.data.selected).toBe(-1);
    expect(page.data.submitted).toBe(false);
    expect(page.data.isCurrentCorrect).toBe(false);
  });

  test('prevQuestion goes back and blocks at first question', () => {
    mockDeps();
    wx.setStorageSync('iiqe_progress_p1', {
      answers: { q1: 0 },
      correctCount: 1,
      wrongIds: [],
      favorites: [],
    });
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.setData({
      paperId: 'p1',
      questions: [{ id: 'q1', answer: 0 }, { id: 'q2', answer: 1 }],
      idx: 1,
      current: { id: 'q2', answer: 1 },
      submitted: false,
    });

    page.prevQuestion();
    expect(page.data.idx).toBe(0);
    expect(page.data.current.id).toBe('q1');
    expect(page.data.submitted).toBe(true);
    expect(page.data.selected).toBe(0);

    page.prevQuestion();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '已是第一题', icon: 'none' });
    expect(page.data.idx).toBe(0);
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

  test('resetPaperProgress clears current scope cursor and random order in random mode', () => {
    mockDeps();
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.backToPaper = jest.fn();
    page.setData({
      paperId: 'p1',
      mode: 'random',
      chapterNo: '',
      scopeKey: 'paper:p1:random',
    });
    wx.setStorageSync('iiqe_progress_p1', {
      answers: { q1: 0 },
      correctCount: 1,
      wrongIds: ['q2'],
      favorites: ['q3'],
    });
    wx.setStorageSync('iiqe_cursor_paper:p1:random', {
      lastIndex: 2,
      lastQuestionId: 'q3',
      updatedAt: Date.now(),
    });
    wx.setStorageSync('iiqe_random_order_paper:p1:random', {
      questionIds: ['q3', 'q1', 'q2'],
      updatedAt: Date.now(),
    });

    page.resetPaperProgress();

    expect(wx.getStorageSync('iiqe_cursor_paper:p1:random')).toBeUndefined();
    expect(wx.getStorageSync('iiqe_random_order_paper:p1:random')).toBeUndefined();
  });

  test('resetPaperProgress should not write cursor back during leave', () => {
    mockDeps();
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.setData({
      paperId: 'p1',
      mode: 'chapter',
      chapterNo: '1',
      scopeKey: 'paper:p1:chapter:1',
      idx: 1,
      current: { id: 'q2', answer: 1 },
    });
    wx.setStorageSync('iiqe_progress_p1', {
      answers: { q1: 0, q2: 1 },
      correctCount: 2,
      wrongIds: [],
      favorites: [],
    });
    wx.setStorageSync('iiqe_cursor_paper:p1:chapter:1', {
      lastIndex: 1,
      lastQuestionId: 'q2',
      updatedAt: Date.now(),
    });

    page.resetPaperProgress();
    jest.advanceTimersByTime(300);
    page.onHide();
    page.onUnload();

    expect(wx.getStorageSync('iiqe_cursor_paper:p1:chapter:1')).toBeUndefined();
  });

  test('goToQuestion persists cursor', () => {
    mockDeps();
    wx.setStorageSync('iiqe_progress_p1', { answers: {}, correctCount: 0, wrongIds: [], favorites: [] });
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.setData({
      paperId: 'p1',
      mode: 'chapter',
      chapterNo: '1',
      scopeKey: 'paper:p1:chapter:1',
      questions: [{ id: 'q1', answer: 0 }, { id: 'q2', answer: 1 }],
      idx: 0,
      current: { id: 'q1', answer: 0 },
      submitted: false,
    });

    page.goToQuestion(1);

    expect(wx.getStorageSync('iiqe_cursor_paper:p1:chapter:1')).toMatchObject({
      lastIndex: 1,
      lastQuestionId: 'q2',
    });
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

  test('onLoad allows trial question page without login', async () => {
    mockDeps({ requireOk: false, paperPremium: false, premiumLocal: false, agentLocal: false });
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'p_trial', mode: 'chapter', chapterNo: '1' });

    expect(page.data.paperId).toBe('p_trial');
    expect(page.data.questions.length).toBeGreaterThan(0);
    expect(wx.setNavigationBarTitle).toHaveBeenCalledWith({ title: 'Test Paper' });
  });

  test('onLoad volume mode sets volume title and question list', async () => {
    mockDeps({ premiumLocal: true });
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ mode: 'volume_wrong', volumeId: encodeURIComponent('卷一'), chapterNo: 'all' });

    expect(page.data.volumeId).toBe('卷一');
    expect(page.data.questions.map((q) => q.id)).toEqual(['pA-q1', 'pB-q1']);
    expect(wx.setNavigationBarTitle).toHaveBeenCalledWith({ title: '卷一错题集' });
  });

  test('toggleFavorite in volume mode writes to source paper progress', () => {
    mockDeps({ premiumLocal: true });
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.setData({
      mode: 'volume_favorite',
      volumeId: '卷一',
      current: { id: 'pA-q1', sourcePaperId: 'pA' },
      paperId: '',
    });

    page.toggleFavorite();

    const progress = wx.getStorageSync('iiqe_progress_pA');
    expect(progress.favorites).toContain('pA-q1');
  });

  test('resetPaperProgress in volume mode clears all papers in volume', () => {
    mockDeps({ premiumLocal: true });
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.backToPaper = jest.fn();
    page.setData({
      mode: 'volume_wrong',
      volumeId: '卷一',
      chapterNo: 'all',
      scopeKey: 'volume:卷一:wrong:all',
      current: { id: 'pA-q1', sourcePaperId: 'pA' },
      idx: 0,
    });
    wx.setStorageSync('iiqe_progress_pA', { answers: { 'pA-q1': 1 }, correctCount: 1, wrongIds: [], favorites: ['pA-q1'] });
    wx.setStorageSync('iiqe_progress_pB', { answers: { 'pB-q1': 0 }, correctCount: 1, wrongIds: [], favorites: [] });

    page.resetPaperProgress();

    expect(wx.getStorageSync('iiqe_progress_pA').answers).toEqual({});
    expect(wx.getStorageSync('iiqe_progress_pB').answers).toEqual({});
  });

  test('backToPaper redirects to volume collection in volume mode', () => {
    mockDeps({ premiumLocal: true });
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    global.getCurrentPages = () => [{}];
    page.setData({
      mode: 'volume_favorite',
      volumeId: '卷五',
    });

    page.backToPaper();

    expect(wx.redirectTo).toHaveBeenCalledWith({
      url: '/pages/exam/volume_collection/volume_collection?volumeId=%E5%8D%B7%E4%BA%94&type=favorite',
    });
  });
});
