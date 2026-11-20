import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  UtensilsCrossed,
  ShoppingCart,
  Receipt,
  FileBarChart2,
  Printer,
  Database,
  Settings,
  ShieldCheck,
  UserCheck,
  X,
  Cloud,
  LogOut,
  ExternalLink,
  Globe,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { settings, isCloudConnected } = useApp();
  const { user, logout } = useAuth();

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/members', label: 'Members', icon: Users },
    { to: '/meals', label: 'Meal Management', icon: UtensilsCrossed },
    { to: '/managers', label: 'Managers & Closures', icon: UserCheck },
    { to: '/expenses', label: 'Market & Expenses', icon: ShoppingCart },
    { to: '/transactions', label: 'Transactions', icon: Receipt },
    { to: '/reports', label: 'Reports', icon: FileBarChart2 },
    { to: '/print', label: 'Print Center', icon: Printer },
    { to: '/backup', label: 'Backup & Restore', icon: Database },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-200 ease-in-out border-r border-slate-800 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Header / Brand */}
        <div className="h-18 px-5 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white flex items-center justify-center font-bold text-lg shadow-sm shadow-emerald-500/20 shrink-0">
              <UtensilsCrossed className="w-5 h-5 text-white" />
            </div>
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold text-white tracking-wide truncate">
                {settings.managerName ? `${settings.managerName}'s Mess` : (settings.messName || 'MEAL SYSTEM')}
              </h1>
              <p className="text-[11px] font-medium text-emerald-400 truncate">
                {settings.hallName || 'Omar Ekushe Hall'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Main Menu
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => {
                  if (window.innerWidth < 1024) onClose();
                }}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/40 font-semibold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}

          <div className="pt-3 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Public Access</span>
            <span className="text-[9px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/40">READ-ONLY</span>
          </div>

          <a
            href={`${import.meta.env.BASE_URL}public`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30 border border-emerald-500/20 transition-all duration-150"
          >
            <div className="flex items-center gap-3">
              <Globe className="w-4 h-4 shrink-0 text-emerald-400" />
              <span className="truncate">Public Member Portal</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          </a>
        </div>

        {/* Footer / Status */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/30 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium text-emerald-400">
              <span className={`w-2 h-2 rounded-full ${isCloudConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {isCloudConnected ? 'Cloud Firestore' : 'Local IndexedDB'}
            </span>
            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-300">
              v1.0 Admin
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <div className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">{isCloudConnected ? 'Multi-Device Sync' : 'Local-First Storage'}</span>
            </div>
            {user && (
              <button
                onClick={logout}
                className="text-slate-400 hover:text-rose-400 p-1 rounded transition"
                title="Sign Out Admin"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
