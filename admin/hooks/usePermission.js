import { useState, useEffect } from 'react';
import api from '../../api';
import { hasActionPermission } from '../utils/rolePermissions';

export function usePermission() {
  const [adminRole, setAdminRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAdminRole();
  }, []);

  const loadAdminRole = async () => {
    try {
      const adminUser = JSON.parse(localStorage.getItem('adminUser'));
      if (adminUser) {
        const roleResponse = await api.request(`/admin/users/${adminUser.id}/admin-role/`);
        setAdminRole(roleResponse);
      }
    } catch (e) {
      console.error('Failed to load admin role:', e);
    } finally {
      setLoading(false);
    }
  };

  const can = (action) => {
    if (loading) return false;
    const role = adminRole?.role || 'super_admin';
    const permissionLevel = adminRole?.permission_level || 'full';
    return hasActionPermission(role, action, permissionLevel);
  };

  const canView = (action) => can(`view_${action}`);
  const canEdit = (action) => can(`edit_${action}`);
  const canDelete = (action) => can(`delete_${action}`);
  const canCreate = (action) => can(`create_${action}`);

  return {
    adminRole,
    loading,
    can,
    canView,
    canEdit,
    canDelete,
    canCreate
  };
}
