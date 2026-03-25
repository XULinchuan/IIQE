const { loadPage, createPageInstance } = require('./pageTestUtils');

function mockDeps() {
  jest.doMock('../utils/volume-collection', () => ({
    getVolumeCollectionSummary: jest.fn(() => ({
      total: 6,
      answered: 2,
      correct: 1,
      accuracy: '50%',
      chapterStats: [{ chapterNo: '1', title: '第1章', total: 6, answered: 2, correct: 1, accuracy: '50%' }],
    })),
  }));
}

describe('pages/exam/volume_collection/volume_collection.js', () => {
  test('onLoad sets nav title and stats', async () => {
    mockDeps();
    const def = loadPage('../pages/exam/volume_collection/volume_collection.js');
    const page = createPageInstance(def);

    await page.onLoad({ volumeId: encodeURIComponent('卷一'), type: 'wrong' });

    expect(wx.setNavigationBarTitle).toHaveBeenCalledWith({ title: '卷一错题集' });
    expect(page.data.total).toBe(6);
    expect(page.data.chapterStats.length).toBe(1);
  });

  test('startChapter opens volume question mode', async () => {
    mockDeps();
    const def = loadPage('../pages/exam/volume_collection/volume_collection.js');
    const page = createPageInstance(def);
    page.setData({ volumeId: '卷五', type: 'favorite' });

    await page.startChapter({ currentTarget: { dataset: { chapterNo: '2' } } });

    expect(wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/pages/exam/question/question?mode=volume_favorite&volumeId=%E5%8D%B7%E4%BA%94&chapterNo=2',
    }));
  });

  test('onLoad no longer enforces entitlement for volume collection', async () => {
    mockDeps();
    const def = loadPage('../pages/exam/volume_collection/volume_collection.js');
    const page = createPageInstance(def);

    await page.onLoad({ volumeId: encodeURIComponent('卷一'), type: 'wrong' });

    expect(page.data.volumeId).toBe('卷一');
    expect(page.data.type).toBe('wrong');
    expect(wx.showToast).not.toHaveBeenCalledWith({ title: '该题集需先授权', icon: 'none' });
  });
});
