// Role-based permission mapping for admin panel
// Maps each role to the pages and actions they can access

export const ROLE_PERMISSIONS = {
  super_admin: {
    // Super admin has access to everything
    pages: [
      'dashboard', 'analytics',
      'mobile-app', 'judging', 'reports', 'support',
      'users', 'content', 'master-campaigns', 'campaigns',
      'gifts', 'coins', 'subscriptions', 'charging',
      'notifications', 'admins', 'security-monitoring', 'api-keys', 'security', 'legal', 'logs', 'settings'
    ],
    actions: ['*'] // All actions
  },
  support_agent: {
    pages: [
      'dashboard', 'analytics',
      'users', 'subscriptions', 'support', 'reports'
    ],
    actions: [
      'view_users', 'edit_users',
      'view_subscriptions',
      'view_reports',
      'view_support', 'edit_support'
    ]
  },
  finance_team: {
    pages: [
      'dashboard', 'analytics', 'reports',
      'subscriptions', 'gifts', 'coins'
    ],
    actions: [
      'view_revenue', 'view_payments', 'export_reports',
      'view_subscriptions'
    ]
  },
  content_moderator: {
    pages: [
      'dashboard', 'analytics',
      'users', 'content', 'campaigns', 'master-campaigns'
    ],
    actions: [
      'view_content', 'moderate_content',
      'view_users'
    ]
  }
};

export const PERMISSION_LEVELS = {
  read_only: ['view'],
  edit_only: ['view', 'edit'],
  full: ['view', 'edit', 'delete', 'create']
};

/**
 * Check if a role has access to a specific page
 */
export function hasPageAccess(role, pageId) {
  if (role === 'super_admin') return true;
  const permissions = ROLE_PERMISSIONS[role];
  return permissions?.pages?.includes(pageId) || false;
}

/**
 * Check if a role has permission for a specific action
 */
export function hasActionPermission(role, action, permissionLevel = 'read_only') {
  if (role === 'super_admin') return true;
  const permissions = ROLE_PERMISSIONS[role];
  
  // Check if action is in the role's allowed actions
  if (!permissions?.actions?.includes(action)) return false;
  
  // Check permission level
  const levelPermissions = PERMISSION_LEVELS[permissionLevel] || PERMISSION_LEVELS.read_only;
  
  // If action is a specific action (not a view action), check level
  if (action.startsWith('edit') && !levelPermissions.includes('edit')) return false;
  if (action.startsWith('delete') && !levelPermissions.includes('delete')) return false;
  if (action.startsWith('create') && !levelPermissions.includes('create')) return false;
  
  return true;
}

/**
 * Get allowed pages for a role
 */
export function getAllowedPages(role) {
  if (role === 'super_admin') {
    return ROLE_PERMISSIONS.super_admin.pages;
  }
  return ROLE_PERMISSIONS[role]?.pages || [];
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role) {
  const names = {
    super_admin: 'Super Admin',
    support_agent: 'Support Agent',
    finance_team: 'Finance Team',
    content_moderator: 'Content Moderator'
  };
  return names[role] || role;
}
