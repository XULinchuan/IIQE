function makeRateTx({ limited = false, fail = false, windowSec = 60, limit = 10 } = {}) {
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

function createFnCloudMock({
  openId = 'openid_1',
  rateLimited = false,
  rateFail = false,
  existingProfile = null,
  codeDoc = { status: 'unused' },
  throwInTx = false,
} = {}) {
  const rateTx = makeRateTx({ limited: rateLimited, fail: rateFail, limit: 10 });

  const tx = {
    collection: jest.fn((name) => {
      if (name === 'iiqe_agent_invite_codes') {
        return {
          doc: jest.fn(() => ({
            get: jest.fn(async () => ({ data: codeDoc })),
            update: jest.fn(async () => {
              if (throwInTx) throw new Error('tx fail');
              return {};
            }),
          })),
        };
      }
      if (name === 'iiqe_agent_profiles') {
        return {
          doc: jest.fn(() => ({
            set: jest.fn(async () => {
              if (throwInTx) throw new Error('tx fail');
              return {};
            }),
          })),
        };
      }
      if (name === 'iiqe_entitlements') {
        return {
          doc: jest.fn(() => ({
            set: jest.fn(async () => {
              if (throwInTx) throw new Error('tx fail');
              return {};
            }),
          })),
        };
      }
      return { doc: jest.fn(() => ({})) };
    }),
    commit: jest.fn(async () => ({})),
    rollback: jest.fn(async () => ({})),
  };

  const db = {
    serverDate: jest.fn(() => ({ $date: true })),
    startTransaction: jest.fn()
      .mockResolvedValueOnce(rateTx)
      .mockResolvedValueOnce(tx),
    collection: jest.fn((name) => {
      if (name === 'iiqe_agent_profiles') {
        return {
          where: jest.fn(() => ({
            limit: jest.fn(() => ({
              get: jest.fn(async () => ({ data: existingProfile ? [existingProfile] : [] })),
            })),
          })),
          doc: jest.fn(() => ({ set: jest.fn(async () => ({})) })),
        };
      }
      if (name === 'iiqe_entitlements') {
        return {
          doc: jest.fn(() => ({ set: jest.fn(async () => ({})) })),
        };
      }
      return {
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(async () => ({ data: [] })),
          })),
        })),
        doc: jest.fn(() => ({ get: jest.fn(async () => ({ data: null })) })),
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
  const fn = require('../cloudfunctions/redeemAgentInviteCode/index.js');
  return fn.main(event);
}

describe('cloudfunctions/redeemAgentInviteCode branches', () => {
  test('returns rate limited message', async () => {
    const result = await callMain(createFnCloudMock({ rateLimited: true }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('请求过于频繁，请稍后再试');
  });

  test('returns busy message when rate checker fails', async () => {
    const result = await callMain(createFnCloudMock({ rateFail: true }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('系统繁忙，请稍后再试');
  });

  test('returns alreadyAgent when profile already exists', async () => {
    const result = await callMain(
      createFnCloudMock({ existingProfile: { _id: 'agt_1', status: 'active' } }),
      { code: 'ABCDEFGH' },
    );
    expect(result.ok).toBe(true);
    expect(result.alreadyAgent).toBe(true);
    expect(result.agentId).toBe('agt_1');
  });

  test('returns not found when invite code missing', async () => {
    const result = await callMain(createFnCloudMock({ codeDoc: null }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('代理人码不存在');
  });

  test('returns invalid when invite code already used', async () => {
    const result = await callMain(createFnCloudMock({ codeDoc: { status: 'used' } }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('代理人码已失效');
  });

  test('successfully redeems unused code', async () => {
    const result = await callMain(createFnCloudMock({ codeDoc: { status: 'unused' } }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(true);
    expect(result.premium).toBe(true);
    expect(result.agentId).toEqual(expect.stringMatching(/^agt_/));
  });

  test('returns validation fail on tx exception', async () => {
    const result = await callMain(createFnCloudMock({ codeDoc: { status: 'unused' }, throwInTx: true }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('代理人码验证失败');
  });
});
