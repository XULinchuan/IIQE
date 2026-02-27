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
  const p = path.join(__dirname, 'codes.json');
  if (!fs.existsSync(p)) return [];
  const content = fs.readFileSync(p, 'utf8');
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

exports.main = async (event) => {
  const adminKey = String(event && event.adminKey || '');
  const expectedKey = process.env.IMPORT_ADMIN_KEY || '';
  if (!expectedKey || adminKey !== expectedKey) {
    return { ok: false, message: '管理员密钥错误' };
  }

  const source = String(event && event.source || 'file');
  const codes = source === 'event' ? normalizeCodes(event.codes || []) : loadCodesFromFile();
  if (!codes.length) {
    return { ok: false, message: '没有可导入的授权码' };
  }

  const start = toSafeInt(event && event.start, 0);
  const limit = Math.min(toSafeInt(event && event.limit, 300), 300);
  const end = Math.min(start + limit, codes.length);
  const slice = codes.slice(start, end);
  const codeChunks = chunkArray(slice, 100);
  let inserted = 0;
  let skipped = 0;

  for (const chunk of codeChunks) {
    const existingRes = await db.collection('iiqe_activation_codes').where({ _id: _.in(chunk) }).field({ _id: true }).get();
    const existsSet = new Set((existingRes && existingRes.data || []).map((item) => item._id));
    const toInsert = chunk.filter((code) => !existsSet.has(code));
    skipped += chunk.length - toInsert.length;

    if (!toInsert.length) {
      continue;
    }

    const tx = await db.startTransaction();
    try {
      for (const code of toInsert) {
        await tx.collection('iiqe_activation_codes').doc(code).set({
          data: {
            status: 'unused',
            createdAt: db.serverDate(),
          },
        });
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    inserted += toInsert.length;
  }

  return {
    ok: true,
    start,
    end,
    total: codes.length,
    processed: slice.length,
    inserted,
    skipped,
    hasMore: end < codes.length,
    nextStart: end < codes.length ? end : null,
  };
};
