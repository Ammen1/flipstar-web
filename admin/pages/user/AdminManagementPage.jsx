import { useState, useEffect } from 'react';
import { Shield, UserPlus, UserMinus, Search, Edit, Ban, FileText, Key, Eye, EyeOff } from 'lucide-react';
import api from '../../../api';
import { AlertModal } from '../../components/modal/AlertModal';
import { usePermission } from '../../hooks/usePermission';

// Treat the auto-generated default `<username>@flipstar.app` (and any
// stray `@flipstar.app` placeholder) as "no real email yet". The Email
// column should stay empty until a real email is saved through the
// Edit Credentials flow.
const realEmail = (u) => {
  const email = ((u && u.email) || '').trim();
  if (!email) return '';
  const lower = email.toLowerCase();
  const autoDefault = `${((u && u.username) || '').toLowerCase()}@flipstar.app`;
  if (lower === autoDefault) return '';
  if (lower.endsWith('@flipstar.app')) return '';
  return email;
};

export function AdminManagementPage({ theme }) {
  const { canView, canEdit, canDelete } = usePermission();
  const [users, setUsers] = useState([]);
  const [adminRoles, setAdminRoles] = useState({});
  const [loading, setLoading] = useState(true);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', type: 'info', onConfirm: null });
  const [editModal, setEditModal] = useState({ isOpen: false, userId: null, email: '', password: '', confirmPassword: '', showPassword: false, showConfirmPassword: false });
  const [passwordStrength, setPasswordStrength] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false
  });
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('admins'); // 'admins', 'credentials', or 'logs'
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState({}); // Map of userId -> password
  const [passwordAuthModal, setPasswordAuthModal] = useState({ isOpen: false, userId: null });

  useEffect(() => {
    loadUsers();
  }, [search]);

  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs();
    }
  }, [activeTab, selectedUserId]);

  const loadLogs = async () => {
    try {
      setLogsLoading(true);
      let response;
      if (selectedUserId) {
        response = await api.request(`/admin/users/${selectedUserId}/logs/`);
      } else {
        response = await api.request('/admin/privilege-audit/');
      }
      setLogs(response.logs || []);
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await api.request(`/admin/users/?search=${search}`);
      // Only show admin users (is_staff = True)
      const adminUsers = response.users.filter(u => u.is_staff);
      // Filter by username if search is provided
      const filteredUsers = search 
        ? adminUsers.filter(u => u.username.toLowerCase().includes(search.toLowerCase()))
        : adminUsers;
      setUsers(filteredUsers);
      
      // Load admin roles for staff users
      const rolePromises = filteredUsers
        .map(u => api.request(`/admin/users/${u.id}/admin-role/`).catch(() => null));
      const roles = await Promise.all(rolePromises);
      const roleMap = {};
      filteredUsers.forEach((u, i) => {
        if (roles[i]) roleMap[u.id] = roles[i];
      });
      setAdminRoles(roleMap);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAdmin = async (userId, currentStatus) => {
    setAlertModal({
      isOpen: true,
      title: `${currentStatus ? 'Revoke' : 'Grant'} Admin Privileges`,
      message: `Are you sure you want to ${currentStatus ? 'revoke' : 'grant'} admin privileges for this user?`,
      type: 'warning',
      showCancel: true,
      onConfirm: async () => {
        try {
          await api.request(`/admin/users/${userId}/grant-admin/`, {
            method: 'POST',
            body: JSON.stringify({ action: currentStatus ? 'revoke' : 'grant' })
          });
          loadUsers();
          setAlertModal({ ...alertModal, isOpen: false });
        } catch (error) {
          console.error('Failed to update admin status:', error);
          setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to update admin status', type: 'error' });
        }
      }
    });
  };

  const handleEditCredentials = (userId, email) => {
    setEditModal({ isOpen: true, userId, email, password: '', confirmPassword: '', showPassword: false, showConfirmPassword: false });
    setPasswordStrength({
      length: false,
      uppercase: false,
      lowercase: false,
      number: false,
      special: false
    });
  };

  const validatePassword = (password) => {
    // Password must be at least 8 characters
    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    // Must contain at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    // Must contain at least one lowercase letter
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    // Must contain at least one number
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number';
    }
    // Must contain at least one special character
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return 'Password must contain at least one special character';
    }
    return null;
  };

  const handleSaveCredentials = async () => {
    // Validate email is provided
    if (!editModal.email) {
      setAlertModal({ isOpen: true, title: 'Error', message: 'Email is required', type: 'error' });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editModal.email)) {
      setAlertModal({ isOpen: true, title: 'Error', message: 'Invalid email format', type: 'error' });
      return;
    }

    // Validate password if provided
    if (editModal.password) {
      const passwordError = validatePassword(editModal.password);
      if (passwordError) {
        setAlertModal({ isOpen: true, title: 'Error', message: passwordError, type: 'error' });
        return;
      }

      // Validate password confirmation
      if (editModal.password !== editModal.confirmPassword) {
        setAlertModal({ isOpen: true, title: 'Error', message: 'Passwords do not match', type: 'error' });
        return;
      }
    }

    if (!canEdit('users')) {
      setAlertModal({ isOpen: true, title: 'Permission Denied', message: 'You do not have permission to edit user credentials', type: 'error', showCancel: false });
      return;
    }

    try {
      const body = { email: editModal.email };
      if (editModal.password) {
        body.password = editModal.password;
      }
      await api.request(`/admin/users/${editModal.userId}/update/`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      setEditModal({ isOpen: false, userId: null, email: '', password: '', confirmPassword: '', showPassword: false, showConfirmPassword: false });
      setPasswordStrength({
        length: false,
        uppercase: false,
        lowercase: false,
        number: false,
        special: false
      });
      loadUsers();
      setAlertModal({
        isOpen: true,
        title: 'Credentials Created Successfully',
        message: `Credentials have been ${editModal.email ? 'updated' : 'created'} successfully. The user can now login to the admin panel with email: ${editModal.email}`,
        type: 'success',
        showCancel: false
      });
    } catch (error) {
      console.error('Failed to update credentials:', error);
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to update credentials', type: 'error' });
    }
  };

  const handleBanUser = async (userId, username, currentStatus) => {
    if (!canEdit('users')) {
      setAlertModal({ isOpen: true, title: 'Permission Denied', message: 'You do not have permission to ban users', type: 'error', showCancel: false });
      return;
    }
    const action = currentStatus ? 'ban' : 'unban';
    setAlertModal({
      isOpen: true,
      title: `${action === 'ban' ? 'Ban' : 'Unban'} User`,
      message: `Are you sure you want to ${action} ${username}?`,
      type: 'warning',
      showCancel: true,
      onConfirm: async () => {
        try {
          await api.request(`/admin/users/${userId}/update/`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: !currentStatus })
          });
          loadUsers();
          setAlertModal({ ...alertModal, isOpen: false });
        } catch (error) {
          console.error(`Failed to ${action} user:`, error);
          setAlertModal({ isOpen: true, title: 'Error', message: `Failed to ${action} user`, type: 'error' });
        }
      }
    });
  };

  const handleViewLogs = async (userId) => {
    // Switch to logs tab and filter by user
    setSelectedUserId(userId);
    setActiveTab('logs');
  };

  const handleShowPassword = (userId) => {
    setPasswordAuthModal({ isOpen: true, userId });
  };

  const handlePasswordAuth = async (superadminPassword) => {
    console.log('=== PASSWORD AUTH START ===');
    console.log('Superadmin password provided:', !!superadminPassword);

    try {
      // Verify superadmin password by attempting to re-authenticate
      const currentAdmin = JSON.parse(localStorage.getItem('adminUser'));
      console.log('Current admin from localStorage:', currentAdmin);

      if (!currentAdmin) {
        console.error('No admin user found in localStorage');
        throw new Error('No admin user found');
      }

      console.log('Attempting login with:', currentAdmin.username || currentAdmin.email);

      // Try with username first, then email
      let response;
      if (currentAdmin.username) {
        console.log('Using username:', currentAdmin.username);
        response = await api.request('/auth/login/', {
          method: 'POST',
          body: JSON.stringify({
            username: currentAdmin.username,
            password: superadminPassword
          })
        });
      } else if (currentAdmin.email) {
        console.log('Using email:', currentAdmin.email);
        response = await api.request('/auth/login/', {
          method: 'POST',
          body: JSON.stringify({
            username: currentAdmin.email,
            password: superadminPassword
          })
        });
      } else {
        console.error('No username or email found');
        throw new Error('No username or email found for current admin');
      }

      console.log('Login response:', response);

      if (response.token) {
        console.log('Authentication successful!');
        // Authentication successful - show that password is set
        // Note: We cannot show the actual password for security reasons
        setVisiblePasswords({
          ...visiblePasswords,
          [passwordAuthModal.userId]: 'Password is set (hidden for security)'
        });
        setPasswordAuthModal({ isOpen: false, userId: null });
      } else {
        console.error('No token in response');
        throw new Error('No token returned from login');
      }
    } catch (error) {
      console.error('=== PASSWORD AUTH ERROR ===');
      console.error('Error:', error);
      console.error('Error message:', error.message);
      console.error('Error status:', error.status);
      setAlertModal({
        isOpen: true,
        title: 'Authentication Failed',
        message: 'Invalid superadmin password',
        type: 'error',
        showCancel: false
      });
    }
  };

  const handleToggleSuperuser = async (userId, currentStatus) => {
    setAlertModal({
      isOpen: true,
      title: `${currentStatus ? 'Revoke' : 'Grant'} Superuser Privileges`,
      message: `Are you sure you want to ${currentStatus ? 'revoke' : 'grant'} superuser privileges for this user?`,
      type: 'warning',
      showCancel: true,
      onConfirm: async () => {
        try {
          await api.request(`/admin/users/${userId}/update/`, {
            method: 'PATCH',
            body: JSON.stringify({ is_superuser: !currentStatus })
          });
          loadUsers();
          setAlertModal({ ...alertModal, isOpen: false });
        } catch (error) {
          console.error('Failed to update superuser status:', error);
          setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to update superuser status', type: 'error' });
        }
      }
    });
  };

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
          Admin Management
        </h1>
        <p style={{
          margin: 0,
          fontSize: 16,
          color: theme.sub,
        }}>
          Manage admin users and permissions
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 24,
        borderBottom: `1px solid ${theme.border}`,
        paddingBottom: 0,
      }}>
        <button
          onClick={() => setActiveTab('admins')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'admins' ? theme.pri + '15' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'admins' ? `2px solid ${theme.pri}` : '2px solid transparent',
            borderRadius: '8px 8px 0 0',
            color: activeTab === 'admins' ? theme.pri : theme.sub,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Admins
        </button>
        <button
          onClick={() => setActiveTab('credentials')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'credentials' ? theme.pri + '15' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'credentials' ? `2px solid ${theme.pri}` : '2px solid transparent',
            borderRadius: '8px 8px 0 0',
            color: activeTab === 'credentials' ? theme.pri : theme.sub,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Credentials
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'logs' ? theme.pri + '15' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'logs' ? `2px solid ${theme.pri}` : '2px solid transparent',
            borderRadius: '8px 8px 0 0',
            color: activeTab === 'logs' ? theme.pri : theme.sub,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Logs
        </button>
      </div>

      {/* Search */}
      <div style={{
        marginBottom: 24,
        position: 'relative',
        maxWidth: 400,
      }}>
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
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username..."
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

      {/* Admin Stats */}
      {activeTab === 'admins' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 24,
          marginBottom: 32,
        }}>
          <div style={{
            background: theme.card,
            borderRadius: 12,
            padding: 24,
            border: `1px solid ${theme.border}`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.sub, marginBottom: 8 }}>
              Total Admins
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: theme.pri }}>
              {users.length}
            </div>
          </div>
          <div style={{
            background: theme.card,
            borderRadius: 12,
            padding: 24,
            border: `1px solid ${theme.border}`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.sub, marginBottom: 8 }}>
              Superusers
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: theme.red }}>
              {users.filter(u => u.is_superuser).length}
            </div>
          </div>
        </div>
      )}

      {/* Users List - Admins Tab */}
      {activeTab === 'admins' && (loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: theme.sub }}>
          Loading users...
        </div>
      ) : (
        <div style={{
          background: theme.card,
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: theme.bg }}>
                <th style={headerStyle}>User</th>
                <th style={headerStyle}>Email</th>
                <th style={headerStyle}>Role</th>
                <th style={headerStyle}>Permission Level</th>
                <th style={headerStyle}>Status</th>
                <th style={headerStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.id} style={{
                  borderTop: index > 0 ? `1px solid ${theme.border}` : 'none',
                }}>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: user.is_staff ? theme.pri + '30' : theme.sub + '20',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                      }}>
                        {user.is_staff ? '👑' : '👤'}
                      </div>
                      <div>
                        <div style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: theme.txt,
                        }}>
                          {user.username}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={cellStyle}>
                    <div style={{ fontSize: 13, color: realEmail(user) ? theme.txt : theme.sub }}>
                      {realEmail(user) || '—'}
                    </div>
                  </td>
                  <td style={cellStyle}>
                    {adminRoles[user.id] ? (
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: theme.pri + '20',
                        color: theme.pri,
                        textTransform: 'capitalize',
                      }}>
                        {adminRoles[user.id].role?.replace('_', ' ')}
                      </span>
                    ) : (
                      <span style={{ fontSize: 13, color: theme.sub }}>—</span>
                    )}
                  </td>
                  <td style={cellStyle}>
                    {adminRoles[user.id] ? (
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: theme.blue + '20',
                        color: theme.blue,
                        textTransform: 'capitalize',
                      }}>
                        {adminRoles[user.id].permission_level?.replace('_', ' ')}
                      </span>
                    ) : (
                      <span style={{ fontSize: 13, color: theme.sub }}>—</span>
                    )}
                  </td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {user.is_staff && (
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: theme.pri + '20',
                          color: theme.pri,
                        }}>
                          Admin
                        </span>
                      )}
                      {user.is_superuser && (
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: theme.red + '20',
                          color: theme.red,
                        }}>
                          Superuser
                        </span>
                      )}
                      {!user.is_staff && !user.is_superuser && (
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: theme.sub + '20',
                          color: theme.sub,
                        }}>
                          Regular User
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleEditCredentials(user.id, user.email || '')}
                        style={{
                          padding: '6px 12px',
                          background: theme.blue + '15',
                          border: 'none',
                          borderRadius: 6,
                          color: theme.blue,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Key size={14} />
                        Edit
                      </button>
                      <button
                        onClick={() => handleBanUser(user.id, user.username, user.is_active)}
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
                        <Ban size={14} />
                        {user.is_active ? 'Ban' : 'Unban'}
                      </button>
                      <button
                        onClick={() => handleViewLogs(user.id)}
                        style={{
                          padding: '6px 12px',
                          background: theme.purple + '15',
                          border: 'none',
                          borderRadius: 6,
                          color: theme.purple,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <FileText size={14} />
                        Logs
                      </button>
                      <button
                        onClick={() => handleToggleAdmin(user.id, user.is_staff)}
                        style={{
                          padding: '6px 12px',
                          background: user.is_staff ? theme.orange + '15' : theme.pri + '15',
                          border: 'none',
                          borderRadius: 6,
                          color: user.is_staff ? theme.orange : theme.pri,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {user.is_staff ? <UserMinus size={14} /> : <UserPlus size={14} />}
                        {user.is_staff ? 'Revoke' : 'Grant'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Credentials Tab */}
      {activeTab === 'credentials' && (
        <div style={{
          background: theme.card,
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: theme.bg }}>
                <th style={headerStyle}>User</th>
                <th style={headerStyle}>Email</th>
                <th style={headerStyle}>Password</th>
                <th style={headerStyle}>Role</th>
                <th style={headerStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: theme.sub }}>
                    Loading credentials...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: theme.sub }}>
                    No admin users found
                  </td>
                </tr>
              ) : (
                users.map((user, index) => (
                  <tr key={user.id} style={{
                    borderTop: index > 0 ? `1px solid ${theme.border}` : 'none',
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
                          👑
                        </div>
                        <div>
                          <div style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: theme.txt,
                          }}>
                            {user.username}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <div style={{ fontSize: 13, color: user.email ? theme.txt : theme.sub }}>
                        {user.email || '—'}
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {visiblePasswords[user.id] ? (
                          <span style={{ fontSize: 13, color: theme.txt, fontFamily: 'var(--adm-font-mono)' }}>
                            {visiblePasswords[user.id]}
                          </span>
                        ) : (
                          <span style={{ fontSize: 13, color: theme.sub }}>
                            ••••••••
                          </span>
                        )}
                        <button
                          onClick={() => handleShowPassword(user.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: theme.sub,
                            padding: 4,
                          }}
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                    <td style={cellStyle}>
                      {adminRoles[user.id] ? (
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: theme.pri + '20',
                          color: theme.pri,
                          textTransform: 'capitalize',
                        }}>
                          {adminRoles[user.id].role?.replace('_', ' ')}
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, color: theme.sub }}>—</span>
                      )}
                    </td>
                    <td style={cellStyle}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {realEmail(user) ? (
                          <button
                            onClick={() => handleEditCredentials(user.id, realEmail(user))}
                            style={{
                              padding: '6px 12px',
                              background: theme.blue + '15',
                              border: 'none',
                              borderRadius: 6,
                              color: theme.blue,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Edit size={14} />
                            Edit
                          </button>
                        ) : (
                          <button
                            onClick={() => handleEditCredentials(user.id, '')}
                            style={{
                              padding: '6px 12px',
                              background: theme.green + '15',
                              border: 'none',
                              borderRadius: 6,
                              color: theme.green,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Key size={14} />
                            Create Credential
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div>
          {selectedUserId && (
            <div style={{
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: theme.pri + '10',
              borderRadius: 8,
              border: `1px solid ${theme.pri + '30'}`,
            }}>
              <span style={{ fontSize: 14, color: theme.txt, fontWeight: 600 }}>
                Showing logs for selected user
              </span>
              <button
                onClick={() => setSelectedUserId(null)}
                style={{
                  padding: '6px 12px',
                  background: theme.pri,
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Show All Logs
              </button>
            </div>
          )}
          <div style={{
            background: theme.card,
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.bg }}>
                  <th style={headerStyle}>Timestamp</th>
                  <th style={headerStyle}>Action</th>
                  <th style={headerStyle}>Performed By</th>
                  <th style={headerStyle}>Target User</th>
                  <th style={headerStyle}>Email</th>
                  <th style={headerStyle}>Phone</th>
                  <th style={headerStyle}>Details</th>
                </tr>
              </thead>
              <tbody>
                {logsLoading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: theme.sub }}>
                      Loading logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: theme.sub }}>
                      No activity logs found
                    </td>
                  </tr>
                ) : (
                  logs.map((log, index) => (
                    <tr key={index} style={{
                      borderTop: index > 0 ? `1px solid ${theme.border}` : 'none',
                    }}>
                      <td style={cellStyle}>
                        <div style={{ fontSize: 12, color: theme.txt }}>
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: theme.pri + '20',
                          color: theme.pri,
                          textTransform: 'capitalize',
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <div style={{ fontSize: 13, color: theme.txt }}>
                          {log.performed_by}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        <div style={{ fontSize: 13, color: theme.txt }}>
                          {log.target_user}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        <div style={{ fontSize: 12, color: theme.txt }}>
                          {log.target_user_email || 'N/A'}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        <div style={{ fontSize: 12, color: theme.txt }}>
                          {log.target_user_phone || 'N/A'}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        <div style={{ fontSize: 12, color: theme.sub, maxWidth: 300, wordBreak: 'break-word' }}>
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

      {/* Edit Credentials Modal */}
      {editModal.isOpen && (
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveCredentials();
            }}
            style={{
              background: theme.card || theme.bg,
              padding: 32,
              borderRadius: 16,
              maxWidth: 400,
              width: '90%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              border: `1px solid ${theme.border}`
            }}
          >
            <h2 style={{
              margin: '0 0 24px 0',
              fontSize: 20,
              fontWeight: 700,
              color: theme.txt
            }}>
              {editModal.email ? 'Edit Credentials' : 'Create Credentials'}
            </h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: theme.txt, marginBottom: 8 }}>
                Email
              </label>
              <input
                type="email"
                value={editModal.email}
                onChange={(e) => setEditModal({ ...editModal, email: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  fontSize: 14,
                  background: theme.bg,
                  color: theme.txt,
                  outline: 'none'
                }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: theme.txt, marginBottom: 8 }}>
                New Password (leave blank to keep current)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={editModal.showPassword ? 'text' : 'password'}
                  value={editModal.password}
                  onChange={(e) => {
                    const password = e.target.value;
                    setEditModal({ ...editModal, password });
                    setPasswordStrength({
                      length: password.length >= 8,
                      uppercase: /[A-Z]/.test(password),
                      lowercase: /[a-z]/.test(password),
                      number: /[0-9]/.test(password),
                      special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
                    });
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 48px 12px 12px',
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    fontSize: 14,
                    background: theme.bg,
                    color: theme.txt,
                    outline: 'none',
                    boxShadow: editModal.password && Object.values(passwordStrength).every(v => v) 
                      ? '0 0 0 2px rgba(16, 185, 129, 0.3)' 
                      : 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setEditModal({ ...editModal, showPassword: !editModal.showPassword })}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: theme.sub,
                    padding: 4,
                  }}
                >
                  {editModal.showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {editModal.password && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <div style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: passwordStrength.length ? '#10B981' : theme.border,
                      border: passwordStrength.length ? 'none' : `1px solid ${theme.border}`
                    }} />
                    <span style={{ color: passwordStrength.length ? '#10B981' : theme.sub }}>
                      At least 8 characters
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <div style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: passwordStrength.uppercase ? '#10B981' : theme.border,
                      border: passwordStrength.uppercase ? 'none' : `1px solid ${theme.border}`
                    }} />
                    <span style={{ color: passwordStrength.uppercase ? '#10B981' : theme.sub }}>
                      At least one uppercase letter
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <div style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: passwordStrength.lowercase ? '#10B981' : theme.border,
                      border: passwordStrength.lowercase ? 'none' : `1px solid ${theme.border}`
                    }} />
                    <span style={{ color: passwordStrength.lowercase ? '#10B981' : theme.sub }}>
                      At least one lowercase letter
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <div style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: passwordStrength.number ? '#10B981' : theme.border,
                      border: passwordStrength.number ? 'none' : `1px solid ${theme.border}`
                    }} />
                    <span style={{ color: passwordStrength.number ? '#10B981' : theme.sub }}>
                      At least one number
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <div style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: passwordStrength.special ? '#10B981' : theme.border,
                      border: passwordStrength.special ? 'none' : `1px solid ${theme.border}`
                    }} />
                    <span style={{ color: passwordStrength.special ? '#10B981' : theme.sub }}>
                      At least one special character
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: theme.txt, marginBottom: 8 }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={editModal.showConfirmPassword ? 'text' : 'password'}
                  value={editModal.confirmPassword}
                  onChange={(e) => setEditModal({ ...editModal, confirmPassword: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px 48px 12px 12px',
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    fontSize: 14,
                    background: theme.bg,
                    color: theme.txt,
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setEditModal({ ...editModal, showConfirmPassword: !editModal.showConfirmPassword })}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: theme.sub,
                    padding: 4,
                  }}
                >
                  {editModal.showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setEditModal({ isOpen: false, userId: null, email: '', password: '', confirmPassword: '', showPassword: false, showConfirmPassword: false })}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  color: theme.txt,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '10px 20px',
                  background: theme.pri,
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Password Authentication Modal */}
      {passwordAuthModal.isOpen && (
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const password = e.target.password.value;
              handlePasswordAuth(password);
            }}
            style={{
              background: theme.card || theme.bg,
              padding: 32,
              borderRadius: 16,
              maxWidth: 400,
              width: '90%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              border: `1px solid ${theme.border}`
            }}
          >
            <h2 style={{
              margin: '0 0 24px 0',
              fontSize: 20,
              fontWeight: 700,
              color: theme.txt
            }}>
              Superadmin Authentication
            </h2>
            <p style={{
              margin: '0 0 24px 0',
              fontSize: 14,
              color: theme.sub,
            }}>
              Enter your superadmin password to view this user's password
            </p>
            <div style={{ marginBottom: 24 }}>
              <input
                name="password"
                type="password"
                placeholder="Superadmin password"
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  fontSize: 14,
                  background: theme.bg,
                  color: theme.txt,
                  outline: 'none'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setPasswordAuthModal({ isOpen: false, userId: null })}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  color: theme.txt,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '10px 20px',
                  background: theme.pri,
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Verify
              </button>
            </div>
          </form>
        </div>
      )}

      <AlertModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        showCancel={alertModal.showCancel}
        onConfirm={alertModal.onConfirm}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
      />
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




