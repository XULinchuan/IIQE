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

  const wxQrFileID = String(event.wxQrFileID || '').trim();
  if (!wxQrFileID || wxQrFileID.length > 300 || !/^cloud:\/\//.test(wxQrFileID)) {
    return { ok: false, message: '请先上传二维码图片' };
  }

  const pass = await checkRateLimit(OPENID, 'agent_update_qr', 6, 60);
  if (!pass) {
    return { ok: false, message: '请求过于频繁，请稍后再试' };
  }

  const res = await db.collection('iiqe_agent_profiles').where({ openId: OPENID }).limit(1).get();
  const profile = (res.data && res.data[0]) || null;
  if (!profile) {
    return { ok: false, message: '当前用户不是代理人' };
  }
  if ((profile.status || 'active') !== 'active') {
    return { ok: false, message: '代理人状态不可用' };
  }

  await db.collection('iiqe_agent_profiles').doc(profile._id).update({
    data: {
      wxQrFileID,
      updatedAt: db.serverDate(),
    },
  });

  return {
    ok: true,
    message: '二维码更新成功',
    agentId: profile._id,
    wxQrFileID,
  };
};
