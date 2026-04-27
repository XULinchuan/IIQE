const { loadPage, createPageInstance } = require('./pageTestUtils');

describe('question wrong/fix logic', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.doMock('../utils/auth', () => ({ requireLogin: jest.fn().mockResolvedValue(true) }));
    jest.doMock('../utils/entitlement', () => ({
      hasPremiumAccessLocal: jest.fn(() => true),
      isAgentLocal: jest.fn(() => false),
      refreshPremiumAccess: jest.fn(),
      refreshMyAgentProfile: jest.fn(),
    }));
    jest.doMock('../pkg-exam/utils/exam-data', () => ({
      getPaperById: jest.fn(() => ({ id: 'p1', title: 'P1', premium: true })),
      getQuestionsByPaperId: jest.fn(() => [
        { id: 'q1', chapter: '1.1', answer: 3 },
        { id: 'q2', chapter: '1.2', answer: 0 },
      ]),
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function getStoredProgress() {
    return wx.getStorageSync('iiqe_progress_p1');
  }

  test('wrong answer adds question into wrongIds', () => {
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);
    page.data.paperId = 'p1';
    page.data.current = { id: 'q1', answer: 3 };
    page.nextQuestion = jest.fn();

    page.answerCurrentQuestion(1);

    const progress = getStoredProgress();
    expect(progress.wrongIds).toEqual(['q1']);
    expect(progress.correctCount).toBe(0);
    expect(page.data.submitted).toBe(true);
    expect(page.data.isCurrentCorrect).toBe(false);
    expect(page.nextQuestion).not.toHaveBeenCalled();
  });

  test('correcting a previously wrong question removes it from wrongIds', () => {
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);
    page.data.paperId = 'p1';
    page.data.current = { id: 'q1', answer: 3 };
    page.nextQuestion = jest.fn();

    page.answerCurrentQuestion(1);
    let progress = getStoredProgress();
    expect(progress.wrongIds).toEqual(['q1']);

    page.data.submitted = false;
    page.answerCurrentQuestion(3);
    jest.advanceTimersByTime(1000);

    progress = getStoredProgress();
    expect(progress.wrongIds).toEqual([]);
    expect(progress.correctCount).toBe(1);
    expect(page.data.isCurrentCorrect).toBe(true);
    expect(page.nextQuestion).toHaveBeenCalled();
  });

  test('repeated wrong attempts do not duplicate wrongIds', () => {
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);
    page.data.paperId = 'p1';
    page.data.current = { id: 'q1', answer: 3 };

    page.answerCurrentQuestion(1);
    page.data.submitted = false;
    page.answerCurrentQuestion(2);

    const progress = getStoredProgress();
    expect(progress.wrongIds).toEqual(['q1']);
    expect(progress.wrongIds.length).toBe(1);
  });

  test('wrong mode correct answer removes current question from wrong source and jumps to next wrong', () => {
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);
    wx.setStorageSync('iiqe_progress_p1', {
      answers: { q1: 1, q2: 1 },
      correctCount: 0,
      wrongIds: ['q1', 'q2'],
      favorites: [],
    });
    page.setData({
      mode: 'wrong',
      paperId: 'p1',
      idx: 0,
      questions: [{ id: 'q1', chapter: '1.1', answer: 3 }, { id: 'q2', chapter: '1.2', answer: 0 }],
      current: { id: 'q1', chapter: '1.1', answer: 3 },
      isLastQuestion: false,
    });

    page.answerCurrentQuestion(3);
    jest.advanceTimersByTime(1000);

    const progress = getStoredProgress();
    expect(progress.wrongIds).toEqual(['q2']);
    expect(page.data.current.id).toBe('q2');
    expect(page.data.questions.map((q) => q.id)).toEqual(['q2']);
    expect(page.data.submitted).toBe(false);
    expect(page.data.selected).toBe(-1);
  });

  test('wrong mode correct answer on last wrong question exits wrong mode list', () => {
    const def = loadPage('../pkg-exam/question/question.js');
    const page = createPageInstance(def);
    wx.setStorageSync('iiqe_progress_p1', {
      answers: { q1: 1 },
      correctCount: 0,
      wrongIds: ['q1'],
      favorites: [],
    });
    page.setData({
      mode: 'wrong',
      paperId: 'p1',
      idx: 0,
      questions: [{ id: 'q1', chapter: '1.1', answer: 3 }],
      current: { id: 'q1', chapter: '1.1', answer: 3 },
      isLastQuestion: true,
    });

    page.answerCurrentQuestion(3);
    jest.advanceTimersByTime(1000);

    const progress = getStoredProgress();
    expect(progress.wrongIds).toEqual([]);
    expect(page.data.finished).toBe(true);
    expect(page.data.current).toBeNull();
    expect(page.data.emptyReason).toBe('当前模式暂无题目');
  });
});
