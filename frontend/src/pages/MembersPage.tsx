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
      setPage(1); // Reset to page 1 on new search
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

  // Submit Add Member
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

  // Submit Edit Member
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

  // Confirm Delete / Drop
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
    <div>
      {/* Header & Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
            Member Management
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '4px' }}>
            Registry and profiles of cooperative members eligible for distributions and share accounts.
          </p>
        </div>

        {canEdit && (
          <button onClick={handleOpenAddModal} className="btn btn-primary">
            <Plus size={18} />
            <span>Add Member</span>
          </button>
        )}
      </div>

      {/* KPI Stats Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '20px',
          marginBottom: '28px',
        }}
      >
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              TOTAL REGISTERED
            </span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', color: '#60A5FA' }}>
              <Users size={20} />
            </div>
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', marginTop: '12px' }}>
            {stats.total}
          </p>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Total society members</span>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              ACTIVE MEMBERS
            </span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', color: '#34D399' }}>
              <UserCheck size={20} />
            </div>
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: '#34D399', marginTop: '12px' }}>
            {stats.active}
          </p>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Eligible for shares & dividends</span>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              INACTIVE MEMBERS
            </span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', color: '#FBBF24' }}>
              <UserMinus size={20} />
            </div>
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: '#FBBF24', marginTop: '12px' }}>
            {stats.inactive}
          </p>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Temporarily dormant</span>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              DROPPED / ARCHIVED
            </span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', color: '#F87171' }}>
              <UserX size={20} />
            </div>
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: '#F87171', marginTop: '12px' }}>
            {stats.dropped}
          </p>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Released / settled shares</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        {/* Search input with Debounce */}
        <div style={{ position: 'relative', minWidth: '320px', flex: 1 }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-subtle)',
            }}
          />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '40px' }}
            placeholder="Search by name, phone number, or Member ID (e.g. NSF001)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Status Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {['ALL', 'ACTIVE', 'INACTIVE', 'DROPPED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '9999px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                transition: 'all 0.2s ease',
                background: statusFilter === st ? 'var(--primary)' : 'rgba(255, 255, 255, 0.06)',
                color: statusFilter === st ? '#ffffff' : 'var(--text-muted)',
              }}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Member Data Table */}
      <div className="table-container glass-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Member ID</th>
              <th>Full Name</th>
              <th>Contact Info</th>
              <th>Status</th>
              <th>Join Date</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      border: '3px solid var(--border)',
                      borderTopColor: 'var(--primary)',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      margin: '0 auto 12px',
                    }}
                  />
                  <span>Loading members registry...</span>
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                  <Users size={32} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
                  <p>No members found matching your search criteria.</p>
                </td>
              </tr>
            ) : (
              members.map((m) => {
                const badgeClass =
                  m.status === 'ACTIVE'
                    ? 'badge-active'
                    : m.status === 'INACTIVE'
                    ? 'badge-inactive'
                    : 'badge-dropped';

                return (
                  <tr key={m._id}>
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          color: '#60A5FA',
                          background: 'rgba(59, 130, 246, 0.1)',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                        }}
                      >
                        {m.memberId}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #4F46E5, #3B82F6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            flexShrink: 0,
                          }}
                        >
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, color: '#ffffff' }}>{m.name}</p>
                          {m.address && (
                            <p style={{ fontSize: '0.725rem', color: 'var(--text-subtle)' }}>
                              {m.address}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem' }}>
                          <Phone size={13} color="var(--text-subtle)" />
                          <span>{m.phone}</span>
                        </div>
                        {m.email && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                            <Mail size={12} />
                            <span>{m.email}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${badgeClass}`}>{m.status}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                        <Calendar size={14} color="var(--text-subtle)" />
                        <span>{new Date(m.joinDate).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          onClick={() => handleOpenDetails(m)}
                          className="btn btn-secondary btn-sm"
                          title="View Member Details"
                        >
                          <Eye size={14} />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => handleOpenEditModal(m)}
                            className="btn btn-secondary btn-sm"
                            title="Edit Member"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {canDelete && m.status !== 'DROPPED' && (
                          <button
                            onClick={() => handleOpenDelete(m)}
                            className="btn btn-danger btn-sm"
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '20px',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
        }}
      >
        <span>
          Showing page <strong style={{ color: '#fff' }}>{pagination.page}</strong> of{' '}
          <strong style={{ color: '#fff' }}>{pagination.totalPages}</strong> ({pagination.total} total members)
        </span>

        <div style={{ display: 'flex', gap: '8px' }}>
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
          <div className="modal-content" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>Register New Member</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', marginTop: '2px' }}>
                  Sequential ID generated: <strong style={{ color: '#60A5FA' }}>{nextIdPreview}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  color: '#F87171',
                  fontSize: '0.85rem',
                  marginBottom: '16px',
                }}
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit}>
              <div className="form-group">
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
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

                <div className="form-group">
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
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

                <div className="form-group">
                  <label className="form-label">Join Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.joinDate}
                    onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Address</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Dhaka, Bangladesh"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Optional reference notes..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
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
          <div className="modal-content" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                  Edit Member {selectedMember.memberId}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                  Update contact or status information.
                </p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  color: '#F87171',
                  fontSize: '0.85rem',
                  marginBottom: '16px',
                }}
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-input"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
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

                <div className="form-group">
                  <label className="form-label">Join Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.joinDate}
                    onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Address</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
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
          <div className="modal-content" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 700,
                  }}
                >
                  {selectedMember.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
                    {selectedMember.name}
                  </h3>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8rem',
                      color: '#60A5FA',
                      fontWeight: 700,
                    }}
                  >
                    {selectedMember.memberId}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
                <span style={{ color: 'var(--text-subtle)', fontSize: '0.85rem' }}>Membership Status:</span>
                <span className={`badge ${selectedMember.status === 'ACTIVE' ? 'badge-active' : selectedMember.status === 'INACTIVE' ? 'badge-inactive' : 'badge-dropped'}`}>
                  {selectedMember.status}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
                <span style={{ color: 'var(--text-subtle)', fontSize: '0.85rem' }}>Phone:</span>
                <span style={{ color: '#fff', fontSize: '0.875rem', fontWeight: 600 }}>{selectedMember.phone}</span>
              </div>

              {selectedMember.email && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
                  <span style={{ color: 'var(--text-subtle)', fontSize: '0.85rem' }}>Email:</span>
                  <span style={{ color: '#fff', fontSize: '0.875rem' }}>{selectedMember.email}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
                <span style={{ color: 'var(--text-subtle)', fontSize: '0.85rem' }}>Join Date:</span>
                <span style={{ color: '#fff', fontSize: '0.875rem' }}>{new Date(selectedMember.joinDate).toLocaleDateString()}</span>
              </div>

              {selectedMember.address && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
                  <span style={{ color: 'var(--text-subtle)', fontSize: '0.85rem' }}>Address:</span>
                  <span style={{ color: '#fff', fontSize: '0.875rem' }}>{selectedMember.address}</span>
                </div>
              )}

              {selectedMember.notes && (
                <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
                  <span style={{ color: 'var(--text-subtle)', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Notes:</span>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{selectedMember.notes}</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                type="button"
                className="btn btn-secondary"
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
          <div className="modal-content" style={{ padding: '28px', maxWidth: '460px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#F87171', marginBottom: '10px' }}>
              Confirm Drop Member
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Are you sure you want to mark member <strong style={{ color: '#fff' }}>{selectedMember.name}</strong> ({selectedMember.memberId}) as <strong>DROPPED</strong>?
              This will update their status and create an immutable audit trail entry.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                className="btn btn-danger"
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
