import React from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
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
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentModuleTitle = location.pathname.startsWith('/shares')
    ? 'Shares & Annual Account (Issue #5)'
    : 'Member Management (Issue #4)';

  const navItems = [
    { label: 'Member Management', path: '/members', icon: Users, badge: 'Issue #4' },
    { label: 'Shares & Annual Account', path: '/shares', icon: PieChart, badge: 'Issue #5' },
    { label: 'Contributions & Payments', path: '/payments', icon: CreditCard, disabled: true },
    { label: 'Accountant Custody', path: '/custody', icon: Wallet, disabled: true },
    { label: 'Investments', path: '/investments', icon: TrendingUp, disabled: true },
    { label: 'Expenses', path: '/expenses', icon: Receipt, disabled: true },
    { label: 'Reports & Dashboard', path: '/reports', icon: BarChart3, disabled: true },
  ];

  return (
    <div className="flex min-h-screen bg-[#0B0F19] text-gray-100">
      {/* Sidebar */}
      <aside className="w-[270px] bg-[#111827] border-r border-white/10 flex flex-col sticky top-0 h-screen z-50 shrink-0">
        {/* Brand Header */}
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md shadow-blue-500/25 shrink-0">
            <Building2 size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight text-white">
              NS Foundation
            </h1>
            <p className="text-[11px] text-gray-400 font-medium">
              এন এস ফাউন্ডেশন সমবায়
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 flex-1 overflow-y-auto space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 px-3 pt-2 pb-1.5">
            Core Modules
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            if (item.disabled) {
              return (
                <div
                  key={item.path}
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-gray-500 text-xs font-medium cursor-not-allowed opacity-50"
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
        <header className="h-16 border-b border-white/10 bg-[#111827]/75 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">Modules /</span>
            <span className="font-semibold text-white">{currentModuleTitle}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="badge badge-active text-[11px] py-1">
              System Operational
            </span>
          </div>
        </header>

        {/* Page Outlet */}
        <main className="flex-1 p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
