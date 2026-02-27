const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, message: '用户身份无效' };
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
      error: err && err.errMsg,
    };
  }
};
