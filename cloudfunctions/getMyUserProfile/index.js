const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function toUser(openId, doc) {
  return {
    id: openId,
    nickName: String((doc && doc.nickName) || '微信用户').slice(0, 40),
    avatarUrl: String((doc && doc.avatarUrl) || '').slice(0, 500),
    createdAt: Number((doc && doc.createdAt) || Date.now()),
    updatedAt: Number((doc && doc.updatedAt) || Date.now()),
  };
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, message: '请先登录后再试' };
  }

  const res = await db.collection('iiqe_user_profiles').doc(OPENID).get().catch(() => null);
  const doc = res && res.data;
  if (!doc) {
    return { ok: true, user: null };
  }

  return {
    ok: true,
    user: toUser(OPENID, doc),
  };
};
