import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import './index.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import { designTokens } from './theme';
import AppShell from './App';

function Root() {
  const { themeMode } = useAuth();
  const t = designTokens[themeMode];
  const isDark = themeMode === 'dark';

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: t.primary,
          colorInfo: t.primary,
          colorSuccess: t.success,
          colorError: t.danger,
          colorWarning: t.gold,
          colorBgBase: t.bg,
          colorBgContainer: t.card,
          colorBgElevated: t.card,
          colorBorder: t.border,
          colorBorderSecondary: t.border,
          colorTextBase: t.text,
          borderRadius: 10,
          borderRadiusLG: 14,
          fontFamily: `var(--font-sans)`,
          fontSize: 14,
        },
        components: {
          Layout: {
            bodyBg: 'transparent',
            headerBg: 'transparent',
            siderBg: 'transparent',
          },
          Card: { paddingLG: 20 },
          Menu: {
            itemSelectedBg: isDark ? 'rgba(52,199,168,0.16)' : 'rgba(255,255,255,0.12)',
            itemSelectedColor: '#FFFFFF',
            itemHoverBg: 'rgba(255,255,255,0.08)',
            itemHoverColor: '#FFFFFF',
            itemColor: t.sidebarText,
            itemBg: 'transparent',
            darkItemBg: 'transparent',
            darkItemColor: t.sidebarText,
            darkItemSelectedColor: '#FFFFFF',
          },
          Table: { headerBg: isDark ? t.bgAlt : '#F7F8F5', headerColor: t.textSecondary },
          Statistic: { contentFontSize: 26 },
        },
      }}
    >
      <AntApp>
        <AppShell />
      </AntApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);