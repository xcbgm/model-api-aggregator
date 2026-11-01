import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Spin, Empty, Table, Tag, Progress, Space, Typography, Button, Skeleton } from 'antd';
import {
  ApiOutlined,
  ThunderboltOutlined,
  WalletOutlined,
  WarningOutlined,
  RiseOutlined,
  ReloadOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { dashboard as fetchDashboard } from '../api';
import { useAuth } from '../context/AuthContext';
import { designTokens } from '../theme';

const { Text, Title } = Typography;

const fmtNum = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e8) return (v / 1e8).toFixed(2) + ' 亿';
  if (v >= 1e4) return (v / 1e4).toFixed(2) + ' 万';
  return v.toLocaleString('zh-CN');
};

function StatCard({ label, value, suffix, foot, icon, tone = 'primary', themeMode }) {
  const t = designTokens[themeMode];
  const color = tone === 'gold' ? t.gold : tone === 'danger' ? t.danger : t.primary;
  return (
    <Card className="stat-card" bordered style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }}>
      <div className="stat-glow" style={{ background: color }} />
      <div className="stat-label" style={{ color: t.textSecondary }}>
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div className="stat-value" style={{ color: t.text }}>
        {value}
        {suffix && <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 6, color: t.textTertiary }}>{suffix}</span>}
      </div>
      {foot && <div className="stat-foot" style={{ color: t.textTertiary }}>{foot}</div>}
    </Card>
  );
}

