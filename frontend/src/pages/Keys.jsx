import { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Space, App, Popconfirm, Typography, Alert, Tag, Result } from 'antd';
import { PlusOutlined, DeleteOutlined, CopyOutlined, KeyOutlined, CheckCircleFilled } from '@ant-design/icons';
import { keys as keysApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { designTokens } from '../theme';

const { Text, Paragraph } = Typography;

export default function Keys() {
  const { themeMode } = useAuth();
  const t = designTokens[themeMode];
  const { message } = App.useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [created, setCreated] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await keysApi.list());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    const v = await form.validateFields();
    try {
      const r = await keysApi.create(v);
      setOpen(false);
      setCreated(r.key);
      form.resetFields();
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || '创建失败');
    }
  };

  const remove = async (r) => {
    await keysApi.remove(r.id);
    message.success('密钥已删除');
    load();
  };

  const copy = (v) => {
    navigator.clipboard?.writeText(v);
    message.success('已复制到剪贴板');
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (v) => (
        <Space size={6}>
          <KeyOutlined style={{ color: t.primary }} />
          <span style={{ fontWeight: 600, color: t.text }}>{v}</span>
        </Space>
      ),
    },
    {
      title: '密钥',
      dataIndex: 'key',
      render: (v) => (
        <Space size={6}>
          <span className="mono" style={{ color: t.textSecondary }}>{v}</span>
          <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copy(v)} />
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v) => <Tag color={v ? 'success' : 'default'} style={{ borderRadius: 20 }}>{v ? '启用' : '停用'}</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', width: 180, render: (v) => <span style={{ fontSize: 12, color: t.textTertiary }}>{v}</span> },
    {
      title: '操作',
      width: 90,
      render: (_, r) => (
        <Popconfirm title="删除后使用该密钥的调用将立即失效" onConfirm={() => remove(r)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ color: t.text }}>API 密钥</h1>
          <p className="page-sub" style={{ color: t.textSecondary }}>
            使用密钥调用平台统一接口，所有请求按所用模型定价从余额扣费
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>
          创建密钥
        </Button>
      </div>

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16, borderRadius: 12 }}
        message="请妥善保管密钥"
        description={
          <Text style={{ fontSize: 12.5 }}>
            密钥仅在创建时完整显示一次。调用时置于请求头：<Text code>Authorization: Bearer sk-xxxx</Text>
          </Text>
        }
      />

      <Card bordered style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }} styles={{ body: { padding: 0 } }}>
        <Table rowKey="id" loading={loading} columns={columns} dataSource={rows} pagination={false} scroll={{ x: 800 }} />
      </Card>

      <Modal
        open={open}
        title="创建 API 密钥"
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 12 }}>
          <Form.Item name="name" label="密钥名称" rules={[{ required: true, message: '请输入名称' }]} extra="便于区分用途，如「生产环境」「个人测试」">
            <Input placeholder="生产环境" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={!!created} footer={null} onCancel={() => setCreated(null)} width={520} closable>
        <Result
          status="success"
          icon={<CheckCircleFilled style={{ color: t.success }} />}
          title="密钥创建成功"
          subTitle="请立即复制并妥善保存，关闭后将无法再次查看完整密钥"
          extra={[
            <Paragraph key="k" copyable={{ text: created || '', tooltips: ['复制', '已复制'] }} className="mono"
              style={{ background: themeMode === 'dark' ? '#0A1211' : '#F6F8F5', padding: '10px 14px', borderRadius: 10, border: `1px solid ${t.border}`, textAlign: 'center' }}>
              {created}
            </Paragraph>,
            <Button key="ok" type="primary" onClick={() => setCreated(null)}>我已保存</Button>,
          ]}
        />
      </Modal>
    </div>
  );
}