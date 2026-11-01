import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Space, Typography, App, Row, Col, Descriptions, Tag, Divider, Segmented, Avatar } from 'antd';
import { LockOutlined, SunOutlined, MoonOutlined, SaveOutlined } from '@ant-design/icons';
import { auth as authApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { designTokens } from '../theme';

const { Text } = Typography;

export default function Settings() {
  const { themeMode, toggleTheme, user } = useAuth();
  const t = designTokens[themeMode];
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    form.resetFields();
  }, [user?.id]);

  const submit = async (v) => {
    setLoading(true);
    try {
      await authApi.changePassword(v);
      message.success('密码已修改，请牢记新密码');
      form.resetFields();
    } catch (e) {
      message.error(e?.response?.data?.error || '修改失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ color: t.text }}>账号设置</h1>
          <p className="page-sub" style={{ color: t.textSecondary }}>管理个人资料、登录密码与界面主题</p>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={9}>
          <Card bordered style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }}>
            <Space size={14} align="center">
              <Avatar
                size={54}
                style={{
                  background: user?.role === 'admin' ? 'linear-gradient(140deg,#B98B45,#8A6425)' : 'linear-gradient(140deg,#1E8F7F,#0E5A50)',
                  fontFamily: 'var(--font-serif)',
                  fontSize: 22,
                }}
              >
                {user?.username?.[0]?.toUpperCase()}
              </Avatar>
              <div>
                <div className="serif" style={{ fontSize: 19, fontWeight: 700, color: t.text }}>{user?.username}</div>
                <Tag color={user?.role === 'admin' ? 'gold' : 'default'} style={{ borderRadius: 20, marginTop: 4 }}>
                  {user?.role === 'admin' ? '平台管理员' : '普通用户'}
                </Tag>
              </div>
            </Space>

            <Divider style={{ margin: '18px 0' }} />

            <Descriptions
              column={1}
              size="small"
              colon={false}
              labelStyle={{ color: t.textTertiary, fontSize: 12.5 }}
              contentStyle={{ color: t.text, fontSize: 13 }}
            >
              <Descriptions.Item label="邮箱">{user?.email || '未填写'}</Descriptions.Item>
              <Descriptions.Item label="账户余额">
                <span className="serif" style={{ fontWeight: 700, color: t.primary, fontSize: 16 }}>
                  ¥{Number(user?.balance || 0).toFixed(2)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="用户 ID">{user?.id}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={15}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card
              bordered
              style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }}
              title={<span className="serif">修改登录密码</span>}
            >
              <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} style={{ maxWidth: 420 }}>
                <Form.Item name="oldPassword" label="原密码" rules={[{ required: true, message: '请输入原密码' }]}>
                  <Input.Password prefix={<LockOutlined />} placeholder="当前登录密码" autoComplete="current-password" />
                </Form.Item>
                <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6, message: '新密码至少 6 位' }]}>
                  <Input.Password prefix={<LockOutlined />} placeholder="至少 6 位" autoComplete="new-password" />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
                  保存修改
                </Button>
              </Form>
            </Card>

            <Card
              bordered
              style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }}
              title={<span className="serif">界面主题</span>}
            >
              <Space direction="vertical" size={12}>
                <Text style={{ fontSize: 13, color: t.textSecondary }}>
                  提供浅色与深色两套主题，可随时切换，选择会保存在本地。
                </Text>
                <Segmented
                  value={themeMode}
                  onChange={toggleTheme}
                  size="large"
                  options={[
                    { value: 'light', label: <Space><SunOutlined />浅色</Space> },
                    { value: 'dark', label: <Space><MoonOutlined />深色</Space> },
                  ]}
                />
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
}