/**
 * SMTP 邮件发送（零第三方依赖，基于 node:net/tls）
 * 支持 SSL(465) 与 STARTTLS(587)。
 */
const net = require('net');
const tls = require('tls');
const { getSetting } = require('./settings');

function encodeQP(s) {
  return Buffer.from(s, 'utf8')
    .toString('binary')
    .replace(/([^\x20-\x7E])/g, (c) => '=' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
}

function subjectHeader(subject) {
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

class SmtpClient {
  constructor({ host, port, secure, user, pass, timeout = 20000 }) {
    this.host = host;
    this.port = port;
    this.secure = secure;
    this.user = user;
    this.pass = pass;
    this.timeout = timeout;
    this.sock = null;
    this.buf = '';
  }

  connect() {
    return new Promise((resolve, reject) => {
      const onSecure = this.secure;
      const opts = { host: this.host, port: this.port, rejectUnauthorized: false, timeout: this.timeout };
      this.sock = onSecure ? tls.connect(opts) : net.connect(opts);
      const timer = setTimeout(() => reject(new Error('SMTP 连接超时')), this.timeout);
      this.sock.once(onSecure ? 'secureConnect' : 'connect', () => {
        clearTimeout(timer);
        resolve();
      });
      this.sock.once('error', (e) => { clearTimeout(timer); reject(e); });
      this.sock.setTimeout(this.timeout, () => { clearTimeout(timer); this.sock.destroy(); reject(new Error('SMTP 超时')); });
    });
  }

  readLine() {
    return new Promise((resolve, reject) => {
      const check = () => {
        const idx = this.buf.indexOf('\r\n');
        if (idx >= 0) {
          const line = this.buf.slice(0, idx);
          this.buf = this.buf.slice(idx + 2);
          resolve(line);
          return true;
        }
        return false;
      };
      if (check()) return;
      const onData = (d) => {
        this.buf += d.toString('utf8');
        if (check()) this.sock.removeListener('data', onData);
      };
      this.sock.on('data', onData);
      this.sock.once('error', reject);
    });
  }

  async cmd(str) {
    this.sock.write(str + '\r\n');
    const line = await this.readLine();
    const code = parseInt(line.slice(0, 3), 10);
    // 多行响应（250-xxx）
    let full = line;
    if (line[3] === '-') {
      for (;;) {
        const next = await this.readLine();
        full += '\n' + next;
        if (next[3] === ' ') break;
      }
    }
    return { code, text: full };
  }

  async send({ from, to, subject, html, text }) {
    await this.connect();
    await this.cmd(null); // 读取欢迎语
    await this.cmd(`EHLO ${this.host}`);
    if (!this.secure) {
      const r = await this.cmd('STARTTLS');
      if (r.code === 220) {
        this.sock = await new Promise((resolve, reject) => {
          const s = tls.connect({ socket: this.sock, rejectUnauthorized: false }, () => resolve(s));
          s.once('error', reject);
        });
        this.buf = '';
        await this.cmd(`EHLO ${this.host}`);
      }
    }
    if (this.user) {
      await this.cmd('AUTH LOGIN');
      await this.cmd(Buffer.from(this.user, 'utf8').toString('base64'));
      const r = await this.cmd(Buffer.from(this.pass, 'utf8').toString('base64'));
      if (r.code !== 235) throw new Error('SMTP 认证失败: ' + r.text);
    }
    await this.cmd(`MAIL FROM:<${from}>`);
    await this.cmd(`RCPT TO:<${to}>`);
    await this.cmd('DATA');
    const boundaries = '----=_NextPart_' + cryptoRandom();
    const headers = [
      `From: ${subjectHeaderName(from)} <${from}>`,
      `To: <${to}>`,
      `Subject: ${subjectHeader(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundaries}"`,
      '',
    ].join('\r\n');
    const parts = [];
    if (text) {
      parts.push(
        `--${boundaries}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Wrap(text)}\r\n`
      );
    }
    if (html) {
      parts.push(
        `--${boundaries}\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Wrap(html)}\r\n`
      );
    }
    parts.push(`--${boundaries}--\r\n`);
    const body = headers + parts.join('');
    const r = await this.cmd(body + '\r\n.');
    if (r.code !== 250) throw new Error('SMTP 发送失败: ' + r.text);
    await this.cmd('QUIT');
    try { this.sock.destroy(); } catch (e) { /* ignore */ }
  }
}

function subjectHeaderName(from) {
  const name = getSetting('smtp_from_name') || '灵犀模型网关';
  return subjectHeader(name);
}

function base64Wrap(s) {
  return Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
}

function cryptoRandom() {
  return require('crypto').randomBytes(8).toString('hex');
}

/** 发送邮件（使用后台配置的 SMTP） */
async function sendMail({ to, subject, html, text }) {
  const host = getSetting('smtp_host');
  const port = parseInt(getSetting('smtp_port') || '465', 10);
  const secureRaw = getSetting('smtp_secure') || 'ssl';
  const secure = secureRaw === 'ssl' || port === 465;
  const user = getSetting('smtp_user');
  const pass = getSetting('smtp_pass');
  const from = getSetting('smtp_from') || user;
  if (!host) throw new Error('未配置 SMTP 服务器');
  if (!from) throw new Error('未配置发件人地址');
  const client = new SmtpClient({ host, port, secure, user, pass });
  await client.send({ from, to, subject, html, text });
}

module.exports = { sendMail };
