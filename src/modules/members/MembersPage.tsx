import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import { Member } from '../../types';
import { MemberModal } from './MemberModal';
import { MemberProfileModal } from './MemberProfileModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Edit2,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  Building,
  ArrowUpDown,
} from 'lucide-react';

export const MembersPage: React.FC = () => {
  const { saveMember, deleteMember } = useApp();
  const members = useLiveQuery(() => db.members.filter((m) => !m._isDeleted).toArray(), []) || [];

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFloor, setSelectedFloor] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [sortBy, setSortBy] = useState<'room' | 'name' | 'floor'>('room');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modals state
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<Member | null>(null);
  const [profileMember, setProfileMember] = useState<Member | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [memberToToggle, setMemberToToggle] = useState<Member | null>(null);

  // Distinct floors from data
  const floors = useMemo(() => {
    const list = Array.from(new Set(members.map((m) => m.floor))).filter(Boolean);
    return ['ALL', ...list.sort()];
  }, [members]);

  // Filter and sort members
  const filteredMembers = useMemo(() => {
    return members
      .filter((m) => {
        const matchesSearch =
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.room.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.phone && m.phone.includes(searchQuery));

        const matchesFloor = selectedFloor === 'ALL' || m.floor === selectedFloor;
        const matchesStatus = selectedStatus === 'ALL' || m.status === selectedStatus;

        return matchesSearch && matchesFloor && matchesStatus;
      })
      .sort((a, b) => {
        let valA = a[sortBy] || '';
        let valB = b[sortBy] || '';
        if (sortBy === 'room') {
          // Natural sort for room numbers (e.g. ROOM-101)
          return sortOrder === 'asc'
            ? valA.localeCompare(valB, undefined, { numeric: true })
            : valB.localeCompare(valA, undefined, { numeric: true });
        }
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
  }, [members, searchQuery, selectedFloor, selectedStatus, sortBy, sortOrder]);

  const toggleStatus = async (member: Member) => {
    const newStatus = member.status === 'Active' ? 'Inactive' : 'Active';
    await saveMember({
      ...member,
      status: newStatus,
      updatedAt: Date.now(),
    });
  };

  const handleDeleteConfirm = async () => {
    if (!memberToDelete) return;
    await deleteMember(memberToDelete.id);
    setMemberToDelete(null);
  };

  const handleSort = (field: 'room' | 'name' | 'floor') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-emerald-600" />
            Member Directory
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage student borders, room allocations, active mess status, and member profiles.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            icon={<UserPlus className="w-4 h-4" />}
            onClick={() => {
              setMemberToEdit(null);
              setIsAddEditOpen(true);
            }}
          >
            Add New Member
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by name, room, ID, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 shrink-0">Floor:</span>
            <select
              value={selectedFloor}
              onChange={(e) => setSelectedFloor(e.target.value)}
              className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
            >
              {floors.map((fl) => (
                <option key={fl} value={fl}>
                  {fl === 'ALL' ? 'All Floors' : fl}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 shrink-0">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="Active">Active Only</option>
              <option value="Inactive">Inactive Only</option>
            </select>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 px-2 bg-slate-50 rounded-xl border border-slate-200">
            <span>
              Showing <strong>{filteredMembers.length}</strong> of {members.length}
            </span>
            <span className="font-semibold text-emerald-600">
              {members.filter((m) => m.status === 'Active').length} Active
            </span>
          </div>
        </div>
      </Card>

      {/* Members Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Member ID</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-emerald-600 select-none"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Name</span>
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-emerald-600 select-none"
                  onClick={() => handleSort('room')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Room</span>
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-emerald-600 select-none"
                  onClick={() => handleSort('floor')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Floor</span>
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
                <th className="py-3 px-4">Phone / Contact</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No members found matching your search or filters.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-500">{m.id}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-900">{m.name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                        {m.room}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{m.floor}</td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {m.phone || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => setMemberToToggle(m)}
                        title="Click to toggle Active / Inactive"
                        className="inline-flex items-center"
                      >
                        <Badge
                          variant={m.status === 'Active' ? 'success' : 'neutral'}
                          size="sm"
                          className="cursor-pointer hover:opacity-80"
                        >
                          {m.status === 'Active' ? 'Active' : 'Inactive'}
                        </Badge>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setProfileMember(m)}
                          title="View Profile & Financials"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setMemberToEdit(m);
                            setIsAddEditOpen(true);
                          }}
                          title="Edit Member"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setMemberToDelete(m)}
                          title="Delete Member"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add / Edit Member Modal */}
      <MemberModal
        isOpen={isAddEditOpen}
        onClose={() => setIsAddEditOpen(false)}
        memberToEdit={memberToEdit}
      />

      {/* Member Profile Modal */}
      <MemberProfileModal
        isOpen={!!profileMember}
        onClose={() => setProfileMember(null)}
        member={profileMember}
      />

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={!!memberToDelete}
        onClose={() => setMemberToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Member?"
        message={`Are you sure you want to delete ${memberToDelete?.name} (${memberToDelete?.room})? This will also remove all their associated meal records and deposit transactions.`}
        confirmText="Delete Member"
        variant="danger"
      />

      {/* Confirm Status Toggle Dialog */}
      <ConfirmDialog
        isOpen={!!memberToToggle}
        onClose={() => setMemberToToggle(null)}
        onConfirm={async () => {
          if (!memberToToggle) return;
          await toggleStatus(memberToToggle);
          setMemberToToggle(null);
        }}
        title={`Mark ${memberToToggle?.name} as ${memberToToggle?.status === 'Active' ? 'Inactive' : 'Active'}?`}
        message={`Are you sure you want to change ${memberToToggle?.name}'s status to ${
          memberToToggle?.status === 'Active' ? 'Inactive' : 'Active'
        }? ${
          memberToToggle?.status === 'Active'
            ? 'Inactive members are excluded from daily meal roll calls and active mess lists.'
            : 'Active members will be included in daily meal roll calls and attendance sheets.'
        }`}
        confirmText={`Set as ${memberToToggle?.status === 'Active' ? 'Inactive' : 'Active'}`}
        variant="warning"
      />
    </div>
  );
};
