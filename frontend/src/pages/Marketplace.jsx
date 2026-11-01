import { useEffect, useMemo, useState } from 'react';
import { Row, Col, Card, Input, Select, Tag, Empty, Spin, Space, Typography, Button, Tooltip, Statistic } from 'antd';
import { SearchOutlined, FireOutlined, WalletOutlined, CopyOutlined, ApiOutlined, ClockCircleOutlined, ThunderboltOutlined, FieldTimeOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { models as modelsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { designTokens } from '../theme';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

const typeLabel = { chat: '对话', embedding: '向量', image: '绘图', audio: '语音' };

function ModelCard({ m, t, themeMode, onCopy }) {
  const isFree = !m.fixed_price && !m.input_price && !m.output_price;
  return (
    <Card
      className="model-card"
      bordered
      style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }}
      styles={{ body: { padding: 18, height: '100%', display: 'flex', flexDirection: 'column' } }}
    >
      <div className="mc-head">
        <div style={{ minWidth: 0 }}>
          <div className="mc-name" style={{ color: t.text }}>
            {m.display_name || m.name}
          </div>
          <Space size={6} style={{ marginTop: 6 }} wrap>
            <Tag
              style={{
                fontSize: 11,
                borderRadius: 20,
                border: 'none',
                background: themeMode === 'dark' ? 'rgba(52,199,168,0.14)' : 'rgba(22,119,107,0.09)',
                color: t.primary,
                marginInlineEnd: 0,
              }}
            >
              {m.vendor_name}
            </Tag>
            {m.group_name ? (
              <Tag style={{ fontSize: 11, borderRadius: 20, marginInlineEnd: 0 }} color="gold">
                {m.group_name}
              </Tag>
            ) : (
              <Tag style={{ fontSize: 11, borderRadius: 20, marginInlineEnd: 0 }}>未分组</Tag>
            )}
            <Tag style={{ fontSize: 11, borderRadius: 20, marginInlineEnd: 0 }}>
              {typeLabel[m.model_type] || m.model_type}
            </Tag>
            {m.reasoning_enabled ? (
              <Tag color="purple" style={{ fontSize: 11, borderRadius: 20, marginInlineEnd: 0 }}>推理</Tag>
            ) : null}
            {m.input_modes && m.input_modes.split(',').filter((x) => x && x !== 'text').map((x) => (
              <Tag key={x} color="blue" style={{ fontSize: 11, borderRadius: 20, marginInlineEnd: 0 }}>
                {{ image: '图片', audio: '音频', video: '视频' }[x] || x}
              </Tag>
            ))}
          </Space>
        </div>
        <Tooltip title="复制模型 ID">
          <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => onCopy(m.name)} />
        </Tooltip>
      </div>

      <div className="mono ellipsis" style={{ marginTop: 8, color: t.textTertiary, fontSize: 11.5 }}>
        {m.name}
      </div>

      <div className="price-row">
        {m.fixed_price > 0 ? (
          <div className="price-box" style={{ background: themeMode === 'dark' ? 'rgba(216,174,107,0.09)' : 'rgba(185,139,69,0.08)' }}>
            <span style={{ color: t.textTertiary }}>按次计费</span>
            <b style={{ color: t.gold }}>¥ {m.fixed_price}</b>
            <span style={{ color: t.textTertiary }}>/ 次</span>
          </div>
        ) : (
          <>
            <div className="price-box" style={{ background: themeMode === 'dark' ? 'rgba(52,199,168,0.08)' : 'rgba(22,119,107,0.06)' }}>
              <span style={{ color: t.textTertiary }}>输入 1K</span>
              <b style={{ color: t.primary }}>¥ {Number(m.input_price).toFixed(4)}</b>
            </div>
            <div className="price-box" style={{ background: themeMode === 'dark' ? 'rgba(216,174,107,0.08)' : 'rgba(185,139,69,0.07)' }}>
              <span style={{ color: t.textTertiary }}>输出 1K</span>
              <b style={{ color: t.gold }}>¥ {Number(m.output_price).toFixed(4)}</b>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size={4} wrap>
          {m.context_length > 0 && (
            <Tooltip title="上下文长度">
              <Tag style={{ borderRadius: 20, fontSize: 11, marginInlineEnd: 0, background: 'transparent', border: `1px solid ${t.border}`, color: t.textSecondary }}>
                <FieldTimeOutlined /> {m.context_length >= 1000 ? `${Math.round(m.context_length / 1000)}K` : m.context_length} ctx
              </Tag>
            </Tooltip>
          )}
          {m.probe_online === 1 && m.probe_latency_ms > 0 && (
            <Tooltip title={`延迟 ${m.probe_latency_ms}ms · 首字 ${m.probe_ttft_ms ?? '—'}ms`}>
              <Tag style={{ borderRadius: 20, fontSize: 11, marginInlineEnd: 0, background: 'transparent', border: `1px solid ${t.border}`, color: t.textSecondary }}>
                <ClockCircleOutlined /> {m.probe_latency_ms}ms
              </Tag>
            </Tooltip>
          )}
        </Space>
        {m.probe_online === null || m.probe_online === undefined ? (
          <Tag style={{ borderRadius: 20, fontSize: 11, marginInlineEnd: 0, background: 'transparent', border: `1px dashed ${t.border}`, color: t.textTertiary }}>
            未探测
          </Tag>
        ) : m.probe_online ? (
          <Tag color="success" style={{ borderRadius: 20, fontSize: 11, marginInlineEnd: 0 }}>在线</Tag>
        ) : (
          <Tag color="error" style={{ borderRadius: 20, fontSize: 11, marginInlineEnd: 0 }}>离线</Tag>
        )}
      </div>
    </Card>
  );
}

export default function Marketplace() {
  const { themeMode, user } = useAuth();
  const t = designTokens[themeMode];
  const { message } = App.useApp();
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kw, setKw] = useState('');
  const [group, setGroup] = useState('all');
  const [vendor, setVendor] = useState('all');
  const [sortBy, setSortBy] = useState('default');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setList(await modelsApi.marketplace());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groupOptions = useMemo(
    () => [{ value: 'all', label: '全部分组' }, ...Array.from(new Set(list.map((m) => m.group_name).filter(Boolean))).map((g) => ({ value: g, label: g }))],
    [list]
  );
  const vendorOptions = useMemo(
    () => [{ value: 'all', label: '全部厂商' }, ...Array.from(new Set(list.map((m) => m.vendor_name))).map((v) => ({ value: v, label: v }))],
    [list]
  );

  const filtered = list.filter((m) => {
    const okKw = !kw || (m.name + (m.display_name || '') + m.vendor_name).toLowerCase().includes(kw.toLowerCase());
    const okGroup = group === 'all' || m.group_name === group;
    const okVendor = vendor === 'all' || m.vendor_name === vendor;
    return okKw && okGroup && okVendor;
  });

  // 排序
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === 'latency') {
      arr.sort((a, b) => (a.probe_latency_ms ?? 1e9) - (b.probe_latency_ms ?? 1e9));
    } else if (sortBy === 'ttft') {
      arr.sort((a, b) => (a.probe_ttft_ms ?? 1e9) - (b.probe_ttft_ms ?? 1e9));
    } else if (sortBy === 'context') {
      arr.sort((a, b) => (b.context_length || 0) - (a.context_length || 0));
    } else if (sortBy === 'price') {
      arr.sort((a, b) => (a.input_price || 0) - (b.input_price || 0));
    } else if (sortBy === 'online') {
      arr.sort((a, b) => (b.probe_online ?? -1) - (a.probe_online ?? -1));
    }
    return arr;
  }, [filtered, sortBy]);

  const sortOptions = [
    { value: 'default', label: '默认排序' },
    { value: 'online', label: '在线优先' },
    { value: 'latency', label: '延迟从低到高' },
    { value: 'ttft', label: '首字从快到慢' },
    { value: 'context', label: '上下文从大到小' },
    { value: 'price', label: '价格从低到高' },
  ];

  const copy = (v) => {
    navigator.clipboard?.writeText(v);
    message.success('已复制：' + v);
  };

  return (
    <div>
      <div
        style={{
          borderRadius: 18,
          padding: '26px 28px',
          marginBottom: 20,
          border: `1px solid ${t.border}`,
          background:
            themeMode === 'dark'
              ? 'linear-gradient(120deg, #12241F 0%, #14211E 55%, #171F1B 100%)'
              : 'linear-gradient(120deg, #EDF4F1 0%, #F3F5F0 55%, #F5F1E8 100%)',
          boxShadow: t.shadow,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Row align="middle" gutter={[16, 16]}>
          <Col xs={24} md={14}>
            <Space size={8} style={{ marginBottom: 6 }}>
              <FireOutlined style={{ color: t.gold }} />
              <Text style={{ fontSize: 12, letterSpacing: '0.18em', color: t.textTertiary }}>MODEL MARKETPLACE</Text>
            </Space>
            <h1 className="serif" style={{ fontSize: 28, margin: 0, color: t.text, letterSpacing: '0.04em' }}>
              模型广场
            </h1>
            <p style={{ color: t.textSecondary, fontSize: 13.5, margin: '10px 0 0', lineHeight: 1.9 }}>
              一览全平台已接入的大模型与其明码标价。所有模型均通过统一 OpenAI 兼容接口调用，
              <br />
              按实际 Token 用量结算，费用从账户余额实时扣除。
            </p>
          </Col>
          <Col xs={24} md={10}>
            <Row gutter={12} justify="end">
              <Col>
                <Card size="small" bordered style={{ borderColor: t.border, background: themeMode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.7)' }}>
                  <Statistic
                    title={<span style={{ fontSize: 12, color: t.textSecondary }}>在线模型</span>}
                    value={list.length}
                    suffix={<span style={{ fontSize: 12 }}>个</span>}
                    valueStyle={{ fontSize: 24, color: t.primary, fontFamily: 'var(--font-serif)' }}
                  />
                </Card>
              </Col>
              <Col>
                <Card size="small" bordered style={{ borderColor: t.border, background: themeMode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.7)' }}>
                  <Statistic
                    title={<span style={{ fontSize: 12, color: t.textSecondary }}>我的余额</span>}
                    value={Number(user?.balance || 0)}
                    precision={2}
                    prefix="¥"
                    valueStyle={{ fontSize: 24, color: t.gold, fontFamily: 'var(--font-serif)' }}
                  />
                  <Button type="primary" size="small" ghost icon={<WalletOutlined />} onClick={() => nav('/billing')} style={{ marginTop: 6 }}>
                    充值
                  </Button>
                </Card>
              </Col>
            </Row>
          </Col>
        </Row>
      </div>

      <Card bordered style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow, marginBottom: 16 }} styles={{ body: { padding: 14 } }}>
        <Space wrap size={12} style={{ width: '100%' }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: t.textTertiary }} />}
            placeholder="搜索模型名称、厂商…"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            style={{ width: 260 }}
          />
          <Select value={vendor} onChange={setVendor} options={vendorOptions} style={{ width: 150 }} />
          <Select value={group} onChange={setGroup} options={groupOptions} style={{ width: 150 }} />
          <Select value={sortBy} onChange={setSortBy} options={sortOptions} style={{ width: 160 }} />
          <Text style={{ fontSize: 12.5, color: t.textTertiary, marginLeft: 'auto' }}>
            共 <b style={{ color: t.primary }}>{sorted.length}</b> 个模型
          </Text>
        </Space>
      </Card>

      {loading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
          <Spin size="large" tip="加载模型中…" />
        </div>
      ) : sorted.length === 0 ? (
        <Card bordered style={{ borderColor: t.border, background: t.card }}>
          <Empty description="暂无符合条件的模型" />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {sorted.map((m) => (
            <Col xs={24} sm={12} lg={8} xxl={6} key={m.id}>
              <ModelCard m={m} t={t} themeMode={themeMode} onCopy={copy} />
            </Col>
          ))}
        </Row>
      )}

      <Card
        bordered
        style={{ borderColor: t.border, background: t.card, marginTop: 20 }}
        title={<Space><ApiOutlined style={{ color: t.primary }} /><span className="serif">如何调用？</span></Space>}
      >
        <pre
          className="mono"
          style={{
            background: themeMode === 'dark' ? '#0A1211' : '#F6F8F5',
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            padding: 16,
            overflowX: 'auto',
            color: t.text,
            fontSize: 12.5,
            lineHeight: 1.8,
            margin: 0,
          }}
        >{`curl http://<本机地址>:3001/v1/chat/completions \\
  -H "Authorization: Bearer sk-你的密钥" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${list[0]?.name || 'deepseek-chat'}",
    "messages": [{"role": "user", "content": "你好"}]
  }'`}</pre>
        <Text style={{ fontSize: 12.5, color: t.textSecondary, display: 'block', marginTop: 12 }}>
          前往「API 密钥」页面创建密钥后即可调用；计费按响应中的 usage 字段实际结算。
        </Text>
      </Card>
    </div>
  );
}