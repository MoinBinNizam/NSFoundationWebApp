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
  Menu,
  X,
} from 'lucide-react';

import { BrandLogo } from './BrandLogo';

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentModuleTitle = location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/reports')
    ? 'Dashboard & Reports (Issue #11)'
    : location.pathname.startsWith('/expenses')
    ? 'Expense Management (Issue #10)'
    : location.pathname.startsWith('/reinvestments')
    ? 'Project Wallets & Reinvestment (Issue #9)'
    : location.pathname.startsWith('/investments')
    ? 'Investment Management (Issue #8)'
    : location.pathname.startsWith('/custody')
    ? 'Accountant Custody Ledger (Issue #7)'
    : location.pathname.startsWith('/payments')
    ? 'Contributions & Payments (Issue #6)'
    : location.pathname.startsWith('/shares')
    ? 'Shares & Annual Account (Issue #5)'
    : 'Member Management (Issue #4)';

  const navItems = [
    { label: 'Dashboard & Reports', path: '/dashboard', icon: BarChart3, badge: 'Issue #11' },
    { label: 'Member Management', path: '/members', icon: Users, badge: 'Issue #4' },
    { label: 'Shares & Annual Account', path: '/shares', icon: PieChart, badge: 'Issue #5' },
    { label: 'Contributions & Payments', path: '/payments', icon: CreditCard, badge: 'Issue #6' },
    { label: 'Accountant Custody', path: '/custody', icon: Wallet, badge: 'Issue #7' },
    ...(user?.accountantType === 'PRIMARY' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' ? [{ label: 'Investments', path: '/investments', icon: TrendingUp, badge: 'Issue #8' }, { label: 'Project Wallets', path: '/reinvestments', icon: Repeat2, badge: 'Issue #9' }] : []),
    { label: 'Expenses', path: '/expenses', icon: Receipt, badge: 'Issue #10' },
  ];

  return (
    <div className="flex min-h-screen bg-[#0B0F19] text-gray-100">
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - Desktop (fixed) & Mobile (drawer) */}
      <aside
        className={`fixed md:sticky top-0 h-screen z-50 shrink-0 w-[270px] bg-[#111827] border-r border-white/10 flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
            className="md:hidden text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 flex-1 overflow-y-auto space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 px-3 pt-2 pb-1.5">
            Core Modules
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
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/25 text-blue-400 border border-blue-500/30">
                    {item.badge}
                  </span>
                )}
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
              title="Sign Out"
              className="text-gray-400 hover:text-red-400 p-1.5 rounded-md hover:bg-white/5 transition-colors"
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
              className="md:hidden text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5"
              aria-label="Toggle navigation menu"
            >
              <Menu size={20} />
            </button>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 hidden sm:inline">Modules /</span>
              <span className="font-semibold text-white">{currentModuleTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="badge badge-active text-[11px] py-1">
              System Operational
            </span>
          </div>
        </header>

        {/* Page Outlet */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="py-4 px-6 border-t border-white/5 bg-[#0B0F19]/60 text-center text-xl text-gray-500">
          <p>
            Designed & Developed by <span className="text-gray-300 font-medium">Moin Uddin</span> © All Rights Reserved.
          </p>
        </footer>
      </div>
    </div>
  );
};
