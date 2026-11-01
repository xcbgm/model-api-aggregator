import { useMemo, useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Tooltip, Tag, Space, Button, Drawer } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  CloudServerOutlined,
  PartitionOutlined,
  KeyOutlined,
  WalletOutlined,
  FileTextOutlined,
  TeamOutlined,
  SettingOutlined,
  SunOutlined,
  MoonOutlined,
  LogoutOutlined,
  MenuOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { designTokens } from '../theme';

const { Sider, Content, Header } = Layout;

function useNavItems() {
  const { isAdmin } = useAuth();
  return useMemo(() => {
    const mine = [
      { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
      { key: '/market', icon: <AppstoreOutlined />, label: '模型广场' },
      { key: '/keys', icon: <KeyOutlined />, label: 'API 密钥' },
      { key: '/billing', icon: <WalletOutlined />, label: '充值与账单' },
      { key: '/logs', icon: <FileTextOutlined />, label: '调用日志' },
    ];
    if (!isAdmin) return [{ type: 'group', label: '我的工作台', children: mine }];
    return [
      { type: 'group', label: '我的工作台', children: mine.slice(0, 1).concat(mine.slice(1)) },
      {
        type: 'group',
        label: '平台管理',
        children: [
          { key: '/vendors', icon: <CloudServerOutlined />, label: '厂商接入' },
          { key: '/groups', icon: <PartitionOutlined />, label: '模型分组' },
          { key: '/models', icon: <ThunderboltFilled />, label: '模型与定价' },
          { key: '/users', icon: <TeamOutlined />, label: '用户管理' },
        ],
      },
    ];
  }, [isAdmin]);
}

function Brand() {
  return (
    <div className="side-brand">
      <div
        className="seal"
        style={{
          width: 38,
          height: 38,
          background: 'linear-gradient(140deg, #1E8F7F 0%, #0E5A50 100%)',
          color: '#fff',
          fontSize: 18,
          boxShadow: '0 6px 16px -6px rgba(30,143,127,0.9)',
          border: '1px solid rgba(255,255,255,0.14)',
        }}
      >
        灵
      </div>
      <div>
        <div className="name">{designTokens.brand}</div>
        <div className="sub">Model Gateway</div>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }) {
  const items = useNavItems();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const selected = '/' + (pathname.split('/')[1] || 'dashboard');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Brand />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px' }}>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          items={items}
          style={{ background: 'transparent', borderInlineEnd: 'none' }}
          onClick={({ key }) => {
            nav(key);
            onNavigate?.();
          }}
        />
      </div>
      <div className="side-foot">
        <div>灵犀模型网关 v1.0</div>
        <div>统一接入 · 按量计费</div>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const { user, isAdmin, themeMode, toggleTheme, logout } = useAuth();
  const t = designTokens[themeMode];
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const nav = useNavigate();
  const { pathname } = useLocation();

  const userMenu = {
    items: [
      {
        key: 'theme',
        icon: themeMode === 'light' ? <MoonOutlined /> : <SunOutlined />,
        label: themeMode === 'light' ? '切换暗色模式' : '切换浅色模式',
        onClick: toggleTheme,
      },
      { key: 'settings', icon: <SettingOutlined />, label: '账号设置', onClick: () => nav('/settings') },
      { type: 'divider' },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        danger: true,
        onClick: () => {
          logout();
          nav('/login');
        },
      },
    ],
  };

  return (
    <Layout style={{ minHeight: '100vh', background: t.gradientBg }}>
      <Sider
        width={224}
        collapsedWidth={72}
        collapsed={collapsed}
        collapsible
        onCollapse={setCollapsed}
        breakpoint="lg"
        style={{ background: t.sidebar, position: 'sticky', top: 0, height: '100vh' }}
        trigger={null}
      >
        <SidebarContent />
      </Sider>

      <Drawer
        open={drawer}
        placement="left"
        width={248}
        onClose={() => setDrawer(false)}
        closable={false}
        styles={{ body: { padding: 0, background: t.sidebar } }}
      >
        <SidebarContent onNavigate={() => setDrawer(false)} />
      </Drawer>

      <Layout style={{ background: 'transparent' }}>
        <Header
          style={{
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            background: themeMode === 'dark' ? 'rgba(10,17,16,0.6)' : 'rgba(255,255,255,0.5)',
            borderBottom: `1px solid ${t.border}`,
            backdropFilter: 'blur(12px)',
            position: 'sticky',
            top: 0,
            zIndex: 20,
          }}
        >
          <Space size={10}>
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setCollapsed((c) => !c)}
              style={{ display: 'none' }}
              className="desk-toggle"
            />
            <Tooltip title="展开导航">
              <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawer(true)} className="mobile-toggle" />
            </Tooltip>
            <span style={{ fontSize: 13, color: t.textSecondary, letterSpacing: '0.04em' }}>
              {isAdmin ? '管理员控制台' : '用户中心'}
            </span>
          </Space>

          <Space size={14}>
            <Tooltip title={themeMode === 'light' ? '切换暗色' : '切换浅色'}>
              <Button
                type="text"
                shape="circle"
                icon={themeMode === 'light' ? <MoonOutlined /> : <SunOutlined />}
                onClick={toggleTheme}
              />
            </Tooltip>
            <Tooltip title="账户余额">
              <Tag
                style={{
                  borderRadius: 20,
                  padding: '3px 12px',
                  fontSize: 12.5,
                  border: `1px solid ${t.border}`,
                  background: themeMode === 'dark' ? 'rgba(52,199,168,0.10)' : 'rgba(22,119,107,0.07)',
                  color: t.primary,
                  fontWeight: 600,
                }}
              >
                ¥ {Number(user?.balance || 0).toFixed(2)}
              </Tag>
            </Tooltip>
            <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
              <Space style={{ cursor: 'pointer' }} size={8}>
                <Avatar
                  size={30}
                  style={{
                    background: 'linear-gradient(140deg, #1E8F7F, #0E5A50)',
                    fontFamily: 'var(--font-serif)',
                    fontSize: 14,
                  }}
                >
                  {user?.username?.[0]?.toUpperCase()}
                </Avatar>
                <span style={{ fontSize: 13.5, color: t.text }}>{user?.username}</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ padding: '24px 26px 40px', maxWidth: 1440, width: '100%', margin: '0 auto' }}>
          <div className="fade-in" key={pathname}>
            <Outlet />
          </div>
        </Content>
      </Layout>

      <style>{`
        .mobile-toggle { display: none; }
        @media (max-width: 992px) {
          .mobile-toggle { display: inline-flex; }
          .desk-toggle { display: none !important; }
          .ant-layout-sider { display: none; }
        }
      `}</style>
    </Layout>
  );
}