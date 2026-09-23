import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  PieChart,
  CreditCard,
  Wallet,
  Repeat2,
  TrendingUp,
  Receipt,
  BarChart3,
  LogOut,
  Shield,
  Settings2,
  Database,
  Scale,
  FileText,
  Sun,
  Moon,
  Languages,
  Menu,
  X,
} from 'lucide-react';

import { BrandLogo } from './BrandLogo';
import { usePreferences } from '../context/PreferencesContext';

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, setTheme, t } = usePreferences();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentModuleTitle = location.pathname.startsWith('/distribution')
    ? 'Final Distribution'
    : location.pathname.startsWith('/preferences')
    ? 'Language & Appearance'
    : location.pathname.startsWith('/settings')
    ? 'Organization Settings'
    : location.pathname.startsWith('/migrations')
    ? 'Historical Migration'
    : location.pathname.startsWith('/governance')
    ? 'Annual Governance'
    : location.pathname.startsWith('/documents')
    ? 'Statements & Reports'
    : location.pathname.startsWith('/audit')
    ? 'Audit & Security'
    : location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/reports')
    ? 'Dashboard & Reports'
    : location.pathname.startsWith('/expenses')
    ? 'Expense Management'
    : location.pathname.startsWith('/reinvestments')
    ? 'Project Wallets & Reinvestment'
    : location.pathname.startsWith('/investments')
    ? 'Investment Management'
    : location.pathname.startsWith('/custody')
    ? 'Accountant Custody Ledger'
    : location.pathname.startsWith('/payments')
    ? 'Contributions & Payments'
    : location.pathname.startsWith('/shares')
    ? 'Shares & Annual Account'
    : 'Member Management';

  const navItems = [
    { label: 'Dashboard & Reports', path: '/dashboard', icon: BarChart3, issue: '#11' },
    { label: 'Statements & Reports', path: '/documents', icon: FileText, issue: '#20' },
    { label: 'Member Management', path: '/members', icon: Users, issue: '#4' },
    { label: 'Shares & Annual Account', path: '/shares', icon: PieChart, issue: '#5' },
    { label: 'Contributions & Payments', path: '/payments', icon: CreditCard, issue: '#6' },
    { label: 'Accountant Custody', path: '/custody', icon: Wallet, issue: '#7' },
    ...(user?.accountantType === 'PRIMARY' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' ? [{ label: 'Investments', path: '/investments', icon: TrendingUp, issue: '#8' }, { label: 'Project Wallets', path: '/reinvestments', icon: Repeat2, issue: '#9' }] : []),
    { label: 'Expenses', path: '/expenses', icon: Receipt, issue: '#10' },
    { label: 'Language & Appearance', path: '/preferences', icon: Languages, badge: 'Settings', issue: '#16' },
    ...(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' ? [{ label: 'Organization Settings', path: '/settings', icon: Settings2, badge: 'Admin', issue: '#15' }] : []),
    ...(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' ? [{ label: 'Annual Governance', path: '/governance', icon: Scale, badge: 'Admin', issue: '#19' }] : []),
    ...(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' ? [{ label: 'Audit & Security', path: '/audit', icon: Shield, badge: 'Admin', issue: '#13' }] : []),
    ...(user?.role === 'SUPER_ADMIN' || (user?.role === 'ADMIN' && user?.accountantType === 'PRIMARY') ? [{ label: 'Historical Migration', path: '/migrations', icon: Database, badge: 'Admin', issue: '#17' }] : []),
    ...(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT' ? [{ label: 'Final Distribution', path: '/distribution', icon: PieChart, issue: '#12' }] : []),
  ];

  return (
    <div className="flex min-h-screen bg-[#0B0F19] text-gray-100">
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - Desktop (fixed) & Mobile (drawer) */}
      <aside
        className={`fixed lg:sticky top-0 h-screen z-50 shrink-0 w-[270px] bg-[#111827] border-r border-white/10 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo size="md" editable />
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
                NS Foundation
              </h1>
              <p className="text-[11px] text-gray-400 font-medium">
                এন এস ফাউন্ডেশন সমবায় সমিতি
              </p>
            </div>
          </div>

          {/* Close button for mobile drawer */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10"
            aria-label="Close navigation menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 flex-1 overflow-y-auto space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 px-3 pt-2 pb-1.5">
            {t('Core Modules')}
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-500/15 border border-blue-500/30 text-white font-semibold shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent font-medium'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} />
                  <span>{t(item.label)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {item.issue && (
                    <span title={`Temporary implementation marker for Issue ${item.issue}`} className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-400/25">
                      {item.issue}
                    </span>
                  )}
                  {item.badge && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/25 text-blue-400 border border-blue-500/30">
                      {item.badge}
                    </span>
                  )}
                </div>
              </NavLink>
            );
          })}
        </nav>

        {/* User Card & Logout Footer */}
        <div className="p-4 border-t border-white/10 bg-black/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-inner">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-white truncate max-w-[130px]">
                  {user?.name}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Shield size={12} className="text-blue-400 shrink-0" />
                  <span className="text-[10px] text-blue-400 font-semibold tracking-wide">
                    {user?.accountantType ? `${user.accountantType} ACC` : user?.role}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title={t('Sign Out')}
              className="text-gray-400 hover:text-red-400 p-2 rounded-md hover:bg-white/5 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Body */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-white/10 bg-[#111827]/75 backdrop-blur-md flex items-center justify-between px-4 sm:px-8 sticky top-0 z-40">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5"
              aria-label="Toggle navigation menu"
            >
              <Menu size={20} />
            </button>

            <div className="flex min-w-0 items-center gap-2 text-xs">
              <span className="text-gray-500 hidden sm:inline">{t('Modules')} /</span>
              <span className="truncate font-semibold text-white" title={t(currentModuleTitle)}>{t(currentModuleTitle)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="btn btn-secondary btn-sm px-2.5" title={t('Switch color theme')} aria-label={t('Switch color theme')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
            <span className="badge badge-active hidden sm:inline-flex text-[11px] py-1">
              {t('System Operational')}
            </span>
          </div>
        </header>

        {/* Page Outlet */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="py-4 px-4 sm:px-6 border-t border-white/5 bg-[#0B0F19]/60 text-center text-xs sm:text-sm text-gray-500">
          <p data-localization-skip>
            Designed & Developed by <span className="text-gray-300 font-medium">Moin Uddin</span> © All Rights Reserved.
          </p>
        </footer>
      </div>
    </div>
  );
};
