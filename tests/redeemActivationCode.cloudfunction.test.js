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

function createCloudMock({
  openId = 'openid_1',
  rateLimited = false,
  rateFail = false,
  codeDoc = { status: 'unused' },
  throwInTx = false,
  throwErrMsg = '',
  failRateStartTx = false,
  failRedeemStartTx = false,
} = {}) {
  const rateTx = makeRateTx({ limited: rateLimited, fail: rateFail, limit: 10 });

  const tx = {
    collection: jest.fn((name) => {
      if (name === 'iiqe_activation_codes') {
        return {
          doc: jest.fn(() => ({
            get: jest.fn(async () => {
              if (throwInTx && throwErrMsg) {
                const err = new Error('db get fail');
                err.errMsg = throwErrMsg;
                throw err;
              }
              return { data: codeDoc };
            }),
            update: jest.fn(async () => {
              if (throwInTx && !throwErrMsg) throw new Error('update fail');
              return {};
            }),
          })),
        };
      }
      if (name === 'iiqe_entitlements') {
        return {
          doc: jest.fn(() => ({
            set: jest.fn(async () => {
              if (throwInTx && !throwErrMsg) throw new Error('set fail');
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

  const startTransaction = jest.fn();
  if (failRateStartTx) {
    startTransaction.mockRejectedValueOnce(new Error('rate tx init fail'));
  } else {
    startTransaction.mockResolvedValueOnce(rateTx);
  }
  if (failRedeemStartTx) {
    startTransaction.mockRejectedValueOnce(new Error('redeem tx init fail'));
  } else {
    startTransaction.mockResolvedValueOnce(tx);
  }

  const db = {
    serverDate: jest.fn(() => ({ $date: true })),
    startTransaction,
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(async () => ({})),
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

async function callMain(cloudMock, event) {
  jest.resetModules();
  jest.doMock('wx-server-sdk', () => cloudMock, { virtual: true });
  // eslint-disable-next-line global-require
  const fn = require('../cloudfunctions/redeemActivationCode/index.js');
  return fn.main(event);
}

describe('cloudfunctions/redeemActivationCode branches', () => {
  test('requires login', async () => {
    const result = await callMain(createCloudMock({ openId: '' }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('请先登录后再试');
    expect(result.errorCode).toBe('NOT_LOGGED_IN');
  });

  test('rejects bad format', async () => {
    const result = await callMain(createCloudMock(), { code: 'abc' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('授权码格式错误');
    expect(result.errorCode).toBe('INVALID_CODE_FORMAT');
  });

  test('returns rate limited', async () => {
    const result = await callMain(createCloudMock({ rateLimited: true }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('请求过于频繁，请稍后再试');
    expect(result.errorCode).toBe('RATE_LIMIT');
  });

  test('returns busy when rate check fails', async () => {
    const result = await callMain(createCloudMock({ rateFail: true }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('系统繁忙，请稍后再试');
    expect(result.errorCode).toBe('RATE_CHECK_FAILED');
  });

  test('returns busy when rate transaction init fails', async () => {
    const result = await callMain(createCloudMock({ failRateStartTx: true }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('系统繁忙，请稍后再试');
    expect(result.errorCode).toBe('RATE_CHECK_FAILED');
  });

  test('returns not found when code missing', async () => {
    const result = await callMain(createCloudMock({ codeDoc: null }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('授权码不存在');
    expect(result.errorCode).toBe('CODE_NOT_FOUND');
  });

  test('returns used when code already consumed', async () => {
    const result = await callMain(createCloudMock({ codeDoc: { status: 'used' } }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('授权码已被使用');
    expect(result.errorCode).toBe('CODE_USED');
  });

  test('returns success on valid unused code', async () => {
    const result = await callMain(createCloudMock({ codeDoc: { status: 'unused' } }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(true);
    expect(result.hasAccess).toBe(true);
    expect(result.message).toBe('授权成功');
  });

  test('maps document.get failure to not found', async () => {
    const result = await callMain(
      createCloudMock({ codeDoc: null, throwInTx: true, throwErrMsg: 'document.get:fail not found' }),
      { code: 'ABCDEFGH' },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe('授权码不存在');
  });

  test('returns generic verify fail on tx exception', async () => {
    const result = await callMain(createCloudMock({ throwInTx: true }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('验证失败，请稍后重试');
  });

  test('returns verify fail when redeem transaction init fails', async () => {
    const result = await callMain(createCloudMock({ failRedeemStartTx: true }), { code: 'ABCDEFGH' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('验证失败，请稍后重试');
  });
});
