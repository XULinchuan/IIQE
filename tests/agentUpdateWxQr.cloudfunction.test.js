function makeRateTx({ limited = false, fail = false, windowSec = 60, limit = 6 } = {}) {
  const now = Date.now();
  const windowStart = now - (now % (windowSec * 1000));
  return {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(async () => ({ data: limited ? { windowStart, count: limit } : null })),
        set: jest.fn(async () => {
          if (fail) throw new Error('rate fail');
          return {};
        }),
      })),
    })),
    commit: jest.fn(async () => ({})),
    rollback: jest.fn(async () => ({})),
  };
}

function createCloudMock({
  openId = 'openid_1',
  rateLimited = false,
  rateFail = false,
  profile = { _id: 'agt_1', status: 'active' },
} = {}) {
  const rateTx = makeRateTx({ limited: rateLimited, fail: rateFail, limit: 6 });

  const db = {
    serverDate: jest.fn(() => ({ $date: true })),
    startTransaction: jest.fn(async () => rateTx),
    collection: jest.fn((name) => {
      if (name === 'iiqe_agent_profiles') {
        return {
          where: jest.fn(() => ({
            limit: jest.fn(() => ({
              get: jest.fn(async () => ({ data: profile ? [profile] : [] })),
            })),
          })),
          doc: jest.fn(() => ({
            update: jest.fn(async () => ({})),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn(async () => ({ data: null })),
          set: jest.fn(async () => ({})),
        })),
      };
    }),
  };

  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    getWXContext: jest.fn(() => ({ OPENID: openId })),
    database: jest.fn(() => db),
  };
}

async function callMain(cloudMock, event) {
  jest.resetModules();
  jest.doMock('wx-server-sdk', () => cloudMock, { virtual: true });
  // eslint-disable-next-line global-require
  const fn = require('../cloudfunctions/agentUpdateWxQr/index.js');
  return fn.main(event);
}

describe('cloudfunctions/agentUpdateWxQr branches', () => {
  test('requires login', async () => {
    const result = await callMain(createCloudMock({ openId: '' }), { wxQrFileID: 'cloud://a.jpg' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('请先登录后再试');
  });

  test('rejects invalid file id', async () => {
    const result = await callMain(createCloudMock(), { wxQrFileID: '/tmp/xx.jpg' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('请先上传二维码图片');
  });

  test('returns rate limited', async () => {
    const result = await callMain(createCloudMock({ rateLimited: true }), { wxQrFileID: 'cloud://a.jpg' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('请求过于频繁，请稍后再试');
  });

  test('returns busy when rate checker fails', async () => {
    const result = await callMain(createCloudMock({ rateFail: true }), { wxQrFileID: 'cloud://a.jpg' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('系统繁忙，请稍后再试');
  });

  test('requires agent profile', async () => {
    const result = await callMain(createCloudMock({ profile: null }), { wxQrFileID: 'cloud://a.jpg' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('请先开通代理人');
  });

  test('blocks disabled profile', async () => {
    const result = await callMain(createCloudMock({ profile: { _id: 'agt_1', status: 'disabled' } }), { wxQrFileID: 'cloud://a.jpg' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('当前代理人资格不可用，请联系管理员');
  });

  test('updates successfully with active profile', async () => {
    const result = await callMain(createCloudMock({ profile: { _id: 'agt_9', status: 'active' } }), { wxQrFileID: 'cloud://new.jpg' });
    expect(result.ok).toBe(true);
    expect(result.agentId).toBe('agt_9');
    expect(result.wxQrFileID).toBe('cloud://new.jpg');
  });
});
