const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, message: '用户身份无效' };
  }

  const code = normalizeCode(event && event.code);
  if (!/^[A-Z2-9]{8,20}$/.test(code)) {
    return { ok: false, message: '授权码格式错误' };
  }

  const tx = await db.startTransaction();

  try {
    const codeRes = await tx.collection('iiqe_activation_codes').doc(code).get();
    const codeDoc = codeRes && codeRes.data;

    if (!codeDoc) {
      await tx.rollback();
      return { ok: false, message: '授权码不存在' };
    }

    if (codeDoc.status !== 'unused') {
      await tx.rollback();
      return { ok: false, message: '授权码已被使用' };
    }

    await tx.collection('iiqe_activation_codes').doc(code).update({
      data: {
        status: 'used',
        usedAt: db.serverDate(),
        usedBy: OPENID,
      },
    });

    await tx.collection('iiqe_entitlements').doc(OPENID).set({
      data: {
        premium: true,
        activatedAt: db.serverDate(),
        activationCode: code,
      },
    });

    await tx.commit();

    return {
      ok: true,
      message: '授权成功',
      hasAccess: true,
    };
  } catch (err) {
    try {
      await tx.rollback();
    } catch (rollbackErr) {
      // ignore rollback failure
    }

    if (String(err && err.errMsg || '').includes('document.get:fail')) {
      return { ok: false, message: '授权码不存在' };
    }

    return {
      ok: false,
      message: '验证失败，请稍后重试',
      error: err && err.errMsg,
    };
  }
};
