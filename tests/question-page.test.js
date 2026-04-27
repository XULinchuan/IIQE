const { loadPage, createPageInstance } = require('./pageTestUtils');

function mockDeps({
  premiumLocal = true,
  agentLocal = false,
  refreshPremium = false,
  refreshAgent = false,
  requireOk = true,
  paperPremium = true,
  dynamicMockPaper = false,
  dynamicSessionState = null,
  activeDynamicSessionId = 'session-1',
  updateRemainingImpl = null,
  markSubmittedImpl = null,
  prepareSessionImpl = null,
  questionsByPaper = null,
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
    getPaperById: jest.fn((paperId) => (paperId ? {
      id: paperId,
      title: 'Test Paper',
      premium: paperPremium,
      isDynamicMock: dynamicMockPaper,
    } : null)),
    getQuestionsByPaperId: jest.fn((paperId) => {
      if (questionsByPaper && Object.prototype.hasOwnProperty.call(questionsByPaper, paperId)) {
        return questionsByPaper[paperId];
      }
      if (paperId === 'pGuide') {
        return [
          { id: 'g1', chapter: '<註冊中 介人操守 要求指引 >III.19b', answer: 1 },
          { id: 'g2', chapter: '7.2.1', answer: 0 },
        ];
      }
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
    isDynamicMockPaperId: jest.fn((paperId) => !!dynamicMockPaper && !!paperId),
    getActiveDynamicMockSessionId: jest.fn(() => activeDynamicSessionId),
    getDynamicMockSessionState: jest.fn(() => dynamicSessionState),
    updateDynamicMockRemainingMs: jest.fn((paperId, remainingMs) => (
      typeof updateRemainingImpl === 'function'
        ? updateRemainingImpl(paperId, remainingMs)
        : null
    )),
    markDynamicMockSessionSubmitted: jest.fn((paperId, reason) => (
      typeof markSubmittedImpl === 'function'
        ? markSubmittedImpl(paperId, reason)
        : null
    )),
    prepareDynamicMockSession: jest.fn((paperId, options) => (
      typeof prepareSessionImpl === 'function'
        ? prepareSessionImpl(paperId, options)
        : null
    )),
    chapterTitleMap: {},
  }));
  jest.doMock('../pkg-exam/utils/volume-collection', () => ({
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

describe('pkg-exam/question/question.js', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('onLoad chapter mode filters questions and sets title', async () => {
    mockDeps();
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'p1', mode: 'chapter', chapterNo: '1' });

    expect(page.data.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(page.data.current.id).toBe('q1');
    expect(page.data.navTitle).toBe('Test Paper');
    expect(wx.setNavigationBarTitle).toHaveBeenCalledWith({ title: 'Test Paper' });
  });

  test('onLoad chapter mode includes guideline refs under guideline chapter', async () => {
    mockDeps();
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'pGuide', mode: 'chapter', chapterNo: '<註冊中介人操守要求指引>' });

    expect(page.data.questions.map((q) => q.id)).toEqual(['g1']);
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

    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'p1', mode: 'random' });

    expect(page.data.questions.map((q) => q.id)).toEqual(['q3', 'q1', 'q2']);
    expect(page.data.idx).toBe(1);
    expect(page.data.current.id).toBe('q1');
  });

  test('dynamic mock random mode reuses order/cursor within same session', async () => {
    mockDeps({
      dynamicMockPaper: true,
      activeDynamicSessionId: 's1',
      dynamicSessionState: {
        sessionId: 's1',
        durationMs: 600000,
        remainingMs: 590000,
        submitted: false,
      },
    });
    wx.setStorageSync('iiqe_random_order_paper:paper4-random-mock:session:s1:random', {
      questionIds: ['q3', 'q1', 'q2'],
      updatedAt: Date.now(),
    });
    wx.setStorageSync('iiqe_cursor_paper:paper4-random-mock:session:s1:random', {
      lastIndex: 0,
      lastQuestionId: 'q1',
      updatedAt: Date.now(),
    });

    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'paper4-random-mock', mode: 'random' });

    expect(page.data.scopeKey).toBe('paper:paper4-random-mock:session:s1:random');
    expect(page.data.questions.map((q) => q.id)).toEqual(['q3', 'q1', 'q2']);
    expect(page.data.idx).toBe(1);
    expect(page.data.current.id).toBe('q1');
  });

  test('dynamic mock random mode does not reuse cursor/order from old session', async () => {
    mockDeps({
      dynamicMockPaper: true,
      activeDynamicSessionId: 's2',
      dynamicSessionState: {
        sessionId: 's2',
        durationMs: 600000,
        remainingMs: 600000,
        submitted: false,
      },
    });
    wx.setStorageSync('iiqe_random_order_paper:paper4-random-mock:session:s1:random', {
      questionIds: ['q3', 'q1', 'q2'],
      updatedAt: Date.now(),
    });
    wx.setStorageSync('iiqe_cursor_paper:paper4-random-mock:session:s1:random', {
      lastIndex: 2,
      lastQuestionId: 'q2',
      updatedAt: Date.now(),
    });

    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'paper4-random-mock', mode: 'random' });

    expect(page.data.scopeKey).toBe('paper:paper4-random-mock:session:s2:random');
    expect(page.data.idx).toBe(0);
    expect(wx.getStorageSync('iiqe_cursor_paper:paper4-random-mock:session:s2:random')).toMatchObject({
      lastIndex: 0,
      lastQuestionId: page.data.current.id,
    });
  });

  test('onLoad wrong/favorite mode uses progress list', async () => {
    mockDeps();
    wx.setStorageSync('iiqe_progress_p1', {
      answers: { q2: 1, q3: 2 },
      correctCount: 0,
      wrongIds: ['q2'],
      favorites: ['q3'],
    });

    const def = loadPage('../pkg-exam/question/question.js');
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
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'p1', mode: 'wrong' });

    expect(page.data.finished).toBe(true);
    expect(page.data.emptyReason).toBe('当前模式暂无题目');
  });

  test('onShow denies when refreshed entitlement also missing', async () => {
    mockDeps({ premiumLocal: false, agentLocal: false, refreshPremium: false, refreshAgent: false });
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);
    page.backToPaper = jest.fn();
    page.setData({ paperId: 'p1' });

    await page.onShow();

    expect(wx.showToast).toHaveBeenCalledWith({ title: '授权状态已失效', icon: 'none' });
    expect(page.backToPaper).toHaveBeenCalled();
  });

  test('chooseOption ignores when already submitted', () => {
    mockDeps();
    const def = loadPage('../pkg-exam/question/question.js');
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
    const def = loadPage('../pkg-exam/question/question.js');
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
    const def = loadPage('../pkg-exam/question/question.js');
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

  test('dynamic mock answers and favorites persist on the dynamic paper rather than source papers', async () => {
    mockDeps({
      dynamicMockPaper: true,
      dynamicSessionState: {
        sessionId: 's-dyn',
        durationMs: 600000,
        remainingMs: 600000,
        submitted: false,
      },
      questionsByPaper: {
        'paper4-random-mock': [
          { id: 'paper4-random-mock-001', chapter: '1.1', answer: 0, sourcePaperId: 'paper4-mock-a', sourceQuestionId: 'src-1' },
          { id: 'paper4-random-mock-002', chapter: '1.2', answer: 1, sourcePaperId: 'paper4-mock-b', sourceQuestionId: 'src-2' },
        ],
        'paper4-mock-a': [
          { id: 'src-1', chapter: '1.1', answer: 0 },
        ],
        'paper4-mock-b': [
          { id: 'src-2', chapter: '1.2', answer: 1 },
        ],
      },
    });
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'paper4-random-mock', mode: 'chapter', chapterNo: '1' });
    page.chooseOption({ currentTarget: { dataset: { index: 0 } } });
    page.toggleFavorite();
    page.goToQuestion(1);
    page.goToQuestion(0);

    expect(wx.getStorageSync('iiqe_progress_paper4-random-mock')).toEqual(expect.objectContaining({
      answers: { 'paper4-random-mock-001': 0 },
      correctCount: 1,
      favorites: ['paper4-random-mock-001'],
    }));
    expect(wx.getStorageSync('iiqe_progress_paper4-mock-a')).toBeUndefined();
    expect(page.data.selected).toBe(0);
    expect(page.data.submitted).toBe(true);
    expect(page.data.isCurrentCorrect).toBe(true);
    expect(page.data.isFavorite).toBe(true);
  });

  test('nextQuestion advances, skips unanswered with tip, and blocks at end', () => {
    mockDeps();
    wx.setStorageSync('iiqe_progress_p1', { answers: {}, correctCount: 0, wrongIds: [], favorites: ['q2'] });
    const def = loadPage('../pkg-exam/question/question.js');
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
    const def = loadPage('../pkg-exam/question/question.js');
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
    const def = loadPage('../pkg-exam/question/question.js');
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
    const def = loadPage('../pkg-exam/question/question.js');
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
    const def = loadPage('../pkg-exam/question/question.js');
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
    const def = loadPage('../pkg-exam/question/question.js');
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
    const def = loadPage('../pkg-exam/question/question.js');
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
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);

    page._nextTimer = setTimeout(() => {}, 1000);
    global.getCurrentPages = () => [{}, {}];
    page.backToPaper();
    expect(wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });

    global.getCurrentPages = () => [{}];
    page.setData({ paperId: 'p1' });
    page.backToPaper();
    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pkg-exam/paper/paper?paperId=p1' });

    page.setData({ paperId: '' });
    page.backToPaper();
    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/exam/home/home' });

    page._nextTimer = setTimeout(() => {}, 1000);
    page.onUnload();
    expect(() => jest.runOnlyPendingTimers()).not.toThrow();
  });

  test('onLoad allows trial question page without login', async () => {
    mockDeps({ requireOk: false, paperPremium: false, premiumLocal: false, agentLocal: false });
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ paperId: 'p_trial', mode: 'chapter', chapterNo: '1' });

    expect(page.data.paperId).toBe('p_trial');
    expect(page.data.questions.length).toBeGreaterThan(0);
    expect(wx.setNavigationBarTitle).toHaveBeenCalledWith({ title: 'Test Paper' });
  });

  test('onLoad volume mode sets volume title and question list', async () => {
    mockDeps({ premiumLocal: true });
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);

    await page.onLoad({ mode: 'volume_wrong', volumeId: encodeURIComponent('卷一'), chapterNo: 'all' });

    expect(page.data.volumeId).toBe('卷一');
    expect(page.data.questions.map((q) => q.id)).toEqual(['pA-q1', 'pB-q1']);
    expect(wx.setNavigationBarTitle).toHaveBeenCalledWith({ title: '卷一错题集' });
  });

  test('toggleFavorite in volume mode writes to source paper progress', () => {
    mockDeps({ premiumLocal: true });
    const def = loadPage('../pkg-exam/question/question.js');
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
    const def = loadPage('../pkg-exam/question/question.js');
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
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);
    global.getCurrentPages = () => [{}];
    page.setData({
      mode: 'volume_favorite',
      volumeId: '卷五',
    });

    page.backToPaper();

    expect(wx.redirectTo).toHaveBeenCalledWith({
      url: '/pkg-exam/volume_collection/volume_collection?volumeId=%E5%8D%B7%E4%BA%94&type=favorite',
    });
  });

  test('dynamic mock exam timer pauses on hide and resumes with persisted remaining time', async () => {
    mockDeps({
      dynamicMockPaper: true,
      dynamicSessionState: {
        sessionId: 's1',
        durationMs: 600000,
        remainingMs: 5000,
        submitted: false,
      },
    });
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);
    const examData = require('../pkg-exam/utils/exam-data');

    await page.onLoad({ paperId: 'paper4-random-mock', mode: 'chapter', chapterNo: '1' });
    jest.advanceTimersByTime(2100);
    const afterRunning = page.data.examRemainingMs;
    expect(afterRunning).toBeLessThan(5000);

    page.onHide();
    const persistedAfterHide = page.data.examRemainingMs;
    jest.advanceTimersByTime(2000);
    expect(page.data.examRemainingMs).toBe(persistedAfterHide);
    expect(examData.updateDynamicMockRemainingMs).toHaveBeenCalled();

    await page.onShow();
    expect(page.data.examRemainingMs).toBe(persistedAfterHide);
    jest.advanceTimersByTime(1100);
    expect(page.data.examRemainingMs).toBeLessThan(persistedAfterHide);
  });

  test('dynamic mock exam auto-submits when timeout is reached', async () => {
    mockDeps({
      dynamicMockPaper: true,
      dynamicSessionState: {
        sessionId: 's2',
        durationMs: 600000,
        remainingMs: 900,
        submitted: false,
      },
    });
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);
    const examData = require('../pkg-exam/utils/exam-data');
    page.backToPaper = jest.fn();
    wx.showModal.mockImplementation(({ success }) => {
      if (typeof success === 'function') success({ confirm: true, cancel: false });
    });

    await page.onLoad({ paperId: 'paper4-random-mock', mode: 'chapter', chapterNo: '1' });
    jest.advanceTimersByTime(1200);

    expect(page.data.examSubmitted).toBe(true);
    expect(examData.markDynamicMockSessionSubmitted).toHaveBeenCalledWith('paper4-random-mock', 'timeout');
    expect(wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringMatching(/交卷结果/),
      content: expect.stringContaining('及格线'),
      showCancel: false,
    }));
    expect(page.backToPaper).toHaveBeenCalled();
  });

  test('dynamic mock exam supports manual submit', async () => {
    mockDeps({
      dynamicMockPaper: true,
      dynamicSessionState: {
        sessionId: 's-manual',
        durationMs: 600000,
        remainingMs: 300000,
        submitted: false,
      },
    });
    wx.showModal.mockImplementation(({ success }) => {
      success({ confirm: true, cancel: false });
    });
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);
    const examData = require('../pkg-exam/utils/exam-data');
    page.backToPaper = jest.fn();

    await page.onLoad({ paperId: 'paper4-random-mock', mode: 'random' });
    page.submitDynamicMockPaper();

    expect(examData.markDynamicMockSessionSubmitted).toHaveBeenCalledWith('paper4-random-mock', 'manual');
    expect(page.data.examSubmitted).toBe(true);
    expect(page.data.disableCursorPersist).toBe(true);
    expect(wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringMatching(/交卷结果/),
      content: expect.stringContaining('及格线'),
      showCancel: false,
    }));
    expect(page.backToPaper).toHaveBeenCalled();
  });

  test('dynamic mock submit summarizes the current session before marking it submitted', () => {
    const questionsByPaper = {
      'paper4-random-mock': [
        { id: 'q1', chapter: '1.1', answer: 0 },
        { id: 'q2', chapter: '1.2', answer: 1 },
        { id: 'q3', chapter: '1.3', answer: 2 },
      ],
    };
    mockDeps({
      dynamicMockPaper: true,
      questionsByPaper,
      markSubmittedImpl: () => {
        questionsByPaper['paper4-random-mock'] = [
          { id: 'new-q1', chapter: '1.1', answer: 0 },
          { id: 'new-q2', chapter: '1.2', answer: 1 },
          { id: 'new-q3', chapter: '1.3', answer: 2 },
        ];
        wx.setStorageSync('iiqe_progress_paper4-random-mock', {
          answers: {},
          correctCount: 0,
          wrongIds: [],
          favorites: [],
        });
      },
    });
    wx.setStorageSync('iiqe_progress_paper4-random-mock', {
      answers: { q1: 0, q2: 1, q3: 0 },
      correctCount: 2,
      wrongIds: ['q3'],
      favorites: [],
    });
    wx.showModal.mockImplementation(({ success }) => {
      if (typeof success === 'function') success({ confirm: true, cancel: false });
    });
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);
    page.backToPaper = jest.fn();
    page.setData({
      paperId: 'paper4-random-mock',
      isDynamicMockPaper: true,
    });

    page.finishDynamicMockPaper('manual');

    expect(wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('答对 2/3 题'),
    }));
  });

  test('resetPaperProgress regenerates dynamic mock paper only when forced', () => {
    mockDeps({
      dynamicMockPaper: true,
      dynamicSessionState: {
        sessionId: 's3',
        durationMs: 600000,
        remainingMs: 300000,
        submitted: false,
      },
    });
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);
    const examData = require('../pkg-exam/utils/exam-data');

    page.setData({
      paperId: 'paper4-random-mock',
      mode: 'chapter',
      chapterNo: '1',
      scopeKey: 'paper:paper4-random-mock:chapter:1',
      isDynamicMockPaper: true,
      current: { id: 'q1' },
      idx: 0,
    });

    page.resetPaperProgress();

    expect(examData.prepareDynamicMockSession).toHaveBeenCalledWith('paper4-random-mock', { force: true });
  });
});
