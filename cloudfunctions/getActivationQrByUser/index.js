const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

async function getDefaultQr() {
  const cfg = await db.collection('iiqe_app_config').doc('default_activation_qr').get().catch(() => null);
  const data = cfg && cfg.data;
  return data && data.qrFileID ? String(data.qrFileID) : '';
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: true, qrFileID: '', source: 'none' };
  }

  const referralRes = await db.collection('iiqe_user_referrals').doc(OPENID).get().catch(() => null);
  const referral = referralRes && referralRes.data;

  if (referral && referral.refAgentId) {
    const profileRes = await db.collection('iiqe_agent_profiles').doc(referral.refAgentId).get().catch(() => null);
    const profile = profileRes && profileRes.data;
    if (profile && (profile.status || 'active') === 'active' && profile.wxQrFileID) {
      return {
        ok: true,
        qrFileID: String(profile.wxQrFileID),
        source: 'agent',
        refAgentId: referral.refAgentId,
      };
    }
  }

  const defaultQr = await getDefaultQr();
  return {
    ok: true,
    qrFileID: defaultQr,
    source: defaultQr ? 'default' : 'none',
  };
};
