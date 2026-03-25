function buildRateTx({ limited = false, fail = false, limit = 10, windowSec = 60 } = {}) {
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

function baseCloudMock({ openId = 'openid_1', startTransactionImpl, collectionImpl } = {}) {
  const db = {
    serverDate: jest.fn(() => ({ $date: true })),
    startTransaction: startTransactionImpl || jest.fn(async () => buildRateTx()),
    collection: collectionImpl || jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn(async () => ({ data: [] })),
        })),
      })),
      doc: jest.fn(() => ({
        get: jest.fn(async () => ({ data: null })),
        set: jest.fn(async () => ({})),
        update: jest.fn(async () => ({})),
      })),
    })),
  };

  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    getWXContext: jest.fn(() => ({ OPENID: openId })),
    database: jest.fn(() => db),
  };
}

async function runMain(modulePath, cloudMock, event) {
  jest.resetModules();
  jest.doMock('wx-server-sdk', () => cloudMock, { virtual: true });
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const fn = require(modulePath);
  return fn.main(event);
}

describe('cloud function input validation and key branches', () => {
  test('redeemActivationCode rejects invalid code format', async () => {
    const cloudMock = baseCloudMock();
    const result = await runMain('../cloudfunctions/redeemActivationCode/index.js', cloudMock, { code: 'abc' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('授权码格式错误');
  });

  test('redeemActivationCode requires login context', async () => {
    const cloudMock = baseCloudMock({ openId: '' });
    const result = await runMain('../cloudfunctions/redeemActivationCode/index.js', cloudMock, { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('请先登录后再试');
  });

  test('redeemActivationCode returns too frequent when rate limited', async () => {
    const rateTx = buildRateTx({ limited: true, limit: 10 });
    const cloudMock = baseCloudMock({
      startTransactionImpl: jest.fn(async () => rateTx),
    });
    const result = await runMain('../cloudfunctions/redeemActivationCode/index.js', cloudMock, { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('请求过于频繁，请稍后再试');
  });

  test('redeemActivationCode returns busy when rate check fails', async () => {
    const rateTx = buildRateTx({ fail: true });
    const cloudMock = baseCloudMock({
      startTransactionImpl: jest.fn(async () => rateTx),
    });
    const result = await runMain('../cloudfunctions/redeemActivationCode/index.js', cloudMock, { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('系统繁忙，请稍后再试');
  });

  test('redeemAgentInviteCode rejects invalid code format', async () => {
    const cloudMock = baseCloudMock();
    const result = await runMain('../cloudfunctions/redeemAgentInviteCode/index.js', cloudMock, { code: '12' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('代理人码格式错误');
  });

  test('redeemAgentInviteCode returns already agent when profile exists', async () => {
    const collectionImpl = jest.fn((name) => {
      if (name === 'iiqe_agent_profiles') {
        return {
          where: jest.fn(() => ({
            limit: jest.fn(() => ({
              get: jest.fn(async () => ({ data: [{ _id: 'agt_1', status: 'active' }] })),
            })),
          })),
        };
      }
      if (name === 'iiqe_entitlements') {
        return { doc: jest.fn(() => ({ set: jest.fn(async () => ({})) })) };
      }
      return {
        where: jest.fn(() => ({
          limit: jest.fn(() => ({ get: jest.fn(async () => ({ data: [] })) })),
        })),
        doc: jest.fn(() => ({ get: jest.fn(async () => ({ data: null })), set: jest.fn(async () => ({})), update: jest.fn(async () => ({})) })),
      };
    });

    const cloudMock = baseCloudMock({ collectionImpl });
    const result = await runMain('../cloudfunctions/redeemAgentInviteCode/index.js', cloudMock, { code: 'ABCDEFGH' });
    expect(result.ok).toBe(true);
    expect(result.alreadyAgent).toBe(true);
  });

  test('agentUpdateWxQr rejects invalid qr file id', async () => {
    const cloudMock = baseCloudMock();
    const result = await runMain('../cloudfunctions/agentUpdateWxQr/index.js', cloudMock, { wxQrFileID: '/tmp/a.jpg' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('请先上传二维码图片');
  });

  test('agentUpdateWxQr returns too frequent when rate limited', async () => {
    const rateTx = buildRateTx({ limited: true, limit: 6 });
    const cloudMock = baseCloudMock({ startTransactionImpl: jest.fn(async () => rateTx) });
    const result = await runMain('../cloudfunctions/agentUpdateWxQr/index.js', cloudMock, { wxQrFileID: 'cloud://a.jpg' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('请求过于频繁，请稍后再试');
  });

  test('checkEntitlement returns ok=true when entitlement exists', async () => {
    const collectionImpl = jest.fn((name) => {
      if (name === 'iiqe_entitlements') {
        return {
          doc: jest.fn(() => ({
            get: jest.fn(async () => ({ data: { premium: true } })),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn(async () => ({ data: null })),
        })),
      };
    });
    const cloudMock = baseCloudMock({ collectionImpl });
    const result = await runMain('../cloudfunctions/checkEntitlement/index.js', cloudMock, {});
    expect(result.ok).toBe(true);
    expect(result.hasAccess).toBe(true);
  });

  test('checkEntitlement returns ok=false when db throws', async () => {
    const collectionImpl = jest.fn((name) => {
      if (name === 'iiqe_entitlements') {
        return {
          doc: jest.fn(() => ({
            get: jest.fn(async () => { throw new Error('db fail'); }),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn(async () => ({ data: null })),
        })),
      };
    });
    const cloudMock = baseCloudMock({ collectionImpl });
    const result = await runMain('../cloudfunctions/checkEntitlement/index.js', cloudMock, {});
    expect(result.ok).toBe(false);
    expect(result.hasAccess).toBe(false);
  });

  test('upsertUserProfile returns too frequent when rate limited', async () => {
    const rateTx = buildRateTx({ limited: true, limit: 6, windowSec: 300 });
    const cloudMock = baseCloudMock({
      startTransactionImpl: jest.fn(async () => rateTx),
    });
    const result = await runMain('../cloudfunctions/upsertUserProfile/index.js', cloudMock, {
      nickName: '测试昵称',
      avatarUrl: 'cloud://a.jpg',
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('请求过于频繁，请稍后再试');
  });

  test('upsertUserProfile returns busy when rate check fails', async () => {
    const rateTx = buildRateTx({ fail: true });
    const cloudMock = baseCloudMock({
      startTransactionImpl: jest.fn(async () => rateTx),
    });
    const result = await runMain('../cloudfunctions/upsertUserProfile/index.js', cloudMock, {
      nickName: '测试昵称',
      avatarUrl: 'cloud://a.jpg',
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('系统繁忙，请稍后再试');
  });
});
