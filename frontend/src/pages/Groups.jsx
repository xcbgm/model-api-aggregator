import { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Space, Tag, App, Popconfirm, Typography, Tooltip, Alert, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PartitionOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { groups as groupsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { designTokens } from '../theme';

const { Text } = Typography;

export default function Groups() {
  const { themeMode } = useAuth();
  const t = designTokens[themeMode];
  const { message } = App.useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setRows(await groupsApi.list());
    } catch (e) {
      message.error(e?.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    const v = await form.validateFields();
    try {
      if (editing) await groupsApi.update(editing.id, v);
      else await groupsApi.create(v);
      message.success(editing ? '分组已更新' : '分组已创建');
      setOpen(false);
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || '保存失败');
    }
  };

  const remove = async (r) => {
    try {
      await groupsApi.remove(r.id);
      message.success('已删除，组内模型变为未分组');
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || '删除失败');
    }
  };

  const columns = [
    {
      title: '分组名称',
      dataIndex: 'name',
      render: (v) => (
        <Space size={6}>
          <PartitionOutlined style={{ color: t.primary }} />
          <span style={{ fontWeight: 600, color: t.text }}>{v}</span>
        </Space>
      ),
    },
    {
      title: '说明',
      dataIndex: 'description',
      render: (v) => <Text style={{ fontSize: 12.5, color: t.textSecondary }}>{v || '—'}</Text>,
    },
    {
      title: (
        <Space size={4}>
          计费倍率
          <Tooltip title="最终费用 = 模型单价 × 分组倍率 × 用量">
            <QuestionCircleOutlined style={{ fontSize: 12, color: t.textTertiary }} />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'ratio',
      width: 140,
      render: (v) => (
        <Tag color={v > 1 ? 'volcano' : v < 1 ? 'green' : 'default'} style={{ borderRadius: 20, fontWeight: 600 }}>
          ×{v}
        </Tag>
      ),
    },
    {
      title: '模型数',
      dataIndex: 'model_count',
      width: 100,
      align: 'right',
      render: (v) => <span style={{ fontWeight: 600, color: v ? t.primary : t.textTertiary }}>{v}</span>,
    },
    { title: '创建时间', dataIndex: 'created_at', width: 170, render: (v) => <span style={{ fontSize: 12, color: t.textTertiary }}>{v}</span> },
    {
      title: '操作',
      width: 120,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); form.setFieldsValue(r); setOpen(true); }} />
          <Popconfirm title="确认删除该分组？" onConfirm={() => remove(r)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ color: t.text }}>模型分组</h1>
          <p className="page-sub" style={{ color: t.textSecondary }}>
            用于对模型归类并设置统一计费倍率；分组名称全局唯一，一个模型只能归属一个分组
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ ratio: 1 }); setOpen(true); }}>
          新建分组
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {rows.map((g) => (
          <Col xs={24} sm={12} lg={6} key={g.id}>
            <Card
              bordered
              className="stat-card"
              style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }}
              styles={{ body: { padding: 18 } }}
            >
              <div className="stat-glow" style={{ background: t.primary }} />
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                  <span className="serif" style={{ fontSize: 16, fontWeight: 700, color: t.text }}>{g.name}</span>
                  <Tag color={g.ratio > 1 ? 'volcano' : g.ratio < 1 ? 'green' : 'default'} style={{ borderRadius: 20, marginInlineEnd: 0 }}>
                    ×{g.ratio}
                  </Tag>
                </Space>
                <Text style={{ fontSize: 12, color: t.textTertiary, display: 'block', minHeight: 18 }} className="ellipsis">
                  {g.description || '暂无说明'}
                </Text>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span className="serif" style={{ fontSize: 24, fontWeight: 700, color: t.primary }}>{g.model_count}</span>
                  <span style={{ fontSize: 11.5, color: t.textTertiary }}>个模型</span>
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Card bordered style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }} styles={{ body: { padding: 0 } }}>
        <Table rowKey="id" loading={loading} columns={columns} dataSource={rows} pagination={false} scroll={{ x: 900 }} />
      </Card>

      <Modal
        open={open}
        title={editing ? '编辑分组' : '新建分组'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 12 }}>
          <Form.Item name="name" label="分组名称" rules={[{ required: true, message: '请输入分组名称' }]}
            extra="分组名称需全局唯一，重复会被拒绝">
            <Input placeholder="如：旗舰模型 / 高性价比 / 免费体验" />
          </Form.Item>
          <Form.Item name="description" label="分组说明">
            <Input.TextArea rows={2} placeholder="可选，用于在模型广场展示分组定位" />
          </Form.Item>
          <Form.Item name="ratio" label="计费倍率" rules={[{ required: true, message: '请输入倍率' }]}
            extra="1 表示标准价；0.8 表示八折；1.5 表示溢价 50%">
            <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}