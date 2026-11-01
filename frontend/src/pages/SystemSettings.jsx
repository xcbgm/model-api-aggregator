import { useEffect, useState } from 'react';
import {
  Card, Tabs, Form, Input, InputNumber, Select, Switch, Button, Space, Divider,
  Typography, Alert, Row, Col, App, Tooltip,
} from 'antd';
import { SaveOutlined, MailOutlined, PayCircleOutlined, ApiOutlined } from '@ant-design/icons';
import { settings as settingsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { designTokens } from '../theme';

const { Text } = Typography;

export default function SystemSettings() {
  const { themeMode } = useAuth();
  const t = designTokens[themeMode];
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [data, setData] = useState({});
  const [form] = Form.useForm();
  const [testForm] = Form.useForm();

  useEffect(() => {
    (async () => {
      try {
        const s = await settingsApi.get();
        setData(s);
        form.setFieldsValue(s);
      } catch (e) {
        message.error('加载设置失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const r = await settingsApi.save(v);
      message.success('设置已保存');
      setData((d) => ({ ...d, ...v, email_enabled: r.email_enabled }));
    } catch (e) {
      message.error(e?.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const testEmail = async () => {
    const { to } = await testForm.validateFields();
    setTesting(true);
    const hide = message.loading('正在发送测试邮件…', 0);
    try {
      const r = await settingsApi.testEmail(to);
      hide();
      message.success(r.message || '测试邮件已发送');
    } catch (e) {
      hide();
      message.error(e?.response?.data?.error || '发送失败');
    } finally {
      setTesting(false);
    }
  };

  const smtpTab = (
    <Form form={form} layout="vertical" requiredMark={false} disabled={loading}>
      <Alert
        type={data.email_enabled ? 'success' : 'info'}
        showIcon
        style={{ marginBottom: 16, borderRadius: 12 }}
        message={data.email_enabled ? '邮箱验证码已开启' : '邮箱验证码未开启'}
        description="开启后，用户注册时需填写邮箱验证码。请先配置 SMTP 并保存，再开启开关。"
      />
      <Form.Item name="smtp_enabled" label="启用邮箱验证码" valuePropName="checked">
        <Switch checkedChildren="开启" unCheckedChildren="关闭" />
      </Form.Item>
      <Divider plain>SMTP 服务器</Divider>
      <Row gutter={12}>
        <Col span={14}>
          <Form.Item name="smtp_host" label="SMTP 服务器地址" rules={[{ pattern: /^[a-z0-9.-]+$/i, message: '请输入正确的服务器地址' }]}>
            <Input placeholder="如 smtp.qq.com / smtp.163.com / smtp.exmail.qq.com" />
          </Form.Item>
        </Col>
        <Col span={5}>
          <Form.Item name="smtp_port" label="端口">
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={5}>
          <Form.Item name="smtp_secure" label="加密方式">
            <Select options={[{ value: 'ssl', label: 'SSL (465)' }, { value: 'starttls', label: 'STARTTLS (587)' }, { value: 'none', label: '不加密 (25)' }]} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="smtp_user" label="SMTP 账号">
            <Input placeholder="发件邮箱账号" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="smtp_pass" label="SMTP 密码 / 授权码" extra="QQ/163 邮箱请填写「授权码」而非登录密码">
            <Input.Password placeholder="授权码" autoComplete="off" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="smtp_from" label="发件人地址" extra="留空则使用 SMTP 账号">
            <Input placeholder="noreply@example.com" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="smtp_from_name" label="发件人名称">
            <Input placeholder="灵犀模型网关" />
          </Form.Item>
        </Col>
      </Row>
      <Divider plain>发送测试</Divider>
      <Form form={testForm} layout="inline" style={{ rowGap: 12 }}>
        <Form.Item name="to" rules={[{ required: true, message: '请输入测试邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}>
          <Input placeholder="输入测试收件邮箱" style={{ width: 280 }} />
        </Form.Item>
        <Form.Item>
          <Button icon={<MailOutlined />} loading={testing} onClick={testEmail}>发送测试邮件</Button>
        </Form.Item>
      </Form>
      <Text style={{ fontSize: 12, color: t.textTertiary, display: 'block', marginTop: 8 }}>
        提示：发送测试邮件前请先保存上方 SMTP 配置。
      </Text>
    </Form>
  );

  const payTab = (
    <Form form={form} layout="vertical" requiredMark={false} disabled={loading}>
      <Alert
        type={data.pay_enabled === '1' ? 'success' : 'info'}
        showIcon
        style={{ marginBottom: 16, borderRadius: 12 }}
        message={data.pay_enabled === '1' ? '在线支付已开启' : '在线支付未开启'}
        description="支持「易支付/彩虹易支付」聚合网关与「自定义网关」。配置商户信息后，用户可在充值页扫码付款，支付成功自动到账。"
      />
      <Form.Item name="pay_enabled" label="启用在线支付" valuePropName="checked">
        <Switch checkedChildren="开启" unCheckedChildren="关闭" />
      </Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name="pay_provider" label="支付网关类型">
            <Select
              options={[
                { value: 'epay', label: '易支付 / 彩虹易支付（聚合）' },
                { value: 'custom', label: '自定义网关（MD5 签名）' },
              ]}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="pay_api_url" label="网关 API 地址" extra="易支付通常为 https://xxx.com/submit.php">
            <Input placeholder="https://pay.example.com/submit.php" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="pay_merchant_id" label="商户 ID（pid）">
            <Input placeholder="易支付商户号" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="pay_mch_secret" label="商户密钥（key/secret）" extra="用于 MD5 签名，请妥善保管">
            <Input.Password placeholder="商户密钥" autoComplete="off" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="pay_notify_url" label="异步通知地址（notify_url）" extra="支付成功后网关回调此地址，如 https://你的域名/api/pay/notify">
            <Input placeholder="https://your-domain/api/pay/notify" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="pay_return_url" label="同步跳转地址（return_url）" extra="支付完成后浏览器跳回的页面">
            <Input placeholder="https://your-domain/billing" />
          </Form.Item>
        </Col>
      </Row>
      <Alert
        type="warning"
        showIcon
        style={{ borderRadius: 12 }}
        message="接入提示"
        description={
          <span style={{ fontSize: 12.5 }}>
            <b>易支付</b>：个人可注册，但需选择正规服务商，注意资金安全。<br />
            <b>自定义网关</b>：需对方支持 MD5 签名（sign=md5(参数排序拼接+密钥)），回调参数含 out_trade_no、money、sign。<br />
            请确保 notify_url 为公网可访问的 HTTPS 地址，否则收不到回调、无法自动到账。
          </span>
        }
      />
    </Form>
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ color: t.text }}>系统设置</h1>
          <p className="page-sub" style={{ color: t.textSecondary }}>
            配置邮箱验证码（SMTP）与在线支付网关；敏感信息加密存储
          </p>
        </div>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>
          保存设置
        </Button>
      </div>

      <Card bordered style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }}>
        <Tabs
          defaultActiveKey="smtp"
          items={[
            { key: 'smtp', label: <Space><MailOutlined />邮箱验证码（SMTP）</Space>, children: smtpTab },
            { key: 'pay', label: <Space><PayCircleOutlined />在线支付</Space>, children: payTab },
          ]}
        />
      </Card>
    </div>
  );
}
