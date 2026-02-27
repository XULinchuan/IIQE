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

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, message: '用户身份无效' };
  }

  const pass = await checkRateLimit(OPENID, 'agent_generate_share_code', 6, 60);
  if (!pass) {
    return { ok: false, message: '请求过于频繁，请稍后再试' };
  }

  const profileRes = await db.collection('iiqe_agent_profiles').where({ openId: OPENID }).limit(1).get();
  const profile = (profileRes.data && profileRes.data[0]) || null;
  if (!profile) {
    return { ok: false, message: '当前用户不是代理人' };
  }

  if ((profile.status || 'active') !== 'active') {
    return { ok: false, message: '代理人状态不可用' };
  }

  const envVersion = String(event.envVersion || 'trial');
  const page = 'pages/exam/home/home';
  const scene = `ref=${profile._id}`;

  try {
    const wxacodeRes = await cloud.openapi.wxacode.getUnlimited({
      scene,
      page,
      checkPath: false,
      envVersion,
    });

    const cloudPath = `agent-share-codes/${profile._id}-${Date.now()}.png`;
    const uploadRes = await cloud.uploadFile({
      cloudPath,
      fileContent: wxacodeRes.buffer,
    });

    await db.collection('iiqe_agent_profiles').doc(profile._id).update({
      data: {
        shareCodeFileID: uploadRes.fileID,
        updatedAt: db.serverDate(),
      },
    });

    return {
      ok: true,
      agentId: profile._id,
      ref: profile._id,
      page,
      scene,
      fileID: uploadRes.fileID,
    };
  } catch (err) {
    return {
      ok: false,
      message: '生成专属小程序码失败',
    };
  }
};
