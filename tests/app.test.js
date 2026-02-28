function loadAppDef() {
  let captured = null;
  global.App = jest.fn((def) => {
    captured = def;
    return def;
  });
  require('../app.js');
  return captured;
}

describe('app.js referral binding', () => {
  test('onLaunch initializes cloud when available', () => {
    wx.cloud.init = jest.fn();
    const app = loadAppDef();
    app.onLaunch();
    expect(wx.cloud.init).toHaveBeenCalledWith({ traceUser: true });
  });

  test('onShow binds referral from query.ref', () => {
    wx.cloud.callFunction = jest.fn().mockResolvedValue({});
    const app = loadAppDef();
    app.onShow({ query: { ref: 'agt_abc' } });

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'bindReferralOnEntry',
      data: {
        refAgentId: 'agt_abc',
        scene: '',
      },
    });
  });

  test('onShow binds referral from query.scene', () => {
    wx.cloud.callFunction = jest.fn().mockResolvedValue({});
    const app = loadAppDef();
    app.onShow({ query: { scene: 'ref%3Dagt_scene%26x%3D1' } });

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'bindReferralOnEntry',
      data: {
        refAgentId: 'agt_scene',
        scene: 'ref%3Dagt_scene%26x%3D1',
      },
    });
  });

  test('onShow does not bind when ref missing', () => {
    wx.cloud.callFunction = jest.fn().mockResolvedValue({});
    const app = loadAppDef();
    app.onShow({ query: { foo: 'bar' } });
    expect(wx.cloud.callFunction).not.toHaveBeenCalled();
  });
});
