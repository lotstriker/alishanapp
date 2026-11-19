'use strict';
const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const prefix = '__submission:';
const counterKey = prefix + 'issuedQualityCode';
const requestPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function entryReview(secret) {
  const sign = payload => createHmac('sha256', secret).update(payload).digest('hex');
  const tokenFor = value => {
    const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
    return payload + '.' + sign(payload);
  };
  function readToken(token) {
    if (typeof token !== 'string') return null;
    const [payload, signature, extra] = token.split('.');
    if (extra !== undefined || !/^[a-f0-9]{64}$/.test(signature || '')) return null;
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(payload), 'hex'))) return null;
    try { return JSON.parse(Buffer.from(payload, 'base64url')); } catch { return null; }
  }

  function prepare(domain, input, originalQuote) {
    if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid entry.' };
    const { Store, Calc } = domain;
    const quality = String(input.quality || '').trim().toUpperCase();
    const current = Store.getPrice(quality);
    const quote = readToken(originalQuote);
    const original = quote?.kind === 'draft-price' && quote.quality === quality ? quote.price : current;
    const price = quote?.kind === 'draft-price' ? original : current;
    const built = Calc.buildNewItem({ ...input, price }, {
      issuedCode: '1000000', items: Store.getItems(), priceOf: Store.getPrice, colorLabel: Store.colorDisplayName
    });
    if (!built.ok) return built;
    const { productType, cupSize, colors, sizeOption, isManualEntry } = built.item;
    const preview = { productType, quality, cupSize, colors, sizeOption, isManualEntry, ...Calc.itemTotals(built.item) };
    return {
      ok: true, preview, currentPrice: current,
      quote: tokenFor({ kind: 'draft-price', quality, price: original }),
      token: tokenFor({ kind: 'entry-review', inputHash: digest(input), price: preview.price })
    };
  }

  return async function submit(domain, method, args, issueQualityCode) {
    if (method === 'reviewEntry') return prepare(domain, args[0], args[1]);
    if (method === 'submissionStatus') {
      const [requestId] = args;
      if (!requestPattern.test(requestId ?? '')) return { ok: false, error: 'Invalid save request ID.' };
      const saved = await domain.DB.getSetting(prefix + requestId);
      return { ok: true, confirmed: Boolean(saved), result: saved?.result };
    }
    const [input, requestId, token] = args;
    if (!requestPattern.test(requestId ?? '')) return { ok: false, error: 'Missing save request ID.' };
    const key = prefix + requestId;
    const fingerprint = digest([method, input, token]);
    const saved = await domain.DB.getSetting(key);
    if (saved) return saved.fingerprint === fingerprint ? saved.result : { ok: false, error: 'This request ID was already used.' };

    let result;
    if (method === 'addItem') {
      const approved = readToken(token);
      if (approved?.kind !== 'entry-review' || approved.inputHash !== digest(input))
        return { ok: false, error: 'Entry changed. Review it again before submitting.' };
      const archived = await domain.DB.getArchive();
      const taken = new Set(domain.Store.getItems().map(item => String(item.code)));
      for (const record of archived) taken.add(String(record.item?.code));
      const previous = issueQualityCode ? null : await domain.DB.getSetting(counterKey);
      let next = issueQualityCode ? BigInt(await issueQualityCode()) : BigInt(previous ?? 999999) + 1n;
      while (taken.has(String(next))) next = issueQualityCode ? BigInt(await issueQualityCode()) : next + 1n;
      if (next > 9223372036854775807n) return { ok: false, error: 'No more Quality Codes are available.' };
      result = await domain.Store.addItem({ ...input, price: approved.price }, String(next));
      if (result.ok && !issueQualityCode) await domain.DB.setSetting(counterKey, String(next));
    } else {
      result = await domain.Store.addPayment(input);
    }
    if (result.ok) await domain.DB.setSetting(key, { fingerprint, result });
    return result;
  };
}
module.exports = { entryReview, prefix };
