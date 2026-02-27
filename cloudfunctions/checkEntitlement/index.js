const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { hasAccess: false };
  }

  try {
    const res = await db.collection('iiqe_entitlements').doc(OPENID).get();
    return {
      hasAccess: !!(res && res.data && res.data.premium === true),
    };
  } catch (err) {
    return {
      hasAccess: false,
    };
  }
};
