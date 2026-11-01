import { useState } from 'react';
import { Button, Card, Form, Input, Tabs, Typography, App, Segmented, Divider, Space, Tag } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { auth } from '../api';
import { useAuth } from '../context/AuthContext';
import { designTokens } from '../theme';

const { Title, Text } = Typography;

export default function Login() {
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const { login, themeMode, toggleTheme } = useAuth();
  const nav = useNavigate();
  const { message } = App.useApp();
  const t = designTokens[themeMode];
  const isDark = themeMode === 'dark';

  const onLogin = async (v) => {
    setLoading(true);
    try {
      const { token, user } = await auth.login(v);
      login(token, user);
      message.success(`欢迎回来，${user.username}`);
      nav('/dashboard', { replace: true });
    } catch (e) {
      message.error(e?.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async (v) => {
    setLoading(true);
    try {
      const { token, user } = await auth.register(v);
      login(token, user);
      message.success('注册成功，已自动登录');
      nav('/dashboard', { replace: true });
    } catch (e) {
      message.error(e?.response?.data?.error || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap" style={{ background: t.gradientBg }}>
      <div
        className="login-art"
        style={{
          background: isDark
            ? 'linear-gradient(160deg, #0F1A18 0%, #0A1211 55%, #101B18 100%)'
            : 'linear-gradient(160deg, #14201D 0%, #0E1815 55%, #17251F 100%)',
        }}
      >
        <svg className="rings" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="g1" cx="30%" cy="20%" r="70%">
              <stop offset="0%" stopColor="#34C7A8" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#34C7A8" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="g2" cx="80%" cy="85%" r="60%">
              <stop offset="0%" stopColor="#D8AE6B" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#D8AE6B" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="600" height="800" fill="url(#g1)" />
          <rect width="600" height="800" fill="url(#g2)" />
          {[180, 260, 340, 420, 500].map((r, i) => (
            <circle
              key={r}
              cx="150"
              cy="420"
              r={r}
              fill="none"
              stroke="rgba(52,199,168,0.16)"
              strokeWidth="1"
              strokeDasharray={i % 2 ? '3 9' : 'none'}
            />
          ))}
        </svg>

        <div style={{ position: 'relative' }}>
          <Space size={12}>
            <div
              className="seal"
              style={{
                width: 46,
                height: 46,
                background: 'linear-gradient(140deg,#1E8F7F,#0B4A42)',
                color: '#fff',
                fontSize: 21,
                border: '1px solid rgba(255,255,255,0.16)',
              }}
            >
              灵
            </div>
            <div>
              <div className="serif" style={{ color: '#fff', fontSize: 17, letterSpacing: '0.1em' }}>
                灵犀模型网关
              </div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: '0.22em' }}>
                LINGXI MODEL GATEWAY
              </div>
            </div>
          </Space>
        </div>

        <div style={{ position: 'relative', maxWidth: 520 }}>
          <div
            className="serif"
            style={{
              color: '#fff',
              fontSize: 40,
              lineHeight: 1.35,
              letterSpacing: '0.06em',
              fontWeight: 700,
            }}
          >
            一身<em style={{ color: '#5FD9BE', fontStyle: 'normal' }}>密钥</em>
            <br />
            通达百种模型
          </div>
          <p style={{ color: 'rgba(255,255,255,0.56)', fontSize: 14, lineHeight: 2, marginTop: 18 }}>
            聚合主流大模型厂商，统一接口、统一计费、统一监控。
            <br />
            为团队与个人提供稳定、透明、可审计的 AI 调用能力。
          </p>
          <Space size={[8, 8]} wrap style={{ marginTop: 12 }}>
            {['多厂商统一接入', '按量计费', '上游模型自动同步', 'OpenAI 兼容'].map((s) => (
              <Tag
                key={s}
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  color: 'rgba(255,255,255,0.78)',
                  borderRadius: 20,
                  padding: '2px 12px',
                }}
              >
                {s}
              </Tag>
            ))}
          </Space>
        </div>

        <div style={{ position: 'relative', color: 'rgba(255,255,255,0.28)', fontSize: 12, letterSpacing: '0.08em' }}>
          © 2026 灵犀模型网关 · 本平台仅作演示用途
        </div>
      </div>

      <div className="login-form-side">
        <div className="login-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
            <div>
              <Title level={3} className="serif" style={{ margin: 0, letterSpacing: '0.06em' }}>
                {tab === 'login' ? '登 录' : '注 册'}
              </Title>
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                {tab === 'login' ? '欢迎回到灵犀模型网关' : '创建账号，即刻接入全部模型'}
              </Text>
            </div>
            <Segmented
              size="small"
              value={themeMode}
              onChange={toggleTheme}
              options={[
                { value: 'light', icon: <SunOutlined /> },
                { value: 'dark', icon: <MoonOutlined /> },
              ]}
            />
          </div>

          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              {
                key: 'login',
                label: '账号登录',
                children: (
                  <Form layout="vertical" onFinish={onLogin} requiredMark={false} size="large">
                    <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                      <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
                    </Form.Item>
                    <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                      <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 44, fontWeight: 600 }}>
                      进入控制台
                    </Button>
                  </Form>
                ),
              },
              {
                key: 'register',
                label: '注册新账号',
                children: (
                  <Form layout="vertical" onFinish={onRegister} requiredMark={false} size="large">
                    <Form.Item name="username" rules={[{ required: true, min: 3, message: '用户名至少 3 个字符' }]}>
                      <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
                    </Form.Item>
                    <Form.Item name="email" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
                      <Input prefix={<MailOutlined />} placeholder="邮箱（选填）" />
                    </Form.Item>
                    <Form.Item name="password" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}>
                      <Input.Password prefix={<LockOutlined />} placeholder="密码（至少 6 位）" autoComplete="new-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 44, fontWeight: 600 }}>
                      注册并登录
                    </Button>
                  </Form>
                ),
              },
            ]}
          />

          <Divider plain style={{ fontSize: 12, opacity: 0.75 }}>
            演示账号
          </Divider>
          <Card size="small" style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(22,119,107,0.04)', border: 'none' }}>
            <Space direction="vertical" size={2} style={{ fontSize: 12.5 }}>
              <Text type="secondary">
                管理员：<Text code>admin</Text> / <Text code>admin123</Text>
              </Text>
              <Text type="secondary">
                普通用户：<Text code>demo</Text> / <Text code>demo123</Text>
              </Text>
            </Space>
          </Card>
        </div>
      </div>
    </div>
  );
}