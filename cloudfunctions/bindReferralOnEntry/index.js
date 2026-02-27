const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function parseSceneRef(sceneRaw) {
  const scene = decodeURIComponent(String(sceneRaw || ''));
  if (!scene) return '';
  const parts = scene.split('&');
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k === 'ref' && v) return String(v).trim();
  }
  return '';
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, message: '用户身份无效' };
  }

  const refByQuery = String(event.refAgentId || event.ref || '').trim();
  const refByScene = parseSceneRef(event.scene || '');
  const refAgentId = refByQuery || refByScene;
  if (!refAgentId) {
    return { ok: true, bound: false, reason: 'no_ref' };
  }

  const refProfile = await db.collection('iiqe_agent_profiles').doc(refAgentId).get().catch(() => null);
  const refData = refProfile && refProfile.data;
  if (!refData || (refData.status || 'active') !== 'active') {
    return { ok: true, bound: false, reason: 'invalid_ref' };
  }

  const existingRes = await db.collection('iiqe_user_referrals').doc(OPENID).get().catch(() => null);
  const existing = existingRes && existingRes.data;
  if (existing && existing.locked) {
    return {
      ok: true,
      bound: true,
      locked: true,
      refAgentId: existing.refAgentId,
      changed: false,
    };
  }

  await db.collection('iiqe_user_referrals').doc(OPENID).set({
    data: {
      refAgentId,
      boundAt: db.serverDate(),
      bindSource: refByQuery ? 'path_ref' : 'scene',
      locked: true,
    },
  });

  return {
    ok: true,
    bound: true,
    locked: true,
    refAgentId,
    changed: true,
  };
};
