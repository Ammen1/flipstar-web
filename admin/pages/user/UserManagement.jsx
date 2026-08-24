import { useState, useEffect } from 'react';
import { Search, Edit2, Trash2, Shield, Ban, CheckCircle, XCircle, Crown, UserPlus, Lock, History, Key } from 'lucide-react';
import api from '../../../api';
import { AlertModal } from '../../components/modal/AlertModal';
import { usePermission } from '../../hooks/usePermission';

export function UserManagement({ theme, onAdminGranted }) {
  const { canView, canEdit, canDelete, loading: permissionLoading } = usePermission();
  const [activeTab, setActiveTab] = useState('users'); // users, privileges, audit
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedUser, setSelectedUser] = useState(null);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
  const [privilegeAudit, setPrivilegeAudit] = useState([]);
  const [grantAdminModal, setGrantAdminModal] = useState({ isOpen: false, userId: null, role: 'support_agent', permissionLevel: 'read_only' });

  useEffect(() => {
    loadUsers();
  }, [page, search, activeTab]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await api.request(`/admin/users/?page=${page}&search=${search}`);
      setUsers(response.users);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (userId, currentStatus) => {
    if (!canEdit('users')) {
      window.dispatchEvent(new CustomEvent('admin:permission-denied', { detail: { message: 'You do not have permission to edit users.' } }));
      return;
    }
    try {
      await api.request(`/admin/users/${userId}/update/`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !currentStatus })
      });
      loadUsers();
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  };

  const handleDeleteUser = (userId) => {
    if (!canDelete('users')) {
      window.dispatchEvent(new CustomEvent('admin:permission-denied', { detail: { message: 'You do not have permission to delete users.' } }));
      return;
    }
    setAlertModal({
      isOpen: true,
      title: 'Delete User',
      message: 'Are you sure you want to delete this user? This action cannot be undone.',
      type: 'error',
      onConfirm: async () => {
        try {
          await api.request(`/admin/users/${userId}/delete/`, { method: 'DELETE' });
          loadUsers();
        } catch (error) {
          console.error('Failed to delete user:', error);
        }
      }
    });
  };


  const handleGrantAdmin = async (userId) => {
    if (!canEdit('users')) {
      window.dispatchEvent(new CustomEvent('admin:permission-denied', { detail: { message: 'You do not have permission to grant admin privileges.' } }));
      return;
    }
    setGrantAdminModal({
      isOpen: true,
      userId: userId,
      role: 'support_agent',
      permissionLevel: 'read_only'
    });
  };

  const confirmGrantAdmin = async () => {
    try {
      await api.request(`/admin/users/${grantAdminModal.userId}/grant-admin/`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'grant',
          role: grantAdminModal.role,
          permission_level: grantAdminModal.permissionLevel
        })
      });
      setGrantAdminModal({ isOpen: false, userId: null, role: 'support_agent', permissionLevel: 'read_only' });
      loadUsers();
      // Callback to redirect to AdminManagementPage
      if (onAdminGranted) {
        onAdminGranted();
      }
    } catch (error) {
      console.error('Failed to grant admin:', error);
    }
  };

  const handleRevokeAdmin = async (userId) => {
    if (!canEdit('users')) {
      window.dispatchEvent(new CustomEvent('admin:permission-denied', { detail: { message: 'You do not have permission to revoke admin privileges.' } }));
      return;
    }
    setAlertModal({
      isOpen: true,
      title: 'Revoke Admin Privileges',
      message: 'Are you sure you want to revoke admin privileges from this user?',
      type: 'warning',
      onConfirm: async () => {
        try {
          await api.request(`/admin/users/${userId}/grant-admin/`, {
            method: 'POST',
            body: JSON.stringify({ action: 'revoke' })
          });
          loadUsers();
        } catch (error) {
          console.error('Failed to revoke admin:', error);
        }
      }
    });
  };

  const loadPrivilegeAudit = async () => {
    try {
      setLoading(true);
      const response = await api.request('/admin/privilege-audit/');
      setPrivilegeAudit(response.audit_log || []);
    } catch (error) {
      console.error('Failed to load audit log:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      loadPrivilegeAudit();
    }
  }, [activeTab]);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          margin: 0,
          fontSize: 32,
          fontWeight: 700,
          color: theme.txt,
          marginBottom: 8,
        }}>
          User Management
        </h1>
        <p style={{
          margin: 0,
          fontSize: 16,
          color: theme.sub,
        }}>
          Manage users, subscriptions, and permissions
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 24,
        borderBottom: `1px solid ${theme.border}`,
        paddingBottom: 0,
      }}>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'users' ? theme.pri + '15' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'users' ? `2px solid ${theme.pri}` : '2px solid transparent',
            borderRadius: '8px 8px 0 0',
            color: activeTab === 'users' ? theme.pri : theme.sub,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <UserPlus size={18} />
          Users
        </button>
        <button
          onClick={() => setActiveTab('privileges')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'privileges' ? theme.pri + '15' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'privileges' ? `2px solid ${theme.pri}` : '2px solid transparent',
            borderRadius: '8px 8px 0 0',
            color: activeTab === 'privileges' ? theme.pri : theme.sub,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Shield size={18} />
          Privileges
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'audit' ? theme.pri + '15' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'audit' ? `2px solid ${theme.pri}` : '2px solid transparent',
            borderRadius: '8px 8px 0 0',
            color: activeTab === 'audit' ? theme.pri : theme.sub,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <History size={18} />
          Audit Log
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'users' && (
        <>
          {/* Search Bar */}
          <div style={{
            marginBottom: 24,
            display: 'flex',
            gap: 16,
            alignItems: 'center',
          }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
              <Search size={20} style={{
                position: 'absolute',
                left: 16,
                top: '50%',
                transform: 'translateY(-50%)',
                color: theme.sub,
              }} />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search users by name, email, or username..."
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 48px',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Users Table */}
          <div style={{
            background: theme.card,
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            overflow: 'hidden',
          }}>
            <div style={{
              overflowX: 'auto',
            }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
              }}>
                <thead>
                  <tr style={{ background: theme.bg }}>
                    <th style={headerStyle}>User</th>
                    <th style={headerStyle}>Phone</th>
                    <th style={headerStyle}>Stats</th>
                    <th style={headerStyle}>Status</th>
                    <th style={headerStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: theme.sub }}>
                        Loading users...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: theme.sub }}>
                        No users found
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id} style={{
                        borderTop: `1px solid ${theme.border}`,
                      }}>
                        <td style={cellStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                              width: 40,
                              height: 40,
                              borderRadius: '50%',
                              background: theme.pri + '30',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 18,
                            }}>
                              👤
                            </div>
                            <div>
                              <div style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: theme.txt,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}>
                                {user.username}
                                {user.is_staff && (
                                  <Shield size={14} color={theme.pri} />
                                )}
                              </div>
                              <div style={{
                                fontSize: 12,
                                color: theme.sub,
                              }}>
                                Level {user.level} • {user.xp} XP
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={cellStyle}>
                          <div style={{ fontSize: 13, color: theme.txt }}>
                            {user.phone || '—'}
                          </div>
                        </td>
                        <td style={cellStyle}>
                          <div style={{ fontSize: 13, color: theme.sub }}>
                            {user.reel_count} reels • {user.follower_count} followers
                          </div>
                        </td>
                        <td style={cellStyle}>
                          {user.is_active ? (
                            <CheckCircle size={20} color={theme.green} />
                          ) : (
                            <XCircle size={20} color={theme.red} />
                          )}
                        </td>
                        <td style={cellStyle}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              onClick={() => handleToggleActive(user.id, user.is_active)}
                              style={{
                                padding: '6px 12px',
                                background: user.is_active ? theme.red + '15' : theme.green + '15',
                                border: 'none',
                                borderRadius: 6,
                                color: user.is_active ? theme.red : theme.green,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              {user.is_active ? <Ban size={14} /> : <CheckCircle size={14} />}
                              {user.is_active ? 'Suspend' : 'Activate'}
                            </button>
                            {user.is_staff ? (
                              <button
                                onClick={() => handleRevokeAdmin(user.id)}
                                style={{
                                  padding: '6px 12px',
                                  background: theme.red + '15',
                                  border: 'none',
                                  borderRadius: 6,
                                  color: theme.red,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <Lock size={14} />
                                Revoke Admin
                              </button>
                            ) : (
                              <button
                                onClick={() => handleGrantAdmin(user.id)}
                                style={{
                                  padding: '6px 12px',
                                  background: theme.pri + '15',
                                  border: 'none',
                                  borderRadius: 6,
                                  color: theme.pri,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <Shield size={14} />
                                Grant Admin
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              style={{
                                padding: '6px',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: 6,
                                color: theme.red,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                padding: 16,
                borderTop: `1px solid ${theme.border}`,
                display: 'flex',
                justifyContent: 'center',
                gap: 8,
              }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    padding: '8px 16px',
                    background: page === 1 ? theme.bg : theme.pri,
                    border: 'none',
                    borderRadius: 6,
                    color: page === 1 ? theme.sub : '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Previous
                </button>
                <span style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: theme.txt,
                }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{
                    padding: '8px 16px',
                    background: page === totalPages ? theme.bg : theme.pri,
                    border: 'none',
                    borderRadius: 6,
                    color: page === totalPages ? theme.sub : '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'privileges' && (
        <div style={{
          background: theme.card,
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          padding: 32,
        }}>
          <h2 style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 700,
            color: theme.txt,
            marginBottom: 16,
          }}>
            Current Permission Structure
          </h2>
          <p style={{
            margin: 0,
            fontSize: 14,
            color: theme.sub,
            marginBottom: 24,
          }}>
            Overview of permission classes and their access levels
          </p>

          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{
              padding: 16,
              background: theme.bg,
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Shield size={20} color={theme.pri} />
                <span style={{ fontSize: 16, fontWeight: 600, color: theme.txt }}>
                  IsOwnerOrAdminOrReadOnly
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: theme.sub }}>
                Safe methods (GET, HEAD, OPTIONS) for anyone. Write methods (POST, PUT, PATCH, DELETE) only for resource owners or staff.
              </p>
              <div style={{ marginTop: 12, fontSize: 12, color: theme.sub }}>
                <strong>Applied to:</strong> Reels, Comments, Comment Replies
              </div>
            </div>

            <div style={{
              padding: 16,
              background: theme.bg,
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Lock size={20} color={theme.red} />
                <span style={{ fontSize: 16, fontWeight: 600, color: theme.txt }}>
                  IsAdminUser
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: theme.sub }}>
                Only staff users can access these endpoints.
              </p>
              <div style={{ marginTop: 12, fontSize: 12, color: theme.sub }}>
                <strong>Applied to:</strong> Admin endpoints, Support requests, Charging statistics
              </div>
            </div>

            <div style={{
              padding: 16,
              background: theme.bg,
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Key size={20} color={theme.green} />
                <span style={{ fontSize: 16, fontWeight: 600, color: theme.txt }}>
                  IsAuthenticated
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: theme.sub }}>
                Requires user to be logged in. Additional filtering applied in querysets.
              </p>
              <div style={{ marginTop: 12, fontSize: 12, color: theme.sub }}>
                <strong>Applied to:</strong> User profiles, Gift transactions, Coin transactions
              </div>
            </div>

            <div style={{
              padding: 16,
              background: theme.bg,
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <UserPlus size={20} color={theme.blue} />
                <span style={{ fontSize: 16, fontWeight: 600, color: theme.txt }}>
                  AdminPathGuardMiddleware
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: theme.sub }}>
                Middleware chokepoint that blocks all /api/admin/* requests from non-staff users.
              </p>
              <div style={{ marginTop: 12, fontSize: 12, color: theme.sub }}>
                <strong>Applied to:</strong> All /api/admin/* routes
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div style={{
          background: theme.card,
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          overflow: 'hidden',
        }}>
          <div style={{ padding: 24, borderBottom: `1px solid ${theme.border}` }}>
            <h2 style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: theme.txt,
              marginBottom: 8,
            }}>
              Privilege Audit Log
            </h2>
            <p style={{
              margin: 0,
              fontSize: 14,
              color: theme.sub,
            }}>
              History of privilege grants and revocations
            </p>
          </div>

          <div style={{
            overflowX: 'auto',
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
            }}>
              <thead>
                <tr style={{ background: theme.bg }}>
                  <th style={headerStyle}>Timestamp</th>
                  <th style={headerStyle}>Action</th>
                  <th style={headerStyle}>Target User</th>
                  <th style={headerStyle}>Performed By</th>
                  <th style={headerStyle}>Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: theme.sub }}>
                      Loading audit log...
                    </td>
                  </tr>
                ) : privilegeAudit.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: theme.sub }}>
                      No audit records found
                    </td>
                  </tr>
                ) : (
                  privilegeAudit.map((log) => (
                    <tr key={log.id} style={{
                      borderTop: `1px solid ${theme.border}`,
                    }}>
                      <td style={cellStyle}>
                        <div style={{ fontSize: 13, color: theme.txt }}>
                          {new Date(log.timestamp).toLocaleString()}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 600,
                          background: log.action === 'GRANT' ? theme.green + '20' : theme.red + '20',
                          color: log.action === 'GRANT' ? theme.green : theme.red,
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <div style={{ fontSize: 13, color: theme.txt }}>
                          {log.target_user}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        <div style={{ fontSize: 13, color: theme.sub }}>
                          {log.performed_by}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        <div style={{ fontSize: 13, color: theme.sub }}>
                          {log.details}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AlertModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ isOpen: false })}
        onConfirm={alertModal.onConfirm}
      />

      {/* Grant Admin Modal with Role/Permission Selection */}
      {grantAdminModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: theme.cardBg || theme.bg,
            padding: 32,
            borderRadius: 16,
            maxWidth: 500,
            width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            border: `1px solid ${theme.border}`
          }}>
            <h2 style={{
              margin: '0 0 24px 0',
              fontSize: 20,
              fontWeight: 700,
              color: theme.txt
            }}>
              Grant Admin Privileges
            </h2>

            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 14,
                fontWeight: 600,
                color: theme.txt
              }}>
                Role
              </label>
              <select
                value={grantAdminModal.role}
                onChange={(e) => setGrantAdminModal({ ...grantAdminModal, role: e.target.value })}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: theme.bg,
                  color: theme.txt,
                  fontSize: 14
                }}
              >
                <option value="support_agent">Support Agent</option>
                <option value="finance_team">Finance Team</option>
                <option value="content_moderator">Content Moderator</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 14,
                fontWeight: 600,
                color: theme.txt
              }}>
                Permission Level
              </label>
              <select
                value={grantAdminModal.permissionLevel}
                onChange={(e) => setGrantAdminModal({ ...grantAdminModal, permissionLevel: e.target.value })}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: theme.bg,
                  color: theme.txt,
                  fontSize: 14
                }}
              >
                <option value="read_only">Read Only</option>
                <option value="edit_only">Edit Only</option>
                <option value="full">Full Access</option>
              </select>
            </div>

            <div style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setGrantAdminModal({ isOpen: false, userId: null, role: 'support_agent', permissionLevel: 'read_only' })}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: 'transparent',
                  color: theme.txt,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmGrantAdmin}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: theme.pri,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Grant Privileges
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const headerStyle = {
  padding: '16px',
  textAlign: 'left',
  fontSize: 13,
  fontWeight: 700,
  color: '#78716C',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const cellStyle = {
  padding: '16px',
  fontSize: 14,
};
