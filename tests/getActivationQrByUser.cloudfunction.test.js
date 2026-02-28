function createCloudMock({
  openId = 'openid_1',
  referralDoc = null,
  agentDoc = null,
  defaultCfgDoc = null,
  tempUrlByFileId = {},
  hasTempApi = true,
} = {}) {
  const db = {
    collection: jest.fn((name) => ({
      doc: jest.fn((id) => ({
        get: jest.fn(async () => {
          if (name === 'iiqe_user_referrals') {
            if (referralDoc) return { data: referralDoc };
            throw new Error('not found');
          }
          if (name === 'iiqe_agent_profiles') {
            if (agentDoc && id === referralDoc?.refAgentId) return { data: agentDoc };
            throw new Error('not found');
          }
          if (name === 'iiqe_app_config' && id === 'default_activation_qr') {
            if (defaultCfgDoc) return { data: defaultCfgDoc };
            throw new Error('not found');
          }
          throw new Error('not found');
        }),
      })),
    })),
  };

  const cloudMock = {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    getWXContext: jest.fn(() => ({ OPENID: openId })),
    database: jest.fn(() => db),
  };

  if (hasTempApi) {
    cloudMock.getTempFileURL = jest.fn(async ({ fileList }) => {
      const fileID = fileList && fileList[0];
      const tempFileURL = tempUrlByFileId[fileID] || '';
      if (!tempFileURL) {
        return { fileList: [{ fileID, status: -1, errMsg: 'no temp url' }] };
      }
      return { fileList: [{ fileID, status: 0, tempFileURL }] };
    });
  }

  return cloudMock;
}

async function callMain(cloudMock) {
  jest.resetModules();
  jest.doMock('wx-server-sdk', () => cloudMock, { virtual: true });
  // eslint-disable-next-line global-require
  const fn = require('../cloudfunctions/getActivationQrByUser/index.js');
  return fn.main({});
}

describe('cloudfunctions/getActivationQrByUser', () => {
  test('returns none source when openid missing', async () => {
    const result = await callMain(createCloudMock({ openId: '' }));
    expect(result.source).toBe('none');
    expect(result.qrFileID).toBe('');
  });

  test('returns agent qr and temp url when referral and agent qr exist', async () => {
    const result = await callMain(createCloudMock({
      referralDoc: { refAgentId: 'agt_1' },
      agentDoc: { _id: 'agt_1', status: 'active', wxQrFileID: 'cloud://agent/qr.jpg' },
      tempUrlByFileId: { 'cloud://agent/qr.jpg': 'https://tmp/agent-qr.jpg' },
    }));

    expect(result.source).toBe('agent');
    expect(result.refAgentId).toBe('agt_1');
    expect(result.qrFileID).toBe('cloud://agent/qr.jpg');
    expect(result.qrTempFileURL).toBe('https://tmp/agent-qr.jpg');
  });

  test('falls back to default when referred agent disabled', async () => {
    const result = await callMain(createCloudMock({
      referralDoc: { refAgentId: 'agt_1' },
      agentDoc: { _id: 'agt_1', status: 'disabled', wxQrFileID: 'cloud://agent/qr.jpg' },
      defaultCfgDoc: { qrFileID: 'cloud://default/qr.jpg' },
      tempUrlByFileId: { 'cloud://default/qr.jpg': 'https://tmp/default-qr.jpg' },
    }));

    expect(result.source).toBe('default');
    expect(result.qrFileID).toBe('cloud://default/qr.jpg');
    expect(result.qrTempFileURL).toBe('https://tmp/default-qr.jpg');
  });

  test('supports legacy default fileID field', async () => {
    const result = await callMain(createCloudMock({
      defaultCfgDoc: { fileID: 'cloud://legacy/default.jpg' },
      tempUrlByFileId: { 'cloud://legacy/default.jpg': 'https://tmp/legacy.jpg' },
    }));

    expect(result.source).toBe('default');
    expect(result.qrFileID).toBe('cloud://legacy/default.jpg');
    expect(result.qrTempFileURL).toBe('https://tmp/legacy.jpg');
  });

  test('returns empty temp url when temp api unavailable', async () => {
    const result = await callMain(createCloudMock({
      referralDoc: { refAgentId: 'agt_1' },
      agentDoc: { _id: 'agt_1', status: 'active', wxQrFileID: 'cloud://agent/qr.jpg' },
      hasTempApi: false,
    }));

    expect(result.source).toBe('agent');
    expect(result.qrFileID).toBe('cloud://agent/qr.jpg');
    expect(result.qrTempFileURL).toBe('');
  });
});
