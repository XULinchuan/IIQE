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
      return false;
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
    return true;
  } catch (err) {
    try { await tx.rollback(); } catch (e) {}
    return false;
  }
}

function buildAgentId() {
  const now = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `agt_${now}${rand}`;
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, message: '用户身份无效' };
  }

  const pass = await checkRateLimit(OPENID, 'redeem_agent_invite', 10, 60);
  if (!pass) {
    return { ok: false, message: '请求过于频繁，请稍后再试' };
  }

  const code = normalizeCode(event.code);
  if (!/^[A-Z2-9]{8,20}$/.test(code)) {
    return { ok: false, message: '代理人码格式错误' };
  }

  const existingProfile = await db.collection('iiqe_agent_profiles').where({ openId: OPENID }).limit(1).get();
  if (existingProfile.data && existingProfile.data.length) {
    const profile = existingProfile.data[0];
    await db.collection('iiqe_entitlements').doc(OPENID).set({
      data: {
        premium: true,
        activatedAt: db.serverDate(),
        activationType: 'agent_code',
      },
    });
    return {
      ok: true,
      alreadyAgent: true,
      message: '已是代理人',
      agentId: profile._id,
      profileStatus: profile.status || 'active',
      premium: true,
    };
  }

  const tx = await db.startTransaction();
  try {
    const codeRes = await tx.collection('iiqe_agent_invite_codes').doc(code).get();
    const codeDoc = codeRes && codeRes.data;

    if (!codeDoc) {
      await tx.rollback();
      return { ok: false, message: '代理人码不存在' };
    }

    if (codeDoc.status !== 'unused') {
      await tx.rollback();
      return { ok: false, message: '代理人码已失效' };
    }

    const agentId = buildAgentId();

    await tx.collection('iiqe_agent_invite_codes').doc(code).update({
      data: {
        status: 'used',
        usedByOpenId: OPENID,
        usedAt: db.serverDate(),
        agentId,
      },
    });

    await tx.collection('iiqe_agent_profiles').doc(agentId).set({
      data: {
        openId: OPENID,
        status: 'active',
        inviteCode: code,
        activatedAt: db.serverDate(),
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    });

    await tx.collection('iiqe_entitlements').doc(OPENID).set({
      data: {
        premium: true,
        activatedAt: db.serverDate(),
        activationType: 'agent_code',
        activationCode: code,
      },
    });

    await tx.commit();

    return {
      ok: true,
      message: '代理人开通成功',
      agentId,
      premium: true,
    };
  } catch (err) {
    try {
      await tx.rollback();
    } catch (rollbackErr) {
      // ignore rollback failure
    }
    return {
      ok: false,
      message: '代理人码验证失败',
    };
  }
};