export default function Dashboard() {
  const { themeMode, user, isAdmin } = useAuth();
  const t = designTokens[themeMode];
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setData(await fetchDashboard());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) {
    return (
      <div>
        <Skeleton active paragraph={{ rows: 2 }} />
        <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
          {[1, 2, 3, 4].map((i) => (
            <Col xs={24} sm={12} xl={6} key={i}>
              <Card bordered style={{ borderColor: t.border }}>
                <Skeleton active paragraph={{ rows: 1 }} title={false} />
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    );
  }

  const trend = (data?.trend || []).map((d) => ({ ...d, label: dayjs(d.day).format('MM-DD') }));
  const topModels = data?.topModels || [];

  const axisStyle = { fontSize: 11, fill: t.textTertiary };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ color: t.text }}>
            数据仪表盘
          </h1>
          <p className="page-sub" style={{ color: t.textSecondary }}>
            {isAdmin ? '全平台' : '我的账户'}调用概览 · 数据实时统计于本地数据库
          </p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            themeMode={themeMode}
            label="今日调用次数"
            value={fmtNum(data?.today?.calls)}
            suffix="次"
            foot={`累计 ${fmtNum(data?.total?.calls)} 次`}
            icon={<ApiOutlined />}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            themeMode={themeMode}
            label="今日 Token 用量"
            value={fmtNum(data?.today?.tokens)}
            suffix="tokens"
            foot={`累计 ${fmtNum(data?.total?.tokens)} tokens`}
            icon={<ThunderboltOutlined />}
            tone="gold"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            themeMode={themeMode}
            label="今日消费金额"
            value={`¥ ${Number(data?.today?.cost || 0).toFixed(4)}`}
            foot={`累计 ¥ ${Number(data?.total?.cost || 0).toFixed(2)}`}
            icon={<WalletOutlined />}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            themeMode={themeMode}
            label="调用成功率"
            value={`${data?.successRate ?? 100}%`}
            foot={`失败 ${data?.failed ?? 0} 次`}
            icon={<WarningOutlined />}
            tone={(data?.failed ?? 0) > 0 ? 'danger' : 'primary'}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={16}>
          <Card
            bordered
            style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }}
            title={
              <Space size={8}>
                <RiseOutlined style={{ color: t.primary }} />
                <span className="serif" style={{ fontSize: 15, letterSpacing: '0.04em' }}>
                  近 14 日调用趋势
                </span>
              </Space>
            }
            extra={<Text style={{ fontSize: 12, color: t.textTertiary }}>调用次数 / Token 用量</Text>}
          >
            <div style={{ height: 296 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradCalls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={t.chart1} stopOpacity={0.34} />
                      <stop offset="100%" stopColor={t.chart1} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={t.chart2} stopOpacity={0.26} />
                      <stop offset="100%" stopColor={t.chart2} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" stroke={t.border} vertical={false} />
                  <XAxis dataKey="label" tick={axisStyle} axisLine={{ stroke: t.border }} tickLine={false} />
                  <YAxis yAxisId="left" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={axisStyle} axisLine={false} tickLine={false} />
                  <RTooltip
                    contentStyle={{
                      background: t.card,
                      border: `1px solid ${t.border}`,
                      borderRadius: 10,
                      fontSize: 12,
                      boxShadow: t.shadow,
                      color: t.text,
                    }}
                    labelStyle={{ color: t.textSecondary, fontSize: 11 }}
                    formatter={(v, n) => [fmtNum(v), n === 'calls' ? '调用次数' : 'Token']}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="calls"
                    name="calls"
                    stroke={t.chart1}
                    strokeWidth={2}
                    fill="url(#gradCalls)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="tokens"
                    name="tokens"
                    stroke={t.chart2}
                    strokeWidth={2}
                    fill="url(#gradTokens)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>

        <Col xs={24} xl={8}>
          <Card
            bordered
            style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow, height: '100%' }}
            title={
              <span className="serif" style={{ fontSize: 15, letterSpacing: '0.04em' }}>
                热门模型 TOP 8
              </span>
            }
            extra={
              <Button type="link" size="small" onClick={() => nav('/market')} style={{ padding: 0 }}>
                进入广场 <ArrowRightOutlined />
              </Button>
            }
          >
            {topModels.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无调用数据" />
            ) : (
              <div style={{ height: 296 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topModels} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 6" stroke={t.border} horizontal={false} />
                    <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="model_name"
                      tick={{ fontSize: 11, fill: t.textSecondary }}
                      width={96}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RTooltip
                      contentStyle={{
                        background: t.card,
                        border: `1px solid ${t.border}`,
                        borderRadius: 10,
                        fontSize: 12,
                        color: t.text,
                      }}
                      formatter={(v) => [fmtNum(v), '调用次数']}
                    />
                    <Bar dataKey="calls" fill={t.primary} radius={[0, 6, 6, 0]} barSize={13} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card
            bordered
            style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }}
            title={
              <Space size={8}>
                <WarningOutlined style={{ color: t.danger }} />
                <span className="serif" style={{ fontSize: 15, letterSpacing: '0.04em' }}>
                  最近调用失败
                </span>
              </Space>
            }
            extra={<Tag color={data?.failed ? 'error' : 'success'}>共 {data?.failed ?? 0} 次失败</Tag>}
          >
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={data?.recentErrors || []}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无失败记录，一切正常" /> }}
              columns={[
                {
                  title: '时间',
                  dataIndex: 'created_at',
                  width: 132,
                  render: (v) => <span style={{ fontSize: 12, color: t.textTertiary }}>{v?.slice(5)}</span>,
                },
                { title: '模型', dataIndex: 'model_name', width: 140, ellipsis: true },
                isAdmin
                  ? { title: '用户', dataIndex: 'username', width: 88, render: (v) => v || '-' }
                  : { title: '', dataIndex: '_', width: 0, render: () => null },
                {
                  title: '错误信息',
                  dataIndex: 'error_message',
                  ellipsis: true,
                  render: (v) => <span style={{ fontSize: 12, color: t.danger }}>{v}</span>,
                },
              ].filter((c) => c.title)}
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            bordered
            style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow, height: '100%' }}
            title={
              <span className="serif" style={{ fontSize: 15, letterSpacing: '0.04em' }}>
                账户与平台
              </span>
            }
          >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div>
                <Text style={{ fontSize: 12.5, color: t.textSecondary }}>账户余额</Text>
                <div className="serif" style={{ fontSize: 30, fontWeight: 700, color: t.primary, marginTop: 2 }}>
                  ¥ {Number(data?.balance ?? user?.balance ?? 0).toFixed(2)}
                </div>
                <Button type="primary" size="small" ghost onClick={() => nav('/billing')} style={{ marginTop: 8 }}>
                  立即充值
                </Button>
              </div>

              <div>
                <Text style={{ fontSize: 12.5, color: t.textSecondary }}>可用模型</Text>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                  <span className="serif" style={{ fontSize: 24, fontWeight: 700, color: t.text }}>
                    {data?.modelCount ?? 0}
                  </span>
                  <span style={{ fontSize: 12, color: t.textTertiary }}>个在线模型</span>
                </div>
              </div>

              {isAdmin && (
                <div>
                  <Text style={{ fontSize: 12.5, color: t.textSecondary }}>注册用户</Text>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                    <span className="serif" style={{ fontSize: 24, fontWeight: 700, color: t.text }}>
                      {data?.userCount ?? 0}
                    </span>
                    <span style={{ fontSize: 12, color: t.textTertiary }}>人</span>
                  </div>
                </div>
              )}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 12.5, color: t.textSecondary }}>成功率</Text>
                  <Text style={{ fontSize: 12.5, color: t.text }}>{data?.successRate ?? 100}%</Text>
                </div>
                <Progress
                  percent={data?.successRate ?? 100}
                  showInfo={false}
                  strokeColor={{ '0%': t.primary, '100%': t.chart2 }}
                  trailColor={themeMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}
                  size={['100%', 8]}
                />
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}