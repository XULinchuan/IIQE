const fs = require('fs');
const path = require('path');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function normalizeCodes(codes) {
  const list = Array.isArray(codes) ? codes : [];
  const map = new Map();
  for (const code of list) {
    const value = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (/^[A-Z2-9]{8,20}$/.test(value)) {
      map.set(value, true);
    }
  }
  return Array.from(map.keys());
}

function loadCodesFromFile() {
  const filePath = path.join(__dirname, 'codes.json');
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  return normalizeCodes(JSON.parse(content));
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function toSafeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

exports.main = async (event = {}) => {
  const adminKey = String(event.adminKey || '');
  const expectedKey = process.env.AGENT_IMPORT_ADMIN_KEY || '';
  if (!expectedKey || adminKey !== expectedKey) {
    return { ok: false, message: '管理员密钥错误' };
  }

  const source = String(event.source || 'file');
  const allCodes = source === 'event' ? normalizeCodes(event.codes || []) : loadCodesFromFile();
  if (!allCodes.length) {
    return { ok: false, message: '没有可导入的代理人码' };
  }

  const start = toSafeInt(event.start, 0);
  const limit = Math.min(toSafeInt(event.limit, 300), 300);
  const end = Math.min(start + limit, allCodes.length);
  const codes = allCodes.slice(start, end);

  const chunks = chunkArray(codes, 100);
  let inserted = 0;
  let skipped = 0;

  for (const chunk of chunks) {
    const existing = await db.collection('iiqe_agent_invite_codes').where({ _id: _.in(chunk) }).field({ _id: true }).get();
    const existingSet = new Set((existing.data || []).map((item) => item._id));
    const toInsert = chunk.filter((code) => !existingSet.has(code));
    skipped += chunk.length - toInsert.length;

    if (!toInsert.length) continue;

    const tx = await db.startTransaction();
    try {
      for (const code of toInsert) {
        await tx.collection('iiqe_agent_invite_codes').doc(code).set({
          data: {
            status: 'unused',
            createdAt: db.serverDate(),
          },
        });
      }
      await tx.commit();
      inserted += toInsert.length;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  return {
    ok: true,
    total: allCodes.length,
    start,
    end,
    processed: codes.length,
    inserted,
    skipped,
    hasMore: end < allCodes.length,
    nextStart: end < allCodes.length ? end : null,
  };
};
