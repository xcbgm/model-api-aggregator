import { Spin } from 'antd';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Marketplace from './pages/Marketplace';
import Vendors from './pages/Vendors';
import Groups from './pages/Groups';
import Models from './pages/Models';
import Keys from './pages/Keys';
import Billing from './pages/Billing';
import Logs from './pages/Logs';
import Users from './pages/Users';
import Settings from './pages/Settings';
import SystemSettings from './pages/SystemSettings';

function Guard({ children, adminOnly }) {
  const { user, loading, isAdmin } = useAuth();
  const loc = useLocation();
  if (loading)
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" tip="加载中…" />
      </div>
    );
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Guard>
            <AppLayout />
          </Guard>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="market" element={<Marketplace />} />
        <Route path="keys" element={<Keys />} />
        <Route path="billing" element={<Billing />} />
        <Route path="logs" element={<Logs />} />
        <Route path="settings" element={<Settings />} />
        <Route
          path="vendors"
          element={
            <Guard adminOnly>
              <Vendors />
            </Guard>
          }
        />
        <Route
          path="groups"
          element={
            <Guard adminOnly>
              <Groups />
            </Guard>
          }
        />
        <Route
          path="models"
          element={
            <Guard adminOnly>
              <Models />
            </Guard>
          }
        />
        <Route
          path="users"
          element={
            <Guard adminOnly>
              <Users />
            </Guard>
          }
        />
        <Route
          path="system-settings"
          element={
            <Guard adminOnly>
              <SystemSettings />
            </Guard>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}