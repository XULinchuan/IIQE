const {
  configureRandomMockPaperAPI,
  getDynamicMockPaperById,
  getDynamicMockSessionQuestions,
  getActiveDynamicMockSessionId,
  isDynamicMockPaperId,
  prepareDynamicMockSession,
} = require('../pkg-exam/utils/random-mock-paper');

function buildPool(type, chapterCounts) {
  const rows = [];
  Object.keys(chapterCounts).forEach((chapterNo) => {
    const total = Number(chapterCounts[chapterNo]) || 0;
    for (let i = 0; i < total; i += 1) {
      rows.push({
        id: `${type}-q-${chapterNo}-${i + 1}`,
        chapter: `${chapterNo}.1`,
        stem: `${type}-${chapterNo}-${i + 1}`,
        options: ['A', 'B', 'C', 'D'],
        answer: i % 4,
        explain: '',
      });
    }
  });
  return rows;
}

describe('pkg-exam/utils/random-mock-paper.js', () => {
  beforeEach(() => {
    const paper4Base = buildPool('卷四', { '1': 20, '2': 20, '3': 80, '4': 20, '5': 40, '6': 20, '7': 40 });
    for (let i = 0; i < 30; i += 1) {
      paper4Base.push({
        id: `卷四-guide-${i + 1}`,
        chapter: `<註冊中介人操守要求指引>III.${i + 1}`,
        stem: `guide-${i + 1}`,
        options: ['A', 'B', 'C', 'D'],
        answer: i % 4,
        explain: '',
      });
    }
    const pools = {
      卷一: buildPool('卷一', { '1': 30, '2': 30, '3': 50, '4': 30, '5': 30, '6': 40, '7': 30 }),
      卷二: buildPool('卷二', { '1': 40, '2': 40, '3': 20, '4': 20 }),
      卷三: buildPool('卷三', { '1': 30, '2': 30, '3': 30, '4': 30, '5': 30 }),
      卷四: paper4Base,
      卷五: buildPool('卷五', { '1': 20, '2': 30, '3': 50, '4': 50, '5': 30 }),
    };

    configureRandomMockPaperAPI({
      getPapersByType: (type) => [{ id: `${type}-mock`, type, isMock: true }],
      getPaperById: () => null,
      getQuestionsByPaperId: (paperId) => {
        const type = String(paperId || '').replace(/-mock$/, '');
        return pools[type] || [];
      },
    });
  });

  test('creates dynamic paper sessions with expected chapter distribution (卷二)', () => {
    expect(isDynamicMockPaperId('paper2-random-mock')).toBe(true);
    expect(getDynamicMockPaperById('paper2-random-mock')).toEqual(expect.objectContaining({
      type: '卷二',
      total: 50,
    }));

    const session = prepareDynamicMockSession('paper2-random-mock');
    expect(session).toEqual(expect.objectContaining({ sessionId: expect.any(String) }));
    const questions = getDynamicMockSessionQuestions('paper2-random-mock');
    expect(questions).toHaveLength(50);

    const counts = {};
    questions.forEach((q) => {
      const chapterNo = String(q.chapter || '').split('.')[0];
      counts[chapterNo] = (counts[chapterNo] || 0) + 1;
    });
    expect(counts).toEqual(expect.objectContaining({
      '1': 23,
      '2': 17,
      '3': 5,
      '4': 5,
    }));
  });

  test('reuses active session by default, and regenerates only when forced', () => {
    prepareDynamicMockSession('paper3-random-mock');
    const firstSessionId = getActiveDynamicMockSessionId('paper3-random-mock');
    const firstQuestions = getDynamicMockSessionQuestions('paper3-random-mock').map((q) => q.stem);

    prepareDynamicMockSession('paper3-random-mock');
    const reusedSessionId = getActiveDynamicMockSessionId('paper3-random-mock');
    const reusedQuestions = getDynamicMockSessionQuestions('paper3-random-mock').map((q) => q.stem);

    expect(reusedSessionId).toBe(firstSessionId);
    expect(reusedQuestions.join('|')).toBe(firstQuestions.join('|'));

    prepareDynamicMockSession('paper3-random-mock', { force: true });
    const secondSessionId = getActiveDynamicMockSessionId('paper3-random-mock');
    const secondQuestions = getDynamicMockSessionQuestions('paper3-random-mock').map((q) => q.stem);

    expect(secondSessionId).not.toBe(firstSessionId);
    expect(secondQuestions).toHaveLength(50);
    expect(secondQuestions.join('|')).not.toBe(firstQuestions.join('|'));
  });

  test('strictly separates chapter 7 and guideline chapter in random paper', () => {
    prepareDynamicMockSession('paper4-random-mock');
    const questions = getDynamicMockSessionQuestions('paper4-random-mock');
    expect(questions).toHaveLength(80);
    expect(questions.every((q) => String(q.chapter || '').indexOf('註冊中介人操守要求指引') < 0)).toBe(true);
  });
});
