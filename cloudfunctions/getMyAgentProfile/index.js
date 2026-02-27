const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, isAgent: false };
  }

  const res = await db.collection('iiqe_agent_profiles').where({ openId: OPENID }).limit(1).get();
  const profile = (res.data && res.data[0]) || null;
  if (!profile) {
    return { ok: true, isAgent: false };
  }

  return {
    ok: true,
    isAgent: true,
    agentId: profile._id,
    status: profile.status || 'active',
    name: profile.name || '',
    wxQrFileID: profile.wxQrFileID || '',
  };
};
