import { useEffect, useState, useCallback } from 'react';
import { Card, Row, Col, Button, Table, Space, Typography, App, Segmented, Tag, Divider, Statistic, Alert, Modal } from 'antd';
import { WalletOutlined, ThunderboltFilled, CreditCardOutlined, HistoryOutlined, SafetyCertificateOutlined, QrcodeOutlined } from '@ant-design/icons';
import { billing as billingApi, pay as payApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { designTokens } from '../theme';

const { Text } = Typography;

const PRESETS = [10, 50, 100, 200, 500, 1000];

export default function Billing() {
  const { themeMode, user, refresh } = useAuth();
  const t = designTokens[themeMode];
  const { message } = App.useApp();
  const [amount, setAmount] = useState(50);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [balance, setBalance] = useState(user?.balance ?? 0);
  const [payMode, setPayMode] = useState('mock');
  const [payType, setPayType] = useState('alipay');
  const [payOpen, setPayOpen] = useState(false);
  const [payUrl, setPayUrl] = useState('');
  const [payOrderNo, setPayOrderNo] = useState('');

  const load = async () => {
    try {
      const r = await billingApi.recharges();
      setRows(r);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    load();
    setBalance(user?.balance ?? 0);
  }, [user?.balance]);

  const doRecharge = async (amt) => {
    const v = Number(amt ?? amount);
    if (!(v > 0)) return message.warning('请输入有效的充值金额');
    setLoading(true);
    try {
      if (payMode === 'online') {
        // 在线支付：创建订单并跳转收银台
        const r = await payApi.create({ amount: v, pay_type: payType });
        setPayUrl(r.url);
        setPayOrderNo(r.order_no);
        setPayOpen(true);
        startPolling(r.order_no);
      } else {
        const r = await billingApi.recharge(v);
        setBalance(r.balance);
        message.success(r.message || '充值成功');
        await refresh();
        load();
      }
    } catch (e) {
      message.error(e?.response?.data?.error || '充值失败');
    } finally {
      setLoading(false);
    }
  };

  // 轮询支付订单状态
  const startPolling = useCallback((orderNo) => {
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      try {
        const s = await payApi.status(orderNo);
        if (s.status === 'paid') {
          clearInterval(timer);
          setPayOpen(false);
          message.success('支付成功，已到账！');
          await refresh();
          load();
        }
      } catch (e) { /* ignore */ }
      if (tries >= 120) clearInterval(timer);
    }, 3000);
  }, []);

  const columns = [
    { title: '时间', dataIndex: 'created_at', width: 180, render: (v) => <span style={{ fontSize: 12, color: t.textTertiary }}>{v}</span> },
    {
      title: '充值金额',
      dataIndex: 'amount',
      align: 'right',
      render: (v) => <span className="serif" style={{ fontWeight: 700, color: t.primary, fontSize: 15 }}>+ ¥{Number(v).toFixed(2)}</span>,
    },
    { title: '方式', dataIndex: 'method', width: 120, render: (v) => <Tag style={{ borderRadius: 20 }}>{v === 'mock' ? '模拟支付' : v === 'epay' ? '在线支付' : v}</Tag> },
    { title: '状态', dataIndex: 'status', width: 110, render: () => <Tag color="success" style={{ borderRadius: 20 }}>已到账</Tag> },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ color: t.text }}>充值与账单</h1>
          <p className="page-sub" style={{ color: t.textSecondary }}>
            为账户余额充值，余额用于支付模型调用费用，按实际用量实时扣减
          </p>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card
            bordered
            style={{
              borderColor: t.border,
              background: themeMode === 'dark'
                ? 'linear-gradient(135deg, #12241F 0%, #14231F 60%, #1A2320 100%)'
                : 'linear-gradient(135deg, #EAF3F0 0%, #F2F5F0 60%, #F7F3EA 100%)',
              boxShadow: t.shadow,
            }}
            styles={{ body: { padding: 26 } }}
          >
            <Space size={8}>
              <WalletOutlined style={{ color: t.primary, fontSize: 18 }} />
              <Text style={{ fontSize: 13, color: t.textSecondary, letterSpacing: '0.06em' }}>账户余额</Text>
            </Space>
            <div className="serif" style={{ fontSize: 46, fontWeight: 700, color: t.text, margin: '10px 0 6px', letterSpacing: '0.01em' }}>
              <span style={{ fontSize: 22, color: t.textSecondary, marginRight: 4 }}>¥</span>
              {Number(balance).toFixed(2)}
            </div>
            <Text style={{ fontSize: 12, color: t.textTertiary }}>
              可用余额将用于抵扣模型调用费用，余额不足时调用会被拒绝
            </Text>

            <Divider style={{ margin: '20px 0 16px' }} />

            <Text style={{ fontSize: 13, color: t.textSecondary }}>选择充值金额</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '12px 0 16px' }}>
              {PRESETS.map((p) => (
                <Button
                  key={p}
                  type={amount === p ? 'primary' : 'default'}
                  onClick={() => setAmount(p)}
                  style={{ minWidth: 82, fontWeight: 600 }}
                >
                  ¥{p}
                </Button>
              ))}
            </div>

            <Text style={{ fontSize: 13, color: t.textSecondary, display: 'block', marginBottom: 8 }}>支付方式</Text>
            <Segmented
              value={payMode}
              onChange={setPayMode}
              options={[
                { label: '模拟支付', value: 'mock' },
                { label: '在线支付', value: 'online' },
              ]}
              style={{ marginBottom: 12 }}
            />
            {payMode === 'online' && (
              <Segmented
                value={payType}
                onChange={setPayType}
                options={[
                  { label: '支付宝', value: 'alipay' },
                  { label: '微信支付', value: 'wechat' },
                ]}
                style={{ marginBottom: 12 }}
              />
            )}

            <Space.Compact style={{ width: '100%' }}>
              <Button icon={<ThunderboltFilled />} style={{ pointerEvents: 'none', background: 'transparent' }}>¥</Button>
              <input
                type="number"
                value={amount}
                min={1}
                onChange={(e) => setAmount(Number(e.target.value))}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  fontSize: 15,
                  background: themeMode === 'dark' ? 'rgba(255,255,255,0.04)' : '#fff',
                  border: `1px solid ${t.border}`,
                  borderLeft: 'none',
                  borderRight: 'none',
                  color: t.text,
                  outline: 'none',
                }}
              />
              <Button type="primary" loading={loading} onClick={() => doRecharge()} icon={payMode === 'online' ? <QrcodeOutlined /> : <CreditCardOutlined />}>
                {payMode === 'online' ? '扫码支付' : '立即充值'}
              </Button>
            </Space.Compact>

            <Alert
              type={payMode === 'online' ? 'warning' : 'info'}
              showIcon
              style={{ marginTop: 16, borderRadius: 10 }}
              message={payMode === 'online' ? '在线支付' : '模拟支付'}
              description={
                <span style={{ fontSize: 12 }}>
                  {payMode === 'online'
                    ? '跳转到支付网关完成付款，支付成功后自动到账（需管理员已配置支付网关）。'
                    : '点击充值即视为支付成功，金额立即到账，不产生真实扣款。'}
                </span>
              }
            />
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card bordered style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }} styles={{ body: { padding: 18 } }}>
                <Space size={8}>
                  <SafetyCertificateOutlined style={{ color: t.success }} />
                  <Text style={{ fontSize: 12.5, color: t.textSecondary }}>计费方式</Text>
                </Space>
                <div className="serif" style={{ fontSize: 19, fontWeight: 700, marginTop: 8, color: t.text }}>按量计费</div>
                <Text style={{ fontSize: 12, color: t.textTertiary }}>按 Token 实际用量结算</Text>
              </Card>
            </Col>
            <Col span={12}>
              <Card bordered style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }} styles={{ body: { padding: 18 } }}>
                <Space size={8}>
                  <HistoryOutlined style={{ color: t.gold }} />
                  <Text style={{ fontSize: 12.5, color: t.textSecondary }}>充值笔数</Text>
                </Space>
                <div className="serif" style={{ fontSize: 19, fontWeight: 700, marginTop: 8, color: t.text }}>{rows.length} 笔</div>
                <Text style={{ fontSize: 12, color: t.textTertiary }}>累计 ¥{rows.reduce((s, r) => s + Number(r.amount), 0).toFixed(2)}</Text>
              </Card>
            </Col>
            <Col span={24}>
              <Card
                bordered
                style={{ borderColor: t.border, background: t.card, boxShadow: t.shadow }}
                styles={{ body: { padding: 0 } }}
                title={<span className="serif">充值记录</span>}
              >
                <Table
                  rowKey="id"
                  size="middle"
                  columns={columns}
                  dataSource={rows}
                  pagination={{ pageSize: 8, size: 'small' }}
                  locale={{ emptyText: '暂无充值记录' }}
                />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      <Modal
        open={payOpen}
        title={<Space><QrcodeOutlined style={{ color: t.primary }} />在线支付</Space>}
        onCancel={() => setPayOpen(false)}
        footer={null}
        width={440}
      >
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <Text style={{ fontSize: 14, color: t.textSecondary }}>订单号：<Text code>{payOrderNo}</Text></Text>
          <div style={{ margin: '16px 0' }}>
            <iframe
              src={payUrl}
              title="支付"
              style={{ width: '100%', height: 420, border: `1px solid ${t.border}`, borderRadius: 10 }}
            />
          </div>
          <Text style={{ fontSize: 12, color: t.textTertiary, display: 'block' }}>
            完成支付后此页面会自动检测到账；如未跳转可点击下方按钮。
          </Text>
          <Button type="primary" style={{ marginTop: 12 }} onClick={() => window.open(payUrl, '_blank')}>
            打开支付页面
          </Button>
        </div>
      </Modal>
    </div>
  );
}