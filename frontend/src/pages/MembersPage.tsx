import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  UserCheck,
  UserX,
  UserMinus,
  Search,
  Plus,
  Edit2,
  Trash2,
  Eye,
  X,
  Phone,
  Mail,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

interface MemberData {
  _id: string;
  memberId: string;
  name: string;
  phone: string;
  email?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DROPPED';
  joinDate: string;
  address?: string;
  notes?: string;
  createdAt: string;
}

interface MemberStats {
  total: number;
  active: number;
  inactive: number;
  dropped: number;
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const MembersPage: React.FC = () => {
  const { user } = useAuth();
  const [members, setMembers] = useState<MemberData[]>([]);
  const [stats, setStats] = useState<MemberStats>({ total: 0, active: 0, inactive: 0, dropped: 0 });
  const [pagination, setPagination] = useState<PaginationMeta>({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);

  // Modals state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showDetailsModal, setShowDetailsModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [selectedMember, setSelectedMember] = useState<MemberData | null>(null);

  // Form states
  const [nextIdPreview, setNextIdPreview] = useState<string>('NSF001');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    status: 'ACTIVE',
    joinDate: new Date().toISOString().split('T')[0],
    address: '',
    notes: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Debounce search effect (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch Members & Stats
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: '10',
        search: debouncedSearch,
        status: statusFilter,
      });

      const [membersRes, statsRes] = await Promise.all([
        apiRequest<MemberData[]>(`/members?${queryParams.toString()}`),
        apiRequest<MemberStats>('/members/stats'),
      ]);

      setMembers(membersRes.data || []);
      if (membersRes.pagination) {
        setPagination(membersRes.pagination);
      }
      setStats(statsRes.data || { total: 0, active: 0, inactive: 0, dropped: 0 });
    } catch (err) {
      console.error('Error loading members:', err);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load next ID preview when opening Add Member modal
  const handleOpenAddModal = async () => {
    setFormError(null);
    setFormData({
      name: '',
      phone: '',
      email: '',
      status: 'ACTIVE',
      joinDate: new Date().toISOString().split('T')[0],
      address: '',
      notes: '',
    });

    try {
      const res = await apiRequest<{ nextId: string }>('/members/next-id');
      setNextIdPreview(res.data.nextId);
    } catch {
      setNextIdPreview('NSF001');
    }

    setShowAddModal(true);
  };

  const handleOpenEditModal = (m: MemberData) => {
    setSelectedMember(m);
    setFormError(null);
    setFormData({
      name: m.name,
      phone: m.phone,
      email: m.email || '',
      status: m.status,
      joinDate: m.joinDate ? m.joinDate.split('T')[0] : '',
      address: m.address || '',
      notes: m.notes || '',
    });
    setShowEditModal(true);
  };

  const handleOpenDetails = (m: MemberData) => {
    setSelectedMember(m);
    setShowDetailsModal(true);
  };

  const handleOpenDelete = (m: MemberData) => {
    setSelectedMember(m);
    setShowDeleteModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await apiRequest('/members', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setShowAddModal(false);
      fetchData();
    } catch (err: unknown) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;
    setFormError(null);
    setSubmitting(true);

    try {
      await apiRequest(`/members/${selectedMember._id}`, {
        method: 'PUT',
        body: JSON.stringify(formData),
      });
      setShowEditModal(false);
      fetchData();
    } catch (err: unknown) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedMember) return;
    setSubmitting(true);

    try {
      await apiRequest(`/members/${selectedMember._id}`, {
        method: 'DELETE',
      });
      setShowDeleteModal(false);
      fetchData();
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const canEdit = user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT' || user?.role === 'SUPER_ADMIN';
  const canDelete = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto pb-10">
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-400">
            <Users size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Membership · Registry</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Member Management
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-400">
            Registry and profiles of cooperative members eligible for distributions and share accounts.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={fetchData}
            className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-blue-400' : 'text-gray-400'} />
            <span>Refresh</span>
          </button>
          {canEdit && (
            <button
              onClick={handleOpenAddModal}
              className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider shrink-0"
            >
              <Plus size={16} />
              <span>Add Member</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards - Standardized Dashboard Glass-Card Design */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Total Registered */}
        <div className="glass-card p-5 border-l-4 border-l-blue-500 hover:border-blue-500/50 transition-all">
          <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Registered</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Users size={18} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">
            {stats.total}
          </p>
          <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
            <span>Society registry</span>
            <span className="text-blue-400 font-semibold">100% recorded</span>
          </div>
        </div>

        {/* Card 2: Active Members */}
        <div className="glass-card p-5 border-l-4 border-l-emerald-500 hover:border-emerald-500/50 transition-all">
          <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
            <span>Active Members</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <UserCheck size={18} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">
            {stats.active}
          </p>
          <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
            <span>Eligible for dividends</span>
            <span className="text-emerald-400 font-semibold">
              {stats.total > 0 ? `${Math.round((stats.active / stats.total) * 100)}% active` : '0%'}
            </span>
          </div>
        </div>

        {/* Card 3: Inactive Members */}
        <div className="glass-card p-5 border-l-4 border-l-amber-500 hover:border-amber-500/50 transition-all">
          <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
            <span>Inactive Members</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <UserMinus size={18} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">
            {stats.inactive}
          </p>
          <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
            <span>Temporarily dormant</span>
            <span className="text-amber-400 font-semibold">
              {stats.total > 0 ? `${Math.round((stats.inactive / stats.total) * 100)}% dormant` : '0%'}
            </span>
          </div>
        </div>

        {/* Card 4: Dropped / Archived */}
        <div className="glass-card p-5 border-l-4 border-l-rose-500 hover:border-rose-500/50 transition-all">
          <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
            <span>Dropped / Archived</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <UserX size={18} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">
            {stats.dropped}
          </p>
          <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
            <span>Released / settled shares</span>
            <span className="text-rose-400 font-semibold">
              {stats.total > 0 ? `${Math.round((stats.dropped / stats.total) * 100)}% settled` : '0%'}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Search input with Debounce */}
        <div className="relative flex-1 min-w-[280px]">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            className="form-input pl-9 text-xs sm:text-sm"
            placeholder="Search by name, phone number, or Member ID (e.g. NSF001)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Status Filter Pills & Count Indicator */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-1.5 items-center flex-wrap">
            {['ALL', 'ACTIVE', 'INACTIVE', 'DROPPED'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                    : 'text-gray-400 hover:text-white bg-slate-900/60 border border-white/5'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="text-xs text-gray-400 flex items-center">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-2" />
            <span>{pagination.total} registered member{pagination.total === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>

      {/* Member Data Table */}
      <div className="table-container glass-card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-16 text-center whitespace-nowrap font-bold">SL NO</th>
              <th className="whitespace-nowrap font-bold">Member ID</th>
              <th className="whitespace-nowrap font-bold">Full Name</th>
              <th className="whitespace-nowrap font-bold">Contact Info</th>
              <th className="whitespace-nowrap font-bold">Status</th>
              <th className="whitespace-nowrap font-bold">Join Date</th>
              <th className="text-right whitespace-nowrap font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-400">
                  <div className="w-8 h-8 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                  <span>Loading members registry...</span>
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-400">
                  <Users size={32} className="opacity-30 mx-auto mb-3" />
                  <p>No members found matching your search criteria.</p>
                </td>
              </tr>
            ) : (
              members.map((m, idx) => {
                const serialNo = (pagination.page - 1) * pagination.limit + idx + 1;
                const badgeClass =
                  m.status === 'ACTIVE'
                    ? 'badge-active'
                    : m.status === 'INACTIVE'
                    ? 'badge-inactive'
                    : 'badge-dropped';

                return (
                  <tr key={m._id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="text-center font-mono text-xs font-bold text-gray-400">
                      <span className="inline-block px-2 py-0.5 rounded bg-white/5 border border-white/5 text-gray-300">
                        {String(serialNo).padStart(2, '0')}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono font-bold text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/25">
                        {m.memberId}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm">{m.name}</p>
                          {m.address && (
                            <p className="text-xs text-gray-400 truncate max-w-[200px]">
                              {m.address}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 text-xs text-gray-300">
                          <Phone size={13} className="text-gray-500" />
                          <span>{m.phone}</span>
                        </div>
                        {m.email && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <Mail size={12} className="text-gray-500" />
                            <span>{m.email}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${badgeClass}`}>{m.status}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Calendar size={13} className="text-gray-500" />
                        <span>{new Date(m.joinDate).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          onClick={() => handleOpenDetails(m)}
                          className="btn btn-secondary btn-sm p-1.5"
                          title="View Member Details"
                        >
                          <Eye size={14} />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => handleOpenEditModal(m)}
                            className="btn btn-secondary btn-sm p-1.5"
                            title="Edit Member"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {canDelete && m.status !== 'DROPPED' && (
                          <button
                            onClick={() => handleOpenDelete(m)}
                            className="btn btn-danger btn-sm p-1.5"
                            title="Drop Member"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between text-xs text-gray-400 pt-2">
        <span>
          Showing page <strong className="text-white">{pagination.page}</strong> of{' '}
          <strong className="text-white">{pagination.totalPages}</strong> ({pagination.total} total members)
        </span>

        <div className="flex gap-2">
          <button
            className="btn btn-secondary btn-sm"
            disabled={pagination.page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={16} />
            <span>Previous</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <span>Next</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* MODAL 1: ADD MEMBER */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content p-7">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-white">Register New Member</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Sequential ID assigned: <strong className="text-blue-400 font-mono">{nextIdPreview}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-md"
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 text-xs mb-4">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="form-group mb-0">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Moin Bin Nizam"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="form-group mb-0">
                  <label className="form-label">Phone Number *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. +88017XXXXXXXX"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                <div className="form-group mb-0">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="e.g. member@gmail.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="form-group mb-0">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>

                <div className="form-group mb-0">
                  <label className="form-label">Join Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.joinDate}
                    onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group mb-0">
                <label className="form-label">Address</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Dhaka, Bangladesh"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="form-group mb-0">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Optional reference notes..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? 'Registering...' : 'Register Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT MEMBER */}
      {showEditModal && selectedMember && (
        <div className="modal-overlay">
          <div className="modal-content p-7">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Edit Member {selectedMember.memberId}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Update contact or status information.
                </p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-md"
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 text-xs mb-4">
                {formError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="form-group mb-0">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="form-group mb-0">
                  <label className="form-label">Phone Number</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                <div className="form-group mb-0">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-input"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="form-group mb-0">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="DROPPED">DROPPED</option>
                  </select>
                </div>

                <div className="form-group mb-0">
                  <label className="form-label">Join Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.joinDate}
                    onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group mb-0">
                <label className="form-label">Address</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="form-group mb-0">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: VIEW MEMBER DETAILS */}
      {showDetailsModal && selectedMember && (
        <div className="modal-overlay">
          <div className="modal-content p-7">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm">
                  {selectedMember.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {selectedMember.name}
                  </h3>
                  <span className="font-mono text-xs text-blue-400 font-bold">
                    {selectedMember.memberId}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-md"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-2.5 mt-4 text-xs">
              <div className="flex justify-between items-center p-3.5 rounded-xl bg-slate-900/60 border border-white/5">
                <span className="text-gray-400 font-medium">Membership Status:</span>
                <span className={`badge ${selectedMember.status === 'ACTIVE' ? 'badge-active' : selectedMember.status === 'INACTIVE' ? 'badge-inactive' : 'badge-dropped'}`}>
                  {selectedMember.status}
                </span>
              </div>

              <div className="flex justify-between items-center p-3.5 rounded-xl bg-slate-900/60 border border-white/5">
                <span className="text-gray-400 font-medium">Phone:</span>
                <span className="text-white font-semibold">{selectedMember.phone}</span>
              </div>

              {selectedMember.email && (
                <div className="flex justify-between items-center p-3.5 rounded-xl bg-slate-900/60 border border-white/5">
                  <span className="text-gray-400 font-medium">Email:</span>
                  <span className="text-white font-semibold">{selectedMember.email}</span>
                </div>
              )}

              <div className="flex justify-between items-center p-3.5 rounded-xl bg-slate-900/60 border border-white/5">
                <span className="text-gray-400 font-medium">Join Date:</span>
                <span className="text-white font-semibold">{new Date(selectedMember.joinDate).toLocaleDateString()}</span>
              </div>

              {selectedMember.address && (
                <div className="flex justify-between items-center p-3.5 rounded-xl bg-slate-900/60 border border-white/5">
                  <span className="text-gray-400 font-medium">Address:</span>
                  <span className="text-white font-semibold">{selectedMember.address}</span>
                </div>
              )}

              {selectedMember.notes && (
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5">
                  <span className="text-gray-400 block mb-1 font-medium">Notes:</span>
                  <p className="text-gray-300">{selectedMember.notes}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-5">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={() => setShowDetailsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CONFIRM DELETE / DROP */}
      {showDeleteModal && selectedMember && (
        <div className="modal-overlay">
          <div className="modal-content p-7 max-w-md">
            <h3 className="text-lg font-bold text-red-400 mb-2">
              Confirm Drop Member
            </h3>
            <p className="text-xs text-gray-300 leading-relaxed mb-6">
              Are you sure you want to mark member <strong className="text-white">{selectedMember.name}</strong> ({selectedMember.memberId}) as <strong>DROPPED</strong>?
              This will update their status and create an immutable audit trail entry.
            </p>

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                className="btn btn-danger text-xs"
                onClick={handleDeleteConfirm}
              >
                {submitting ? 'Processing...' : 'Confirm Drop'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
