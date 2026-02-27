const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, message: '用户身份无效' };
  }

  const wxQrFileID = String(event.wxQrFileID || '').trim();
  if (!wxQrFileID) {
    return { ok: false, message: '请先上传二维码图片' };
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
