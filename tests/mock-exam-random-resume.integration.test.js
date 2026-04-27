const { loadPage, createPageInstance } = require('./pageTestUtils');

function setupMocks() {
  const questions = [
    { id: 'q1', chapter: '1.1', answer: 0, stem: 'Q1', options: ['A', 'B', 'C', 'D'], explain: '' },
    { id: 'q2', chapter: '1.2', answer: 1, stem: 'Q2', options: ['A', 'B', 'C', 'D'], explain: '' },
    { id: 'q3', chapter: '2.1', answer: 2, stem: 'Q3', options: ['A', 'B', 'C', 'D'], explain: '' },
    { id: 'q4', chapter: '2.2', answer: 3, stem: 'Q4', options: ['A', 'B', 'C', 'D'], explain: '' },
  ];

  const session = {
    sessionId: 'session-r1',
    durationMs: 120 * 60 * 1000,
    remainingMs: 119 * 60 * 1000,
    submitted: false,
  };

  jest.doMock('../utils/auth', () => ({
    requireLogin: jest.fn().mockResolvedValue(true),
  }));
  jest.doMock('../utils/entitlement', () => ({
    hasPremiumAccessLocal: jest.fn(() => true),
    isAgentLocal: jest.fn(() => false),
    refreshPremiumAccess: jest.fn(async () => true),
    refreshMyAgentProfile: jest.fn(async () => ({ isAgent: false, status: 'disabled' })),
  }));
  jest.doMock('../pkg-exam/utils/volume-collection', () => ({
    getChapterNo: jest.fn((chapter) => String(chapter || '').split('.')[0]),
    compareChapterNo: jest.fn((a, b) => String(a).localeCompare(String(b), 'zh-HK')),
    getVolumeCollectionQuestions: jest.fn(() => []),
    getVolumePapers: jest.fn(() => []),
  }));
  jest.doMock('../pkg-exam/utils/exam-data', () => ({
    chapterTitleMap: { '1': '第1章', '2': '第2章' },
    getPaperById: jest.fn((paperId) => (paperId ? {
      id: paperId,
      title: '卷四随机模拟试卷',
      premium: true,
      isMock: true,
      isDynamicMock: true,
    } : null)),
    getQuestionsByPaperId: jest.fn(() => questions.map((q, idx) => ({ ...q, no: idx + 1 }))),
    isDynamicMockPaperId: jest.fn((paperId) => paperId === 'paper4-random-mock'),
    getActiveDynamicMockSessionId: jest.fn(() => session.sessionId),
    getDynamicMockSessionState: jest.fn(() => ({ ...session })),
    updateDynamicMockRemainingMs: jest.fn(),
    markDynamicMockSessionSubmitted: jest.fn(),
    prepareDynamicMockSession: jest.fn(() => ({ ...session })),
  }));
}

describe('integration: dynamic mock random mode resume', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    wx.navigateTo = jest.fn();
    wx.redirectTo = jest.fn();
    wx.navigateBack = jest.fn();
    wx.setNavigationBarTitle = jest.fn();
    wx.showToast = jest.fn();
    global.getCurrentPages = () => [{}, {}];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('enter random mode -> answer -> exit -> re-enter resumes cursor and random order', async () => {
    setupMocks();

    const paperDef = loadPage('../pkg-exam/paper/paper.js');
    const paperPage = createPageInstance(paperDef);
    await paperPage.onLoad({ paperId: 'paper4-random-mock' });
    paperPage.startRandom();
    await Promise.resolve();
    await Promise.resolve();
    expect(wx.navigateTo).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/pkg-exam/question/question?paperId=paper4-random-mock&mode=random' }),
    );

    const questionDef = loadPage('../pkg-exam/question/question.js');
    const page1 = createPageInstance(questionDef);
    await page1.onLoad({ paperId: 'paper4-random-mock', mode: 'random' });

    const scopeKey = 'paper:paper4-random-mock:session:session-r1:random';
    const orderKey = `iiqe_random_order_${scopeKey}`;
    const cursorKey = `iiqe_cursor_${scopeKey}`;

    const firstOrder = wx.getStorageSync(orderKey);
    expect(firstOrder).toBeTruthy();
    expect(Array.isArray(firstOrder.questionIds)).toBe(true);
    expect(firstOrder.questionIds).toHaveLength(4);

    page1.chooseOption({ currentTarget: { dataset: { index: 2 } } });
    page1.nextQuestion();
    expect(page1.data.idx).toBe(1);
    const resumedQuestionId = page1.data.current.id;

    page1.onHide();
    const cursorAfterHide = wx.getStorageSync(cursorKey);
    expect(cursorAfterHide).toMatchObject({
      lastIndex: 1,
      lastQuestionId: resumedQuestionId,
    });

    const progress = wx.getStorageSync('iiqe_progress_paper4-random-mock');
    expect(progress).toBeTruthy();
    expect(progress.answers).toHaveProperty(firstOrder.questionIds[0]);

    const page2 = createPageInstance(questionDef);
    await page2.onLoad({ paperId: 'paper4-random-mock', mode: 'random' });

    expect(page2.data.scopeKey).toBe(scopeKey);
    expect(page2.data.idx).toBe(1);
    expect(page2.data.current.id).toBe(resumedQuestionId);
    expect(page2.data.questions.map((q) => q.id)).toEqual(firstOrder.questionIds);

    page1.onUnload();
    page2.onUnload();
  });
});
