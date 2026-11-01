import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  App,
  Popconfirm,
  Typography,
  Switch,
  Row,
  Col,
  Tooltip,
  Statistic,
  Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ThunderboltOutlined, RadarChartOutlined } from '@ant-design/icons';
import { models as modelsApi, vendors as vendorsApi, groups as groupsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { designTokens } from '../theme';

const { Text } = Typography;

export default function Models() {
  const { themeMode } = useAuth();
  const t = designTokens[themeMode];
  const { message } = App.useApp();
  const [rows, setRows] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [kw, setKw] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [probing, setProbing] = useState(false);
  const [sortField, setSortField] = useState('id');
  const [sortOrder, setSortOrder] = useState('descend');

  const load = async () => {
    setLoading(true);
    try {
      const [m, v, g] = await Promise.all([modelsApi.list(), vendorsApi.list(), groupsApi.list()]);
      setRows(m);
      setVendors(v);
      setGroups(g);
    } catch (e) {
      message.error(e?.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const okKw = !kw || (r.name + (r.display_name || '') + r.vendor_name).toLowerCase().includes(kw.toLowerCase());
        const okV = vendorFilter === 'all' || r.vendor_id === vendorFilter;
        return okKw && okV;
      }),
    [rows, kw, vendorFilter]
  );

  const stats = useMemo(() => {
    const priced = rows.filter((r) => r.fixed_price > 0 || r.input_price > 0 || r.output_price > 0);
    return {
      total: rows.length,
      online: rows.filter((r) => r.status).length,
      grouped: rows.filter((r) => r.group_id).length,
      priced: priced.length,
    };
  }, [rows]);

  const submit = async () => {
    const v = await form.validateFields();
    const payload = {
      ...v,
      input_modes: Array.isArray(v.input_modes) ? v.input_modes.join(',') : (v.input_modes || 'text'),
      reasoning_enabled: v.reasoning_enabled ? 1 : 0,
    };
    try {
      if (editing) await modelsApi.update(editing.id, payload);
      else await modelsApi.create(payload);
      message.success(editing ? '模型已更新' : '模型已添加');
      setOpen(false);
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || '保存失败');
    }
  };

  const remove = async (r) => {
    try {
      await modelsApi.remove(r.id);
      message.success('已删除');
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || '删除失败');
    }
  };

  const probeOne = async (r) => {
    const hide = message.loading(`正在探测 ${r.name}…`, 0);
    try {
      const res = await modelsApi.probe({ id: r.id });
      hide();
      const x = res[0];
      if (x?.online) message.success(`${r.name} 在线 · 延迟 ${x.latency_ms}ms · 首字 ${x.ttft_ms ?? '—'}ms`);
      else message.error(`${r.name} 不可用：${x?.error || '未知错误'}`);
      load();
    } catch (e) {
      hide();
      message.error(e?.response?.data?.error || '探测失败');
    }
  };

  const probeAll = async () => {
    setProbing(true);
    const hide = message.loading('正在批量探测在线模型（并发 5）…', 0);
    try {
      const res = await modelsApi.probeBatch();
      hide();
      message.success(`探测完成：${res.online}/${res.total} 个模型在线`);
      load();
    } catch (e) {
      hide();
      message.error(e?.response?.data?.error || '批量探测失败');
    } finally {
      setProbing(false);
    }
  };

  const columns = [
    {
      title: '模型',
      dataIndex: 'name',
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 600, color: t.text }}>{r.display_name || v}</span>
          <span className="mono" style={{ fontSize: 11, color: t.textTertiary }}>{v}</span>
        </Space>
      ),
    },
    { title: '厂商', dataIndex: 'vendor_name', width: 130, render: (v) => <Tag style={{ borderRadius: 20, fontSize: 11 }}>{v}</Tag> },
    {
      title: '分组',
      dataIndex: 'group_name',
      width: 150,
      render: (v, r) =>
        v ? (
          <Space size={4}>
            <Tag color="gold" style={{ borderRadius: 20, fontSize: 11, marginInlineEnd: 0 }}>{v}</Tag>
            <Text style={{ fontSize: 11, color: t.textTertiary }}>×{r.group_ratio}</Text>
          </Space>
        ) : (
          <Text style={{ fontSize: 12, color: t.textTertiary }}>未分组</Text>
        ),
    },
    {
      title: '输入价 /1K',
      dataIndex: 'input_price',
      width: 120,
      align: 'right',
      render: (v) => <span className="mono" style={{ color: t.primary }}>¥{Number(v).toFixed(4)}</span>,
    },
    {
      title: '输出价 /1K',
      dataIndex: 'output_price',
      width: 120,
      align: 'right',
      render: (v) => <span className="mono" style={{ color: t.gold }}>¥{Number(v).toFixed(4)}</span>,
    },
    {
      title: '按次价',
      dataIndex: 'fixed_price',
      width: 100,
      align: 'right',
      render: (v) => (v > 0 ? <span className="mono">¥{v}</span> : <Text style={{ fontSize: 12, color: t.textTertiary }}>—</Text>),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v, r) => (
        <Switch
          size="small"
          checked={!!v}
          onChange={async (ck) => {
            await modelsApi.update(r.id, { status: ck ? 1 : 0 });
            message.success(ck ? '已上线' : '已下线');
            load();
          }}
        />
      ),
    },
    {
      title: '在线',
      dataIndex: 'probe_online',
      width: 110,
      sorter: (a, b) => (a.probe_online ?? -1) - (b.probe_online ?? -1),
      render: (v, r) => {
        if (v === null || v === undefined)
          return <Tag style={{ borderRadius: 20, fontSize: 11, background: 'transparent', border: `1px dashed ${t.border}`, color: t.textTertiary }}>未探测</Tag>;
        return v ? (
          <Tag color="success" style={{ borderRadius: 20, fontSize: 11 }}>在线</Tag>
        ) : (
          <Tag color="error" style={{ borderRadius: 20, fontSize: 11 }}>离线</Tag>
        );
      },
    },
    {
      title: '延迟',
      dataIndex: 'probe_latency_ms',
      width: 90,
      align: 'right',
      sorter: (a, b) => (a.probe_latency_ms ?? 1e9) - (b.probe_latency_ms ?? 1e9),
      render: (v, r) =>
        v > 0 ? (
          <span className="mono" style={{ color: v < 800 ? t.success : v < 2000 ? t.gold : t.error || '#E5484D' }}>
            {v}ms
          </span>
        ) : (
          <Text style={{ fontSize: 12, color: t.textTertiary }}>—</Text>
        ),
    },
    {
      title: '首字',
      dataIndex: 'probe_ttft_ms',
      width: 90,
      align: 'right',
      sorter: (a, b) => (a.probe_ttft_ms ?? 1e9) - (b.probe_ttft_ms ?? 1e9),
      render: (v) =>
        v > 0 ? (
          <span className="mono" style={{ color: t.primary }}>{v}ms</span>
        ) : (
          <Text style={{ fontSize: 12, color: t.textTertiary }}>—</Text>
        ),
    },
    {
      title: '操作',
      width: 150,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="探测在线状态 / 延迟 / 首字">
            <Button size="small" icon={<RadarChartOutlined />} onClick={() => probeOne(r)} />
          </Tooltip>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); form.setFieldsValue({ ...r, input_modes: (r.input_modes || 'text').split(',').filter(Boolean) }); setOpen(true); }} />
          <Popconfirm title="确认删除该模型？" onConfirm={() => remove(r)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
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
          <h1 className="page-title" style={{ color: t.text }}>模型与定价</h1>
          <p className="page-sub" style={{ color: t.textSecondary }}>
            维护平台模型清单、定价与分组；价格单位为「元 / 1K tokens」
          </p>
        </div>
        <Space>
          <Button icon={<RadarChartOutlined />} loading={probing} onClick={probeAll}>
            批量探测
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ model_type: 'chat', input_price: 0, output_price: 0, fixed_price: 0, status: 1, input_modes: ['text'], reasoning_enabled: false, context_length: 0, max_output_tokens: 0 }); setOpen(true); }}
          >
            添加模型
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          { label: '模型总数', value: stats.total, color: t.primary, suffix: '个' },
          { label: '已上线', value: stats.online, color: t.success, suffix: '个' },
          { label: '已分组', value: stats.grouped, color: t.gold, suffix: '个' },
          { label: '已定价', value: stats.priced, color: themeMode === 'dark' ? '#7FA7FF' : '#3D6AE0', suffix: '个' },
        ].map((s) => (
          <Col xs={12} lg={6} key={s.label}>
            <Card bordered style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }} styles={{ body: { padding: 16 } }}>
              <Statistic
                title={<span style={{ fontSize: 12.5, color: t.textSecondary }}>{s.label}</span>}
                value={s.value}
                suffix={<span style={{ fontSize: 12 }}>{s.suffix}</span>}
                valueStyle={{ fontSize: 24, color: s.color, fontFamily: 'var(--font-serif)', fontWeight: 700 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card bordered style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: 14, borderBottom: `1px solid ${t.border}` }}>
          <Space wrap size={12}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: t.textTertiary }} />}
              placeholder="搜索模型名 / 厂商…"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              style={{ width: 240 }}
            />
            <Select
              value={vendorFilter}
              onChange={setVendorFilter}
              style={{ width: 160 }}
              options={[{ value: 'all', label: '全部厂商' }, ...vendors.map((v) => ({ value: v.id, label: v.name }))]}
            />
            <Text style={{ fontSize: 12.5, color: t.textTertiary }}>
              共 <b style={{ color: t.primary }}>{filtered.length}</b> 条
            </Text>
          </Space>
        </div>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1320 }}
          onChange={(p, f, s) => {
            if (s) {
              setSortField(s.field);
              setSortOrder(s.order);
            }
          }}
          sortDirections={['ascend', 'descend']}
        />
      </Card>

      <Modal
        open={open}
        title={
          <Space>
            <ThunderboltOutlined style={{ color: t.primary }} />
            {editing ? '编辑模型' : '添加模型'}
          </Space>
        }
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={620}
      >
        <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 12 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="vendor_id" label="所属厂商" rules={[{ required: true, message: '请选择厂商' }]}>
                <Select
                  placeholder="选择厂商"
                  disabled={!!editing}
                  options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name" label="模型 ID" rules={[{ required: true, message: '请输入模型 ID' }]}
                extra={editing ? '模型 ID 不可修改' : '需与上游一致，如 deepseek-chat'}>
                <Input placeholder="deepseek-chat" disabled={!!editing} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="display_name" label="展示名称">
                <Input placeholder="如：DeepSeek 对话模型" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="group_id" label="归属分组" extra="一个模型只能分配一个分组">
                <Select
                  allowClear
                  placeholder="不分组"
                  options={groups.map((g) => ({ value: g.id, label: `${g.name}（×${g.ratio}）` }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="input_price" label="输入价格（元 / 1K tokens）">
                <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="output_price" label="输出价格（元 / 1K tokens）">
                <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fixed_price" label="按次价格（元 / 次）" extra="大于 0 时优先按次计费">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="model_type" label="模型类型">
                <Select
                  options={[
                    { value: 'chat', label: '对话 / 推理' },
                    { value: 'embedding', label: '向量嵌入' },
                    { value: 'image', label: '图像生成' },
                    { value: 'audio', label: '语音' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="description" label="模型说明">
                <Input.TextArea rows={2} placeholder="可选，将展示在模型广场" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Divider style={{ margin: '4px 0 14px', fontSize: 12 }} orientation="left" plain>
                模型能力（从上游拉取时自动填充，可手动修改）
              </Divider>
            </Col>
            <Col span={8}>
              <Form.Item name="context_length" label="上下文长度" extra="tokens">
                <InputNumber min={0} step={1000} style={{ width: '100%' }} placeholder="如 128000" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="max_output_tokens" label="最大输出" extra="tokens">
                <InputNumber min={0} step={1000} style={{ width: '100%' }} placeholder="如 8192" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="input_modes" label="输入类型" extra="可多选">
                <Select
                  mode="multiple"
                  placeholder="选择输入类型"
                  options={[
                    { value: 'text', label: '文本' },
                    { value: 'image', label: '图片' },
                    { value: 'audio', label: '音频' },
                    { value: 'video', label: '视频' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="reasoning_enabled" label="推理强度" valuePropName="checked" extra="是否支持深度推理">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}