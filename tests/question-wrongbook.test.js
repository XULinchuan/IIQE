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
    jest.doMock('../utils/exam-data', () => ({
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
    const def = loadPage('../pages/exam/question/question.js');
    const page = createPageInstance(def);
    page.data.paperId = 'p1';
    page.data.current = { id: 'q1', answer: 3 };
    page.nextQuestion = jest.fn();

    page.answerCurrentQuestion(1);

    const progress = getStoredProgress();
    expect(progress.wrongIds).toEqual(['q1']);
    expect(progress.correctCount).toBe(0);
    expect(page.data.showNextButton).toBe(true);
    expect(page.nextQuestion).not.toHaveBeenCalled();
  });

  test('correcting a previously wrong question removes it from wrongIds', () => {
    const def = loadPage('../pages/exam/question/question.js');
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
    const def = loadPage('../pages/exam/question/question.js');
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
});
