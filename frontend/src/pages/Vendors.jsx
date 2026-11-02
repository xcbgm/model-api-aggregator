import { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Tag,
  App,
  Popconfirm,
  Checkbox,
  Alert,
  Spin,
  Typography,
  Tooltip,
  Switch,
  Divider,
  Row,
  Col,
} from 'antd';
import {
  PlusOutlined,
  ApiOutlined,
  SyncOutlined,
  DeleteOutlined,
  EditOutlined,
  CloudDownloadOutlined,
  LinkOutlined,
  CheckCircleTwoTone,
} from '@ant-design/icons';
import { vendors as vendorsApi, groups as groupsApi, models as modelsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { designTokens } from '../theme';

const { Text } = Typography;

const protocolOptions = [
  { value: 'openai', label: 'OpenAI 兼容（/v1/chat/completions）' },
  { value: 'anthropic', label: 'Anthropic（/v1/messages）' },
  { value: 'gemini', label: 'Google Gemini（OpenAI 兼容端点）' },
  { value: 'custom', label: '自定义（按 OpenAI 格式转发）' },
];

export default function Vendors() {
  const { themeMode } = useAuth();
  const t = designTokens[themeMode];
  const { message, modal } = App.useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  // 拉取模型弹窗
  const [fetchOpen, setFetchOpen] = useState(false);
  const [fetchState, setFetchState] = useState({ vendor: null, loading: false, models: [], error: '', selected: [] });
  const [groups, setGroups] = useState([]);
  const [fetchForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setRows(await vendorsApi.list());
    } catch (e) {
      message.error(e?.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    groupsApi.list().then(setGroups).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ protocol: 'openai', status: 1 });
    setOpen(true);
  };

  // 输入厂商名时，若已存在同名厂商则自动套用其模板（调用地址/协议）
  const onNameChange = (e) => {
    const name = e.target.value.trim();
    if (!name) return;
    const exist = rows.find((r) => r.name === name && r.id !== editing?.id);
    if (exist && !form.getFieldValue('base_url')) {
      form.setFieldsValue({ base_url: exist.base_url, protocol: exist.protocol });
      message.info(`已套用「${exist.name}」的调用地址模板，请确认并填写密钥`);
    }
  };

  const openEdit = (r) => {
    setEditing(r);
    // 密钥默认隐藏：不回填任何密钥片段，留空表示不修改
    form.setFieldsValue({ ...r, api_key: undefined });
    setOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    try {
      if (editing) {
        await vendorsApi.update(editing.id, v);
        message.success('厂商已更新');
        setOpen(false);
        load();
      } else {
        const r = await vendorsApi.create(v);
        message.success('厂商已添加，正在自动拉取模型…');
        setOpen(false);
        load();
        // 添加成功后自动打开拉取模型弹窗
        setTimeout(() => {
          openFetch({ id: r.id, name: v.name });
        }, 400);
      }
    } catch (e) {
      message.error(e?.response?.data?.error || '保存失败');
    }
  };

  const testConn = async (r) => {
    const hide = message.loading('正在测试连通性…', 0);
    try {
      const res = await vendorsApi.test(r.id);
      hide();
      message.success(`连接正常，延迟 ${res.latency}ms，发现 ${res.count} 个模型`);
    } catch (e) {
      hide();
      message.error(e?.response?.data?.error || '连接失败');
    }
  };

  const openFetch = async (r) => {
    setFetchOpen(true);
    setFetchState({ vendor: r, loading: true, models: [], error: '', selected: [] });
    fetchForm.resetFields();
    fetchForm.setFieldsValue({ input_price: 0, output_price: 0 });
    try {
      const res = await vendorsApi.fetchModels({ vendor_id: r.id });
      setFetchState({
        vendor: r,
        loading: false,
        models: res.models || [],
        error: '',
        selected: (res.models || []).filter((m) => !m.added).map((m) => m.id),
      });
    } catch (e) {
      setFetchState({ vendor: r, loading: false, models: [], error: e?.response?.data?.error || e.message, selected: [] });
    }
  };

  const doImport = async () => {
    const v = await fetchForm.validateFields();
    if (!fetchState.selected.length) return message.warning('请至少选择一个模型');
    try {
      // 将所选模型转为携带能力信息的对象，供后端持久化默认值
      const modelsPayload = fetchState.models
        .filter((m) => fetchState.selected.includes(m.id))
        .map((m) => ({
          id: m.id,
          context_length: m.context_length || 0,
          max_output_tokens: m.max_output_tokens || 0,
          input_modes: m.input_modes || 'text',
          reasoning_enabled: m.reasoning_enabled || 0,
        }));
      const r = await modelsApi.batch({
        vendor_id: fetchState.vendor.id,
        models: modelsPayload,
        group_id: v.group_id || null,
        input_price: v.input_price,
        output_price: v.output_price,
      });
      message.success(`导入完成：新增 ${r.added} 个，跳过重复 ${r.skipped} 个`);
      setFetchOpen(false);
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || '导入失败');
    }
  };

  const remove = async (r) => {
    try {
      await vendorsApi.remove(r.id);
      message.success('已删除（该厂商下模型同步移除）');
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || '删除失败');
    }
  };

  const columns = [
    {
      title: '厂商',
      dataIndex: 'name',
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <Space size={6}>
            <span style={{ fontWeight: 600, color: t.text }}>{v}</span>
            <Tag color={r.status ? 'success' : 'default'} style={{ fontSize: 10.5, borderRadius: 20 }}>
              {r.status ? '启用' : '停用'}
            </Tag>
          </Space>
          <Text style={{ fontSize: 11.5, color: t.textTertiary }}>{r.remark || '—'}</Text>
        </Space>
      ),
    },
    {
      title: '接口地址',
      dataIndex: 'base_url',
      render: (v) => (
        <Space size={4}>
          <LinkOutlined style={{ color: t.textTertiary, fontSize: 12 }} />
          <span className="mono ellipsis" style={{ maxWidth: 260, display: 'inline-block', color: t.textSecondary }}>
            {v}
          </span>
        </Space>
      ),
    },
    { title: '协议', dataIndex: 'protocol', width: 110, render: (v) => <Tag style={{ fontSize: 11 }}>{v}</Tag> },
    {
      title: '密钥',
      dataIndex: 'api_key_set',
      width: 100,
      render: (v) =>
        v ? (
          <Tag color="success" style={{ borderRadius: 20, fontSize: 11 }}>已配置</Tag>
        ) : (
          <Tag color="error" style={{ borderRadius: 20, fontSize: 11 }}>未配置</Tag>
        ),
    },
    {
      title: '模型数',
      dataIndex: 'model_count',
      width: 90,
      align: 'right',
      render: (v) => <span style={{ fontWeight: 600, color: v ? t.primary : t.textTertiary }}>{v}</span>,
    },
    {
      title: '操作',
      width: 260,
      render: (_, r) => (
        <Space size={4} wrap>
          <Tooltip title="从上游拉取可用模型">
            <Button size="small" type="primary" ghost icon={<CloudDownloadOutlined />} onClick={() => openFetch(r)}>
              拉取模型
            </Button>
          </Tooltip>
          <Tooltip title="测试连通性">
            <Button size="small" icon={<ApiOutlined />} onClick={() => testConn(r)} />
          </Tooltip>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="确认删除该厂商？" description="其下所有模型将一并删除" onConfirm={() => remove(r)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
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
          <h1 className="page-title" style={{ color: t.text }}>厂商接入</h1>
          <p className="page-sub" style={{ color: t.textSecondary }}>
            添加上游 API 厂商，填写地址与密钥后可从上游自动拉取可用模型
          </p>
        </div>
        <Space>
          <Button icon={<SyncOutlined />} onClick={load}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加厂商</Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16, borderRadius: 12 }}
        message="接入说明"
        description={
          <span style={{ fontSize: 12.5 }}>
            地址填写厂商的 API 根地址（例如 <Text code>https://api.deepseek.com</Text>），系统会依次尝试
            <Text code>/v1/models</Text> 与 <Text code>/models</Text> 拉取模型清单。每个模型只能归属一个分组，分组倍率影响最终计费。
          </span>
        }
      />

      <Card bordered style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        open={open}
        title={editing ? '编辑厂商' : '添加厂商'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 12 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="厂商名称" rules={[{ required: true, message: '请输入厂商名称' }]}>
                <Input placeholder="如：DeepSeek / 通义千问 / 智谱" onChange={onNameChange} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="protocol" label="接口协议" rules={[{ required: true }]}>
                <Select options={protocolOptions} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="base_url"
            label="API 地址"
            rules={[
              { required: true, message: '请输入 API 地址' },
              { pattern: /^https?:\/\//i, message: '需以 http:// 或 https:// 开头' },
            ]}
            extra="如地址已以 /v1 结尾，系统会自动识别，不会重复拼接"
          >
            <Input placeholder="https://api.deepseek.com 或 https://api.deepseek.com/v1" />
          </Form.Item>
          <Form.Item
            name="api_key"
            label="API 密钥"
            rules={[{ required: !editing, message: '请输入密钥' }]}
            extra={editing ? '默认隐藏不显示；留空表示不修改，填写新值则覆盖' : '输入后即时掩码显示，保存后不再回显'}
          >
            <Input.Password placeholder={editing ? '留空不修改；填写则更新密钥' : 'sk-...'} autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="可选，例如：官方直连 / 代理中转" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={fetchOpen}
        title={
          <Space>
            <CloudDownloadOutlined style={{ color: t.primary }} />
            从上游拉取模型 · {fetchState.vendor?.name}
          </Space>
        }
        onCancel={() => setFetchOpen(false)}
        width={680}
        footer={[
          <Button key="c" onClick={() => setFetchOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" disabled={!fetchState.selected.length} onClick={doImport}>
            导入所选（{fetchState.selected.length}）
          </Button>,
        ]}
      >
        {fetchState.loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Spin tip="正在连接上游并拉取模型清单…" size="large" />
          </div>
        ) : fetchState.error ? (
          <Alert type="error" showIcon message="拉取失败" description={fetchState.error} />
        ) : (
          <>
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 12 }}
              message={`成功拉取 ${fetchState.models.length} 个模型，已勾选未导入的 ${fetchState.selected.length} 个`}
            />
            <div style={{ maxHeight: 300, overflowY: 'auto', border: `1px solid ${t.border}`, borderRadius: 10, padding: 12 }}>
              <Checkbox
                indeterminate={fetchState.selected.length > 0 && fetchState.selected.length < fetchState.models.filter((m) => !m.added).length}
                checked={fetchState.selected.length === fetchState.models.filter((m) => !m.added).length && fetchState.models.length > 0}
                onChange={(e) =>
                  setFetchState((s) => ({
                    ...s,
                    selected: e.target.checked ? s.models.filter((m) => !m.added).map((m) => m.id) : [],
                  }))
                }
                style={{ marginBottom: 10, fontWeight: 600 }}
              >
                全选 / 反选
              </Checkbox>
              <Checkbox.Group
                value={fetchState.selected}
                onChange={(v) => setFetchState((s) => ({ ...s, selected: v }))}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                {fetchState.models.map((m) => (
                  <Checkbox key={m.id} value={m.id} disabled={m.added}>
                    <span className="mono">{m.id}</span>
                    {m.context_length > 0 && (
                      <Tag style={{ marginLeft: 8, fontSize: 10.5, borderRadius: 20, background: 'transparent', border: `1px solid ${t.border}`, color: t.textTertiary }}>
                        {Math.round(m.context_length / 1000)}K ctx
                      </Tag>
                    )}
                    {m.max_output_tokens > 0 && (
                      <Tag style={{ marginLeft: 4, fontSize: 10.5, borderRadius: 20, background: 'transparent', border: `1px solid ${t.border}`, color: t.textTertiary }}>
                        max {m.max_output_tokens}
                      </Tag>
                    )}
                    {m.reasoning_enabled ? (
                      <Tag color="purple" style={{ marginLeft: 4, fontSize: 10.5, borderRadius: 20 }}>推理</Tag>
                    ) : null}
                    {m.added && (
                      <Tag color="success" style={{ marginLeft: 8, fontSize: 10.5, borderRadius: 20 }}>
                        <CheckCircleTwoTone twoToneColor={t.success} /> 已导入
                      </Tag>
                    )}
                    {m.owned_by && (
                      <Text style={{ marginLeft: 6, fontSize: 11, color: t.textTertiary }}>{m.owned_by}</Text>
                    )}
                  </Checkbox>
                ))}
              </Checkbox.Group>
            </div>

            <Divider style={{ margin: '16px 0 12px', fontSize: 12 }} orientation="left" plain>
              导入设置
            </Divider>
            <Form form={fetchForm} layout="inline" style={{ rowGap: 12 }}>
              <Form.Item name="group_id" label="归属分组" style={{ marginBottom: 8 }}>
                <Select
                  allowClear
                  placeholder="选择分组（一个模型仅属一组）"
                  style={{ width: 220 }}
                  options={groups.map((g) => ({ value: g.id, label: `${g.name}（×${g.ratio}）` }))}
                />
              </Form.Item>
              <Form.Item name="input_price" label="输入价/1K" style={{ marginBottom: 8 }}>
                <Input type="number" step="0.0001" style={{ width: 130 }} />
              </Form.Item>
              <Form.Item name="output_price" label="输出价/1K" style={{ marginBottom: 8 }}>
                <Input type="number" step="0.0001" style={{ width: 130 }} />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </div>
  );
}