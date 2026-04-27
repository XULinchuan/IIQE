const papers = [
  {
    "id": "paper3-random-mock",
    "type": "卷三",
    "title": "卷三随机模拟试卷",
    "premium": true,
    "isMock": true,
    "isDynamicMock": true,
    "total": 50
  },
  {
    "id": "paper3-2026-02",
    "type": "卷三",
    "title": "2026年2月真题",
    "premium": false,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper3-2026-01",
    "type": "卷三",
    "title": "2026年1月真题",
    "premium": true,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper3-2025-12",
    "type": "卷三",
    "title": "2025年12月真题",
    "premium": true,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper3-2025-11",
    "type": "卷三",
    "title": "2025年11月真题",
    "premium": true,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper3-2025-10",
    "type": "卷三",
    "title": "2025年10月真题",
    "premium": true,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper3-2025-09",
    "type": "卷三",
    "title": "2025年9月真题",
    "premium": true,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper3-2025-08",
    "type": "卷三",
    "title": "2025年8月真题",
    "premium": true,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper3-mock-09",
    "type": "卷三",
    "title": "卷三模拟试题9",
    "premium": true,
    "isMock": true,
    "total": 908
  },
  {
    "id": "paper1-2026-02",
    "type": "卷一",
    "title": "2026年2月真题",
    "premium": false,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper1-2026-01",
    "type": "卷一",
    "title": "2026年1月真题",
    "premium": true,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper1-2025-12",
    "type": "卷一",
    "title": "2025年12月真题",
    "premium": true,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper1-2025-11",
    "type": "卷一",
    "title": "2025年11月真题",
    "premium": true,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper1-2025-10",
    "type": "卷一",
    "title": "2025年10月真题",
    "premium": true,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper1-2025-09",
    "type": "卷一",
    "title": "2025年9月真题",
    "premium": true,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper1-2025-08",
    "type": "卷一",
    "title": "2025年8月真题",
    "premium": true,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper1-mock-08",
    "type": "卷一",
    "title": "卷一模拟试题8",
    "premium": true,
    "isMock": true,
    "total": 914
  },
  {
    "id": "paper1-random-mock",
    "type": "卷一",
    "title": "卷一随机模拟试卷",
    "premium": true,
    "isMock": true,
    "isDynamicMock": true,
    "total": 75
  },
  {
    "id": "paper2-mock-01",
    "type": "卷二",
    "title": "卷二模拟试题",
    "premium": true,
    "isMock": true,
    "total": 710
  },
  {
    "id": "paper2-random-mock",
    "type": "卷二",
    "title": "卷二随机模拟试卷",
    "premium": true,
    "isMock": true,
    "isDynamicMock": true,
    "total": 50
  },
  {
    "id": "paper4-mock-01",
    "type": "卷四",
    "title": "卷四模拟试题",
    "premium": true,
    "isMock": true,
    "total": 1140
  },
  {
    "id": "paper4-random-mock",
    "type": "卷四",
    "title": "卷四随机模拟试卷",
    "premium": true,
    "isMock": true,
    "isDynamicMock": true,
    "total": 80
  },
  {
    "id": "paper5-2026-03",
    "type": "卷五",
    "title": "2026年3月真题",
    "premium": true,
    "isMock": false,
    "total": 100
  },
  {
    "id": "paper5-mock-01",
    "type": "卷五",
    "title": "卷五模拟试题",
    "premium": true,
    "isMock": true,
    "total": 760
  },
  {
    "id": "paper5-random-mock",
    "type": "卷五",
    "title": "卷五随机模拟试卷",
    "premium": true,
    "isMock": true,
    "isDynamicMock": true,
    "total": 80
  }
];

function getPapersByType(type) {
  return papers
    .filter((item) => item.type === type)
    .sort((a, b) => Number(!!b.isDynamicMock) - Number(!!a.isDynamicMock))
    .map((item) => ({ ...item }));
}

function getAllPapers() {
  return papers.map((item) => ({ ...item }));
}

module.exports = {
  papers,
  getPapersByType,
  getAllPapers,
};
