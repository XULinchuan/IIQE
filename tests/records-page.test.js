const { loadPage, createPageInstance } = require('./pageTestUtils');

function mockDeps({ requireOk = true } = {}) {
  jest.doMock('../utils/auth', () => ({
    requireLogin: jest.fn().mockResolvedValue(requireOk),
  }));
  jest.doMock('../pkg-exam/utils/exam-data', () => ({
    getPapersByType: jest.fn((type) => {
      if (type !== '卷四') return [];
      return [
        {
          id: 'paper4-random-mock',
          title: '卷四随机模拟试卷',
          type,
          isMock: true,
          isDynamicMock: true,
        },
        {
          id: 'paper4-mock-01',
          title: '卷四模拟试题',
          type,
          isMock: true,
        },
      ];
    }),
  }));
}

describe('pkg-exam/records/records.js', () => {
  test('loadRows shows answer correctness counts for mock papers including dynamic random mocks', async () => {
    mockDeps();
    wx.setStorageSync('iiqe_progress_paper4-random-mock', {
      answers: {
        q1: 0,
        q2: 1,
        q3: 2,
      },
      correctCount: 2,
      wrongIds: ['q2'],
      favorites: [],
    });
    wx.setStorageSync('iiqe_progress_paper4-mock-01', {
      answers: {
        q1: 0,
        q2: 1,
      },
      correctCount: 1,
      wrongIds: ['q2'],
      favorites: ['q1'],
    });

    const def = loadPage('../pkg-exam/records/records.js');
    const page = createPageInstance(def);

    await page.onShow();

    expect(page.data.rows).toEqual([
      expect.objectContaining({
        id: 'paper4-random-mock',
        answered: 3,
        correct: 2,
        wrong: 1,
      }),
      expect.objectContaining({
        id: 'paper4-mock-01',
        answered: 2,
        correct: 1,
        wrong: 1,
      }),
    ]);
  });
});
