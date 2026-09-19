import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  PieChart,
  CreditCard,
  Wallet,
  TrendingUp,
  Receipt,
  BarChart3,
  LogOut,
  Shield,
  Building2,
} from 'lucide-react';

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Member Management', path: '/members', icon: Users, badge: 'Issue #4' },
    { label: 'Shares & Annual Account', path: '/shares', icon: PieChart, disabled: true },
    { label: 'Contributions & Payments', path: '/payments', icon: CreditCard, disabled: true },
    { label: 'Accountant Custody', path: '/custody', icon: Wallet, disabled: true },
    { label: 'Investments', path: '/investments', icon: TrendingUp, disabled: true },
    { label: 'Expenses', path: '/expenses', icon: Receipt, disabled: true },
    { label: 'Reports & Dashboard', path: '/reports', icon: BarChart3, disabled: true },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: '270px',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 50,
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            padding: '24px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px var(--primary-glow)',
            }}
          >
            <Building2 size={22} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
              NS Foundation
            </h1>
            <p style={{ fontSize: '0.725rem', color: 'var(--text-subtle)', fontWeight: 500 }}>
              এন এস ফাউন্ডেশন সমবায়
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav style={{ padding: '18px 12px', flex: 1, overflowY: 'auto' }}>
          <p
            style={{
              fontSize: '0.675rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-subtle)',
              padding: '0 12px 10px',
            }}
          >
            Core Modules
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            if (item.disabled) {
              return (
                <div
                  key={item.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-subtle)',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: 'not-allowed',
                    opacity: 0.5,
                  }}
                  title="Coming in subsequent GitHub issue"
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </div>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  color: isActive ? '#ffffff' : 'var(--text-muted)',
                  background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                  border: isActive ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                  fontSize: '0.85rem',
                  fontWeight: isActive ? 600 : 500,
                  textDecoration: 'none',
                  marginBottom: '4px',
                  transition: 'all 0.2s ease',
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Icon size={18} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    style={{
                      fontSize: '0.675rem',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(59, 130, 246, 0.25)',
                      color: '#60A5FA',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User Card & Logout in Sidebar Footer */}
        <div
          style={{
            padding: '16px',
            borderTop: '1px solid var(--border)',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  flexShrink: 0,
                }}
              >
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <p
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {user?.name}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Shield size={12} color="#60A5FA" />
                  <span style={{ fontSize: '0.7rem', color: '#60A5FA', fontWeight: 600 }}>
                    {user?.accountantType ? `${user.accountantType} ACC` : user?.role}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="Sign Out"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-subtle)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#F87171')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-subtle)')}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Header Bar */}
        <header
          style={{
            height: '64px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-glass)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px',
            position: 'sticky',
            top: 0,
            zIndex: 40,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>Modules /</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Member Management (Issue #4)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="badge badge-active" style={{ fontSize: '0.7rem' }}>
              System Operational
            </span>
          </div>
        </header>

        {/* Page Outlet */}
        <main style={{ flex: 1, padding: '32px', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
