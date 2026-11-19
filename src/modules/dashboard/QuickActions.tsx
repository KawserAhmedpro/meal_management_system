import React from 'react';
import { Card, CardContent } from '../../components/ui/Card';
import { useApp } from '../../context/AppContext';
import {
  UtensilsCrossed,
  ShoppingCart,
  Receipt,
  UserPlus,
  FileBarChart2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const QuickActions: React.FC = () => {
  const { setActiveQuickModal } = useApp();
  const navigate = useNavigate();

  const actions = [
    {
      label: 'Add Meal Entry',
      desc: 'Record member lunch / dinner',
      icon: UtensilsCrossed,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100',
      onClick: () => setActiveQuickModal('meal'),
    },
    {
      label: 'Add Market Expense',
      desc: 'Log grocery / food purchase',
      icon: ShoppingCart,
      color: 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100',
      onClick: () => setActiveQuickModal('expense'),
    },
    {
      label: 'Record Deposit',
      desc: 'Add member meal deposit',
      icon: Receipt,
      color: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
      onClick: () => setActiveQuickModal('deposit'),
    },
    {
      label: 'Add Member',
      desc: 'Register border in room',
      icon: UserPlus,
      color: 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100',
      onClick: () => setActiveQuickModal('member'),
    },
    {
      label: 'Monthly Report',
      desc: 'Export summary or print sheets',
      icon: FileBarChart2,
      color: 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100',
      onClick: () => navigate('/reports'),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
      {actions.map((act, index) => {
        const Icon = act.icon;
        return (
          <Card
            key={index}
            onClick={act.onClick}
            hoverEffect
            className="p-4 border transition-all text-center flex flex-col items-center justify-center group"
          >
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-2.5 transition-transform group-hover:scale-110 ${act.color}`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-bold text-slate-800 tracking-tight">{act.label}</h4>
            <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{act.desc}</p>
          </Card>
        );
      })}
    </div>
  );
};
