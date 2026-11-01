import { useEffect, useState } from 'react';
import { Card, Table, Space, Tag, Typography, App, Switch, Button, Modal, Form, InputNumber, Select, Avatar } from 'antd';
import { TeamOutlined, EditOutlined, CrownOutlined } from '@ant-design/icons';
import { users as usersApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { designTokens } from '../theme';

const { Text } = Typography;

export default function Users() {
  const { themeMode, user: me } = useAuth();
  const t = designTokens[themeMode];
  const { message } = App.useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setRows(await usersApi.list());
    } catch (e) {
      message.error(e?.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    const v = await form.validateFields();
    try {
      await usersApi.update(editing.id, v);
      message.success('已更新');
      setEditing(null);
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || '更新失败');
    }
  };

  const columns = [
    {
      title: '用户',
      dataIndex: 'username',
      render: (v, r) => (
        <Space size={10}>
          <Avatar size={30} style={{ background: r.role === 'admin' ? 'linear-gradient(140deg,#B98B45,#8A6425)' : 'linear-gradient(140deg,#1E8F7F,#0E5A50)', fontFamily: 'var(--font-serif)' }}>
            {v?.[0]?.toUpperCase()}
          </Avatar>
          <Space direction="vertical" size={0}>
            <Space size={6}>
              <span style={{ fontWeight: 600, color: t.text }}>{v}</span>
              {r.role === 'admin' && <Tag color="gold" style={{ borderRadius: 20, fontSize: 10.5 }}><CrownOutlined /> 管理员</Tag>}
            </Space>
            <Text style={{ fontSize: 11.5, color: t.textTertiary }}>{r.email || '未填写邮箱'}</Text>
          </Space>
        </Space>
      ),
    },
    {
      title: '余额',
      dataIndex: 'balance',
      width: 130,
      align: 'right',
      render: (v) => <span className="serif" style={{ fontWeight: 700, color: t.primary }}>¥{Number(v).toFixed(2)}</span>,
    },
    {
      title: '调用次数',
      dataIndex: 'calls',
      width: 110,
      align: 'right',
      render: (v) => <span className="mono" style={{ color: t.textSecondary }}>{v}</span>,
    },
    { title: '注册时间', dataIndex: 'created_at', width: 170, render: (v) => <span style={{ fontSize: 12, color: t.textTertiary }}>{v}</span> },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v, r) => (
        <Switch
          size="small"
          checked={!!v}
          disabled={r.id === me?.id}
          onChange={async (ck) => {
            await usersApi.update(r.id, { status: ck ? 1 : 0 });
            message.success(ck ? '已启用' : '已禁用');
            load();
          }}
        />
      ),
    },
    {
      title: '操作',
      width: 110,
      render: (_, r) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            setEditing(r);
            form.setFieldsValue({ role: r.role, balance: r.balance });
          }}
        >
          调整
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ color: t.text }}>用户管理</h1>
          <p className="page-sub" style={{ color: t.textSecondary }}>
            管理平台注册用户、角色与账户余额
          </p>
        </div>
        <Space>
          <Tag icon={<TeamOutlined />} style={{ borderRadius: 20, padding: '4px 12px' }}>共 {rows.length} 位用户</Tag>
        </Space>
      </div>

      <Card bordered style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }} styles={{ body: { padding: 0 } }}>
        <Table rowKey="id" loading={loading} columns={columns} dataSource={rows} pagination={false} scroll={{ x: 900 }} />
      </Card>

      <Modal
        open={!!editing}
        title={`调整用户 · ${editing?.username || ''}`}
        onCancel={() => setEditing(null)}
        onOk={save}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 12 }}>
          <Form.Item name="role" label="角色">
            <Select
              options={[
                { value: 'user', label: '普通用户' },
                { value: 'admin', label: '管理员' },
              ]}
            />
          </Form.Item>
          <Form.Item name="balance" label="账户余额（元）" extra="可直接修改用户余额，用于人工调账">
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}