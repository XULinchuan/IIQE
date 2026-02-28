describe('utils/auth', () => {
  test('normalizeRedirectUrl allows exam page', () => {
    const { normalizeRedirectUrl } = require('../utils/auth');
    expect(normalizeRedirectUrl('/pages/exam/home/home')).toBe('/pages/exam/home/home');
  });

  test('normalizeRedirectUrl allows agent page', () => {
    const { normalizeRedirectUrl } = require('../utils/auth');
    expect(normalizeRedirectUrl('/pages/agent/qrcode/qrcode')).toBe('/pages/agent/qrcode/qrcode');
  });

  test('normalizeRedirectUrl blocks invalid path', () => {
    const { normalizeRedirectUrl } = require('../utils/auth');
    expect(normalizeRedirectUrl('https://evil.com')).toBe('');
    expect(normalizeRedirectUrl('/pages/home/home')).toBe('');
  });

  test('requireLogin passes immediately when local user exists', async () => {
    const { getUserKey, requireLogin } = require('../utils/auth');
    wx.setStorageSync(getUserKey(), { id: 'u_1', nickName: 'A' });

    const ok = await requireLogin('/pages/exam/home/home');

    expect(ok).toBe(true);
    expect(wx.reLaunch).not.toHaveBeenCalled();
    expect(wx.showToast).not.toHaveBeenCalled();
  });

  test('requireLogin restores user from cloud and passes', async () => {
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        ok: true,
        user: {
          id: 'openid_1',
          nickName: 'Leo',
          avatarUrl: 'cloud://avatar.png',
          createdAt: 1,
          updatedAt: 2,
        },
      },
    });

    const { getUserKey, requireLogin } = require('../utils/auth');
    const ok = await requireLogin('/pages/exam/home/home');

    expect(ok).toBe(true);
    expect(wx.getStorageSync(getUserKey())).toEqual(expect.objectContaining({ id: 'openid_1', nickName: 'Leo' }));
    expect(wx.reLaunch).not.toHaveBeenCalled();
  });

  test('requireLogin redirects to me when no local/cloud user', async () => {
    wx.cloud.callFunction.mockResolvedValueOnce({ result: { ok: true, user: null } });

    const { requireLogin } = require('../utils/auth');
    const ok = await requireLogin('/pages/exam/paper/paper?paperId=p_1');

    expect(ok).toBe(false);
    expect(wx.setStorageSync).toHaveBeenCalledWith('iiqe_login_redirect', '/pages/exam/paper/paper?paperId=p_1');
    expect(wx.showToast).toHaveBeenCalledWith({ title: '请先登录', icon: 'none' });
    expect(wx.reLaunch).toHaveBeenCalledWith({ url: '/pages/exam/me/me' });
  });

  test('requireLogin deduplicates concurrent cloud restore calls', async () => {
    let resolveCloud;
    const cloudPromise = new Promise((resolve) => {
      resolveCloud = resolve;
    });
    wx.cloud.callFunction.mockReturnValue(cloudPromise);

    const { requireLogin } = require('../utils/auth');
    const p1 = requireLogin('/pages/exam/home/home');
    const p2 = requireLogin('/pages/exam/paper/paper?paperId=p_1');

    resolveCloud({
      result: {
        ok: true,
        user: { id: 'openid_2', nickName: 'U2', avatarUrl: '', createdAt: 1, updatedAt: 1 },
      },
    });

    const [ok1, ok2] = await Promise.all([p1, p2]);
    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1);
  });

  test('requireLogin handles cloud throw and redirects once', async () => {
    wx.cloud.callFunction.mockRejectedValueOnce(new Error('network'));
    const { requireLogin } = require('../utils/auth');
    const ok = await requireLogin('/pages/exam/home/home');
    expect(ok).toBe(false);
    expect(wx.showToast).toHaveBeenCalledWith({ title: '请先登录', icon: 'none' });
    expect(wx.reLaunch).toHaveBeenCalledWith({ url: '/pages/exam/me/me' });
  });

  test('upsertUserProfileToCloud saves normalized user to local', async () => {
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        ok: true,
        user: {
          id: 'openid_x',
          nickName: 'N',
          avatarUrl: 'cloud://x.jpg',
          createdAt: 10,
          updatedAt: 11,
        },
      },
    });

    const { getUserKey, upsertUserProfileToCloud } = require('../utils/auth');
    const res = await upsertUserProfileToCloud({ nickName: 'N', avatarUrl: 'cloud://x.jpg' });

    expect(res.ok).toBe(true);
    expect(wx.getStorageSync(getUserKey())).toEqual(expect.objectContaining({ id: 'openid_x' }));
  });

  test('upsertUserProfileToCloud fails gracefully when cloud unavailable', async () => {
    wx.cloud = null;
    const { upsertUserProfileToCloud } = require('../utils/auth');

    const res = await upsertUserProfileToCloud({ nickName: 'N' });

    expect(res.ok).toBe(false);
    expect(res.message).toContain('服务暂时不可用');
  });
});
