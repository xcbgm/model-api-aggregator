/**
 * 支付网关：易支付(epay/彩虹易支付) + 自定义网关，管理员后台配置、可开关。
 * 所有签名用商户密钥；回调校验签名后给用户加余额。
 */
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { getSetting } = require('./settings');

function md5(s) {
  return crypto.createHash('md5').update(s, 'utf8').digest('hex');
}

function buildQuery(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== '' && params[k] !== null && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join('&');
}

/** 创建支付订单，返回收银台跳转 URL（微信/支付宝扫码） */
async function createPayment({ amount, orderNo, type = 'alipay' }) {
  const enabled = getSetting('pay_enabled') === '1';
  if (!enabled) throw new Error('支付功能未开启，请管理员在后台配置');

  const provider = getSetting('pay_provider') || 'epay';
  const merchantId = getSetting('pay_merchant_id') || getSetting('pay_app_id');
  const secret = getSetting('pay_mch_secret') || getSetting('pay_app_secret');
  const apiUrl = getSetting('pay_api_url');
  const notifyUrl = getSetting('pay_notify_url') || '';
  const returnUrl = getSetting('pay_return_url') || '';

  if (!merchantId || !secret) throw new Error('未配置支付商户信息');
  if (provider === 'epay' && !apiUrl) throw new Error('未配置易支付网关地址');
  if (provider === 'custom' && !apiUrl) throw new Error('未配置自定义网关地址');

  const params = {
    pid: merchantId,
    type,
    out_trade_no: orderNo,
    notify_url: notifyUrl,
    return_url: returnUrl,
    name: '账户充值',
    money: Number(amount).toFixed(2),
  };

  const signStr = buildQuery(params) + secret;
  params.sign = md5(signStr);
  params.sign_type = 'MD5';

  const target = apiUrl.includes('?')
    ? apiUrl + '&' + buildQuery(params)
    : apiUrl + '?' + buildQuery(params);

  // 易支付返回跳转 URL（JSON 或 302）
  const res = await fetchText(target);
  let jumpUrl = null;
  try {
    const j = JSON.parse(res.text);
    jumpUrl = j.url || j.pay_url || null;
    if (!jumpUrl && j.code === 1 && j.data) jumpUrl = j.data;
  } catch (e) {
    // 可能是 302 重定向 URL
    const loc = res.headers && res.headers.location;
    if (loc) jumpUrl = loc;
  }
  if (!jumpUrl) throw new Error('支付网关未返回跳转链接: ' + (res.text || '').slice(0, 200));
  return { url: jumpUrl, orderNo };
}

/** 校验支付回调签名，返回 { ok, orderNo, amount } */
function verifyNotify(query) {
  const provider = getSetting('pay_provider') || 'epay';
  const secret = getSetting('pay_mch_secret') || getSetting('pay_app_secret');
  const merchantId = getSetting('pay_merchant_id') || getSetting('pay_app_id');
  if (!secret) return { ok: false, reason: '未配置支付密钥' };

  const sign = query.sign;
  if (!sign) return { ok: false, reason: '缺少签名' };

  const params = {};
  for (const k of Object.keys(query)) {
    if (k === 'sign' || k === 'sign_type') continue;
    params[k] = query[k];
  }
  // 易支付要求 pid 参与签名
  if (provider === 'epay') params.pid = params.pid || merchantId;

  const signStr = buildQuery(params) + secret;
  const expected = md5(signStr);
  if (expected !== String(sign).toLowerCase()) return { ok: false, reason: '签名校验失败' };

  const orderNo = params.out_trade_no;
  const amount = parseFloat(params.money || params.amount || '0');
  if (!orderNo) return { ok: false, reason: '缺少订单号' };
  return { ok: true, orderNo, amount };
}

function fetchText(urlStr) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(new Error('地址错误')); }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(
      { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, timeout: 20000, rejectUnauthorized: false },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve({ status: res.statusCode, headers: res.headers, text: '', redirect: res.headers.location });
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('支付网关超时')));
    req.on('error', reject);
  });
}

module.exports = { createPayment, verifyNotify };
