import { useEffect, useState } from 'react';
import { Card, Table, Tag, Space, Typography, App, Select, Input, Button, Row, Col } from 'antd';
import { ReloadOutlined, SearchOutlined, FileTextOutlined } from '@ant-design/icons';
import { logs as logsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { designTokens } from '../theme';

const { Text } = Typography;

export default function Logs() {
  const { themeMode, isAdmin } = useAuth();
  const t = designTokens[themeMode];
  const { message } = App.useApp();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [status, setStatus] = useState('all');
  const [kw, setKw] = useState('');

  const load = async (p = page, s = size) => {
    setLoading(true);
    try {
      setData(await logsApi({ page: p, size: s }));
    } catch (e) {
      message.error(e?.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(page, size);
  }, [page, size]);

  const rows = (data.rows || []).filter((r) => {
    const okS = status === 'all' || (status === 'ok' ? r.status === 'success' : r.status !== 'success');
    const okK = !kw || (r.model_name || '').toLowerCase().includes(kw.toLowerCase());
    return okS && okK;
  });

  const columns = [
    { title: '#', dataIndex: 'id', width: 70, render: (v) => <span style={{ fontSize: 11.5, color: t.textTertiary }}>{v}</span> },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 160,
      render: (v) => <span style={{ fontSize: 12, color: t.textSecondary }}>{v}</span>,
    },
    ...(isAdmin
      ? [{ title: '用户', dataIndex: 'username', width: 100, render: (v) => <span style={{ fontSize: 12.5 }}>{v || '-'}</span> }]
      : []),
    {
      title: '模型',
      dataIndex: 'model_name',
      width: 170,
      render: (v) => <span className="mono" style={{ color: t.text }}>{v}</span>,
    },
    {
      title: 'Token（输入 / 输出）',
      width: 170,
      render: (_, r) => (
        <span className="mono" style={{ fontSize: 11.5, color: t.textSecondary }}>
          {r.prompt_tokens} / {r.completion_tokens}
          <Text style={{ marginLeft: 6, color: t.textTertiary }}>= {r.total_tokens}</Text>
        </span>
      ),
    },
    {
      title: '费用',
      dataIndex: 'cost',
      width: 110,
      align: 'right',
      render: (v) => <span className="mono" style={{ color: Number(v) > 0 ? t.gold : t.textTertiary }}>¥{Number(v).toFixed(6)}</span>,
    },
    {
      title: '耗时',
      dataIndex: 'latency_ms',
      width: 90,
      align: 'right',
      render: (v) => <span className="mono" style={{ fontSize: 11.5, color: t.textTertiary }}>{v}ms</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 200,
      render: (v, r) =>
        v === 'success' ? (
          <Tag color="success" style={{ borderRadius: 20, fontSize: 11 }}>成功</Tag>
        ) : (
          <Space size={4} style={{ maxWidth: 190 }}>
            <Tag color="error" style={{ borderRadius: 20, fontSize: 11 }}>失败</Tag>
            <Text ellipsis style={{ fontSize: 11, color: t.danger, maxWidth: 130 }} title={r.error_message}>
              {r.error_message}
            </Text>
          </Space>
        ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ color: t.text }}>调用日志</h1>
          <p className="page-sub" style={{ color: t.textSecondary }}>
            记录每一次模型调用的 Token 用量、费用与结果，支持排查失败原因
          </p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => load(page, size)}>刷新</Button>
      </div>

      <Card bordered style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: 14, borderBottom: `1px solid ${t.border}` }}>
          <Space wrap size={12}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: t.textTertiary }} />}
              placeholder="按模型名筛选"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              style={{ width: 210 }}
            />
            <Select
              value={status}
              onChange={setStatus}
              style={{ width: 140 }}
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'ok', label: '仅成功' },
                { value: 'fail', label: '仅失败' },
              ]}
            />
            <Text style={{ fontSize: 12.5, color: t.textTertiary, marginLeft: 'auto' }}>
              共 <b style={{ color: t.primary }}>{data.total}</b> 条记录
            </Text>
          </Space>
        </div>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1050 }}
          pagination={{
            current: page,
            pageSize: size,
            total: data.total,
            showSizeChanger: true,
            showTotal: (n) => <span style={{ fontSize: 12 }}>共 {n} 条</span>,
            onChange: (p, s) => { setPage(p); setSize(s); },
          }}
        />
      </Card>
    </div>
  );
}