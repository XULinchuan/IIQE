const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

async function getDefaultQr() {
  const cfg = await db.collection('iiqe_app_config').doc('default_activation_qr').get().catch(() => null);
  const data = cfg && cfg.data;
  if (!data) return '';
  return String(data.qrFileID || data.fileID || '').trim();
}

async function buildTempUrl(fileID) {
  const file = String(fileID || '').trim();
  if (!file) return '';
  try {
    if (!cloud.getTempFileURL) return '';
    const res = await cloud.getTempFileURL({ fileList: [file] });
    const item = res && res.fileList && res.fileList[0];
    const status = Number((item && item.status) || 0);
    if (status !== 0) return '';
    return String((item && (item.tempFileURL || item.tempFileUrl)) || '');
  } catch (err) {
    return '';
  }
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: true, qrFileID: '', qrTempFileURL: '', source: 'none' };
  }

  const referralRes = await db.collection('iiqe_user_referrals').doc(OPENID).get().catch(() => null);
  const referral = referralRes && referralRes.data;

  if (referral && referral.refAgentId) {
    const profileRes = await db.collection('iiqe_agent_profiles').doc(referral.refAgentId).get().catch(() => null);
    const profile = profileRes && profileRes.data;
    if (profile && (profile.status || 'active') === 'active' && profile.wxQrFileID) {
      const qrFileID = String(profile.wxQrFileID);
      const qrTempFileURL = await buildTempUrl(qrFileID);
      return {
        ok: true,
        qrFileID,
        qrTempFileURL,
        source: 'agent',
        refAgentId: referral.refAgentId,
      };
    }
  }

  const defaultQr = await getDefaultQr();
  const defaultTempUrl = defaultQr ? await buildTempUrl(defaultQr) : '';
  return {
    ok: true,
    qrFileID: defaultQr,
    qrTempFileURL: defaultTempUrl,
    source: defaultQr ? 'default' : 'none',
  };
};
