describe('utils/entitlement', () => {
  test('setPremiumAccess + hasPremiumAccessLocal work together', () => {
    const { setPremiumAccess, hasPremiumAccessLocal } = require('../utils/entitlement');
    setPremiumAccess(true);
    expect(hasPremiumAccessLocal()).toBe(true);
    setPremiumAccess(false);
    expect(hasPremiumAccessLocal()).toBe(false);
  });

  test('agent profile local read/write and disabled status', () => {
    const {
      setAgentProfile,
      getAgentProfileLocal,
      isAgentLocal,
    } = require('../utils/entitlement');

    setAgentProfile({ isAgent: true, status: 'active', agentId: 'agt_1' });
    expect(getAgentProfileLocal()).toEqual(expect.objectContaining({ agentId: 'agt_1' }));
    expect(isAgentLocal()).toBe(true);

    setAgentProfile({ isAgent: true, status: 'disabled', agentId: 'agt_1' });
    expect(isAgentLocal()).toBe(false);
  });

  test('refreshPremiumAccess updates local cache from cloud result', async () => {
    wx.cloud.callFunction.mockResolvedValueOnce({ result: { ok: true, hasAccess: true } });
    const { refreshPremiumAccess, hasPremiumAccessLocal } = require('../utils/entitlement');

    const enabled = await refreshPremiumAccess();

    expect(enabled).toBe(true);
    expect(hasPremiumAccessLocal()).toBe(true);
  });

  test('refreshPremiumAccess falls back to local when cloud fails', async () => {
    const { setPremiumAccess, refreshPremiumAccess } = require('../utils/entitlement');
    setPremiumAccess(true);
    wx.cloud.callFunction.mockRejectedValueOnce(new Error('boom'));

    const enabled = await refreshPremiumAccess();

    expect(enabled).toBe(true);
  });

  test('refreshPremiumAccess keeps local state when cloud returns ok=false', async () => {
    const { setPremiumAccess, refreshPremiumAccess, hasPremiumAccessLocal } = require('../utils/entitlement');
    setPremiumAccess(true);
    wx.cloud.callFunction.mockResolvedValueOnce({ result: { ok: false, hasAccess: false } });

    const enabled = await refreshPremiumAccess();

    expect(enabled).toBe(true);
    expect(hasPremiumAccessLocal()).toBe(true);
  });

  test('refreshMyAgentProfile writes profile to local cache', async () => {
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        isAgent: true,
        agentId: 'agt_2',
        status: 'active',
        name: 'Agent',
        wxQrFileID: 'cloud://qr.png',
      },
    });

    const { refreshMyAgentProfile, getAgentProfileLocal } = require('../utils/entitlement');
    const profile = await refreshMyAgentProfile();

    expect(profile).toEqual(expect.objectContaining({ isAgent: true, agentId: 'agt_2' }));
    expect(getAgentProfileLocal()).toEqual(expect.objectContaining({ agentId: 'agt_2' }));
  });

  test('refreshActivationQrByUser falls back to local default when cloud fails', async () => {
    const { refreshActivationQrByUser } = require('../utils/entitlement');
    wx.cloud.callFunction.mockRejectedValueOnce(new Error('down'));

    const qr = await refreshActivationQrByUser();

    expect(qr).toBe('/assets/wechat_qr.jpg');
  });

  test('refreshActivationQrByUser prefers qrTempFileURL when provided', async () => {
    const { refreshActivationQrByUser } = require('../utils/entitlement');
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        qrFileID: 'cloud://agent/qr.jpg',
        qrTempFileURL: 'https://tmp.example.com/agent-qr.jpg',
      },
    });

    const qr = await refreshActivationQrByUser();

    expect(qr).toBe('https://tmp.example.com/agent-qr.jpg');
    expect(wx.getStorageSync('iiqe_activation_qr')).toEqual(
      expect.objectContaining({ qrFileID: 'https://tmp.example.com/agent-qr.jpg' }),
    );
  });
});
