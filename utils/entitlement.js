const PREMIUM_ACCESS_KEY = 'iiqe_premium_access';
const AGENT_PROFILE_KEY = 'iiqe_agent_profile';
const ACTIVATION_QR_KEY = 'iiqe_activation_qr';

function setPremiumAccess(enabled) {
  wx.setStorageSync(PREMIUM_ACCESS_KEY, {
    enabled: !!enabled,
    updatedAt: Date.now(),
  });
}

function hasPremiumAccessLocal() {
  const data = wx.getStorageSync(PREMIUM_ACCESS_KEY);
  return !!(data && data.enabled);
}

function setAgentProfile(profile) {
  if (!profile) {
    wx.removeStorageSync(AGENT_PROFILE_KEY);
    return;
  }
  wx.setStorageSync(AGENT_PROFILE_KEY, {
    ...profile,
    updatedAt: Date.now(),
  });
}

function getAgentProfileLocal() {
  return wx.getStorageSync(AGENT_PROFILE_KEY) || null;
}

function isAgentLocal() {
  const profile = getAgentProfileLocal();
  return !!(profile && profile.isAgent && profile.status !== 'disabled');
}

function setActivationQrLocal(qrFileID) {
  if (!qrFileID) return;
  wx.setStorageSync(ACTIVATION_QR_KEY, {
    qrFileID,
    updatedAt: Date.now(),
  });
}

function getActivationQrLocal() {
  const data = wx.getStorageSync(ACTIVATION_QR_KEY);
  return (data && data.qrFileID) || '/assets/wechat_qr.jpg';
}

async function refreshPremiumAccess() {
  if (!wx.cloud || !wx.cloud.callFunction) return hasPremiumAccessLocal();
  try {
    const res = await wx.cloud.callFunction({
      name: 'checkEntitlement',
    });
    const result = res && res.result;
    const hasAccess = !!(result && result.hasAccess);
    if (result && result.ok === true) {
      setPremiumAccess(hasAccess);
      return hasAccess;
    }
    return hasPremiumAccessLocal();
  } catch (err) {
    return hasPremiumAccessLocal();
  }
}

async function refreshMyAgentProfile() {
  if (!wx.cloud || !wx.cloud.callFunction) return getAgentProfileLocal();
  try {
    const res = await wx.cloud.callFunction({
      name: 'getMyAgentProfile',
    });
    const result = res && res.result;
    const profile = {
      isAgent: !!(result && result.isAgent),
      agentId: (result && result.agentId) || '',
      status: (result && result.status) || '',
      name: (result && result.name) || '',
      wxQrFileID: (result && result.wxQrFileID) || '',
    };
    setAgentProfile(profile);
    return profile;
  } catch (err) {
    return getAgentProfileLocal();
  }
}

async function refreshActivationQrByUser() {
  if (!wx.cloud || !wx.cloud.callFunction) return getActivationQrLocal();
  try {
    const res = await wx.cloud.callFunction({
      name: 'getActivationQrByUser',
    });
    const result = res && res.result;
    const qrSrc = (result && (result.qrTempFileURL || result.qrFileID)) || '';
    if (qrSrc) {
      setActivationQrLocal(qrSrc);
      return qrSrc;
    }
    return getActivationQrLocal();
  } catch (err) {
    return getActivationQrLocal();
  }
}

module.exports = {
  PREMIUM_ACCESS_KEY,
  AGENT_PROFILE_KEY,
  ACTIVATION_QR_KEY,
  setPremiumAccess,
  hasPremiumAccessLocal,
  refreshPremiumAccess,
  setAgentProfile,
  getAgentProfileLocal,
  isAgentLocal,
  setActivationQrLocal,
  getActivationQrLocal,
  refreshMyAgentProfile,
  refreshActivationQrByUser,
};
