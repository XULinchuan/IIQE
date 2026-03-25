function looksTechnical(text) {
  const s = String(text || '');
  if (!s) return false;
  return /errorcode|errmsg|statuscode|requestid|stack|exception|typeerror|referenceerror|syntaxerror|network\s*error|http\/?\d|\btrace\b|\bfailed?\b|\btimeout\b|\bat\s+\//i.test(s);
}

function safeUserMessage(message, fallback) {
  const msg = String(message || '').trim();
  const fb = String(fallback || '操作失败，请稍后重试').trim();
  if (!msg) return fb;
  if (looksTechnical(msg)) return fb;
  return msg.slice(0, 30);
}

module.exports = {
  safeUserMessage,
};

