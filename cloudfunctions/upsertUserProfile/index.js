const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

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

function normalizeNickName(value) {
  const text = String(value || '').trim();
  return (text || '微信用户').slice(0, 40);
}

function normalizeAvatarUrl(value) {
  return String(value || '').trim().slice(0, 500);
}

function toUser(openId, doc) {
  return {
    id: openId,
    nickName: String((doc && doc.nickName) || '微信用户').slice(0, 40),
    avatarUrl: String((doc && doc.avatarUrl) || '').slice(0, 500),
    createdAt: Number((doc && doc.createdAt) || Date.now()),
    updatedAt: Number((doc && doc.updatedAt) || Date.now()),
  };
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, message: '请先登录后再试' };
  }

  const rate = await checkRateLimit(OPENID, 'upsert_user_profile', 6, 300);
  if (!rate.ok) {
    return { ok: false, message: '系统繁忙，请稍后再试' };
  }
  if (rate.limited) {
    return { ok: false, message: '请求过于频繁，请稍后再试' };
  }

  const nickName = normalizeNickName(event.nickName);
  const inputAvatarUrl = normalizeAvatarUrl(event.avatarUrl);

  const existingRes = await db.collection('iiqe_user_profiles').doc(OPENID).get().catch(() => null);
  const existing = existingRes && existingRes.data;
  const now = Date.now();

  const avatarUrl = inputAvatarUrl || String((existing && existing.avatarUrl) || '').slice(0, 500);

  const data = {
    openId: OPENID,
    nickName,
    avatarUrl,
    createdAt: Number((existing && existing.createdAt) || now),
    updatedAt: now,
  };

  await db.collection('iiqe_user_profiles').doc(OPENID).set({ data });

  return {
    ok: true,
    user: toUser(OPENID, data),
  };
};
