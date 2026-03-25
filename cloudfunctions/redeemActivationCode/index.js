const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

async function checkRateLimit(openId, action, limit, windowSec) {
  const now = Date.now();
  const windowStart = now - (now % (windowSec * 1000));
  const key = `rl_${action}_${openId}`;
  const tx = await db.startTransaction();
  try {
    const res = await tx.collection('iiqe_rate_limits').doc(key).get().catch(() => null);
    const doc = res && res.data;
    const count = doc && doc.windowStart === windowStart ? Number(doc.count || 0) : 0;
    if (count >= limit) {
      await tx.rollback();
      return { ok: true, limited: true };
    }
    await tx.collection('iiqe_rate_limits').doc(key).set({
      data: {
        action,
        openId,
        windowStart,
        count: count + 1,
        updatedAt: db.serverDate(),
      },
    });
    await tx.commit();
    return { ok: true, limited: false };
  } catch (err) {
    try { await tx.rollback(); } catch (e) {}
    return { ok: false, limited: false };
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, message: '请先登录后再试' };
  }

  const rate = await checkRateLimit(OPENID, 'redeem_activation', 10, 60);
  if (!rate.ok) {
    return { ok: false, message: '系统繁忙，请稍后再试' };
  }
  if (rate.limited) {
    return { ok: false, message: '请求过于频繁，请稍后再试' };
  }

  const code = normalizeCode(event && event.code);
  if (!/^[A-Z0-9]{8,20}$/.test(code)) {
    return { ok: false, message: '授权码格式错误' };
  }

  const tx = await db.startTransaction();

  try {
    const codeRes = await tx.collection('iiqe_activation_codes').doc(code).get();
    const codeDoc = codeRes && codeRes.data;

    if (!codeDoc) {
      await tx.rollback();
      return { ok: false, message: '授权码不存在' };
    }

    if (codeDoc.status !== 'unused') {
      await tx.rollback();
      return { ok: false, message: '授权码已被使用' };
    }

    await tx.collection('iiqe_activation_codes').doc(code).update({
      data: {
        status: 'used',
        usedAt: db.serverDate(),
        usedBy: OPENID,
      },
    });

    await tx.collection('iiqe_entitlements').doc(OPENID).set({
      data: {
        premium: true,
        activatedAt: db.serverDate(),
        activationCode: code,
      },
    });

    await tx.commit();

    return {
      ok: true,
      message: '授权成功',
      hasAccess: true,
    };
  } catch (err) {
    try {
      await tx.rollback();
    } catch (rollbackErr) {
      // ignore rollback failure
    }

    if (String(err && err.errMsg || '').includes('document.get:fail')) {
      return { ok: false, message: '授权码不存在' };
    }

    return {
      ok: false,
      message: '验证失败，请稍后重试',
    };
  }
};
