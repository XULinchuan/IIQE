const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

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
