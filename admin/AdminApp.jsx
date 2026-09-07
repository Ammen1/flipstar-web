// Admin App - Complete with Campaign Management
// Force rebuild: 2026-04-07
import { useState, useEffect, useRef } from 'react';
import { AdminDashboard } from './pages/general/AdminDashboard';
import { UserManagement } from './pages/user/UserManagement';
import { ContentModeration } from './pages/content/ContentModeration';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage';
import { SubscriptionManagement } from './pages/financial/SubscriptionManagement';
import { SettingsPage } from './pages/general/SettingsPage';
import { APIKeysPage } from './pages/system/APIKeysPage';
import { SystemLogsPage } from './pages/system/SystemLogsPage';
import { NotificationsPage } from './pages/system/NotificationsPage';
import { AdminManagementPage } from './pages/user/AdminManagementPage';
import { JudgingPortalPage } from './pages/legal/JudgingPortalPage';
import { SecurityMonitoringPage } from './pages/security/SecurityMonitoringPage';
import { CampaignManagementPage } from './pages/campaign/CampaignManagementPage';
import { OrganizationCoinManagementPage } from './pages/coin/OrganizationCoinManagementPage';
import { OrganizationAdminDashboard } from './pages/organization/OrganizationAdminDashboard';
import { OrganizationManagementPage } from './pages/organization/OrganizationManagementPage';
import { MasterCampaignManagementPage } from './pages/campaign/MasterCampaignManagementPage';
import { TypeSpecificScoringConfig } from './pages/campaign/TypeSpecificScoringConfig';
import CampaignThemeManagement from './pages/campaign/CampaignThemeManagement';
import CampaignPostModeration from './pages/campaign/CampaignPostModeration';
import { LeaderboardPage } from './pages/legal/LeaderboardPage';
import { AdminSidebar } from './components/layout/AdminSidebar';
import { AdminStyles } from './AdminStyles';
import { buildTokens, MOBILE_BREAKPOINT, SIDEBAR_WIDTH } from './tokens';
import { useThemeMode } from './useThemeMode';
import { AdminLogin } from './pages/general/AdminLogin';
import { ReportsPage } from './pages/support/ReportsPage';
import { SupportRequestsPage } from './pages/support/SupportRequestsPage';
import { SecurityPage } from './pages/security/SecurityPage';
import { LegalDocumentsPage } from './pages/legal/LegalDocumentsPage';
import { MobileAppPage } from './pages/system/MobileAppPage';
import { GiftManagementPage } from './pages/content/GiftManagementPage';
import { CoinManagementPage } from './pages/financial/CoinManagementPage';
import { WithdrawalAnalyticsPage } from './pages/analytics/WithdrawalAnalyticsPage';
import { ChargingDashboard } from './pages/financial/ChargingDashboard';
import CRMWinnersPage from './pages/campaign/CRMWinnersPage';
import { NotAllowedModal } from './components/modal/NotAllowedModal';
import { AdminProfileModal } from './components/modal/AdminProfileModal';
import { hasPageAccess } from './utils/rolePermissions';
import api from '../api';
import { useTheme } from '../contexts/ThemeContext';
import { adminTheme } from './theme';
import { AdminLoading } from './components/layout/AdminStates';
import './admin.css';

export function AdminApp() {
  // Force admin to use admin theme for proper contrast
  // Palette comes from the selected mode. The KEY NAMES are deliberately
  // unchanged: the pages carry 2,327 references to theme.txt, theme.sub,
  // theme.border and friends, so renaming anything here blanks out a thousand
  // styles. New keys are additive.
  const { mode: themeMode, palette, setMode: setThemeMode } = useThemeMode();

  const T = {
    ...palette,
    dark: palette.priHover,
    // `theme.text` is read in 22 places and never existed on this object, so
    // those styles have been resolving to undefined. Aliased rather than
    // hunted down, which would be 22 edits for no behavioural gain.
    text: palette.txt,
    cardBg: palette.card,
  };

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(() => localStorage.getItem('adminCurrentPage') || 'dashboard');
  const [loading, setLoading] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [selectedCampaignType, setSelectedCampaignType] = useState('daily');
  const [selectedCampaignData, setSelectedCampaignData] = useState(null);
  const [adminFont, setAdminFont] = useState('Inter, sans-serif');
  const [notAllowedModal, setNotAllowedModal] = useState({ isOpen: false, message: '' });
  const [adminPageKey, setAdminPageKey] = useState(0);
  const [userRoleKey, setUserRoleKey] = useState(0);
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    checkAdminAuth();
    loadAdminFonts();
  }, []);

  // Global listener: any admin API call returning 403 surfaces the
  // styled "Access Denied" popup. This covers read-only / edit-only
  // admins clicking action buttons across every admin page without
  // needing per-page wiring.
  useEffect(() => {
    const onDenied = (e) => {
      const message = (e && e.detail && e.detail.message) ||
        'You do not have permission to perform this action.';
      setNotAllowedModal({ isOpen: true, message });
    };
    window.addEventListener('admin:permission-denied', onDenied);
    return () => window.removeEventListener('admin:permission-denied', onDenied);
  }, []);

  useEffect(() => {
    localStorage.setItem('adminCurrentPage', currentPage);
  }, [currentPage]);

  // Force page remount when admin user/role changes
  useEffect(() => {
    if (adminUser) {
      setUserRoleKey(prev => prev + 1);
      // Only reset to dashboard if no saved page in localStorage (initial login)
      // On refresh, keep the current page from localStorage
      if (!localStorage.getItem('adminCurrentPage')) {
        setCurrentPage('dashboard');
      }
    }
  }, [adminUser]);

  const handlePageChange = (pageId) => {
    const userRole = adminUser?.admin_role?.role || 'super_admin';

    if (!hasPageAccess(userRole, pageId)) {
      // Log unauthorized page access attempt
      logSecurityEvent('UNAUTHORIZED_PAGE', 'MEDIUM', pageId);

      setNotAllowedModal({
        isOpen: true,
        message: `You do not have permission to access this page. Your role (${userRole.replace('_', ' ')}) does not allow access to this feature.`
      });
      return;
    }

    setCurrentPage(pageId);
  };

  const logSecurityEvent = async (eventType, severity, page) => {
    try {
      await api.request('/admin/security-events/log/', {
        method: 'POST',
        body: JSON.stringify({
          event_type: eventType,
          severity: severity,
          page: page,
          details: `Unauthorized access attempt to ${page}`
        })
      });
    } catch (e) {
      console.error('Failed to log security event:', e);
    }
  };

  const loadAdminFonts = async () => {
    try {
      const settings = await api.request('/settings/public/');
      if (!settings) return;
      const fonts = [
        settings.font_family_primary,
        settings.font_family_secondary,
        settings.font_family_username,
        settings.font_family_caption,
      ].filter((f, i, arr) => f && arr.indexOf(f) === i);
      fonts.forEach(font => {
        if (font && font !== 'Inter' && !document.querySelector(`link[href*="${font.replace(/ /g, '+')}"]`)) {
          const link = document.createElement('link');
          link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/ /g, '+')}:wght@300;400;500;600;700;800;900&display=swap`;
          link.rel = 'stylesheet';
          document.head.appendChild(link);
        }
      });
      const primary = settings.font_family_primary || 'Inter';
      const secondary = settings.font_family_secondary || 'Inter';
      setAdminFont(`"${secondary}", "${primary}", sans-serif`);
      document.documentElement.style.setProperty('--font-primary', `"${primary}", sans-serif`);
      document.documentElement.style.setProperty('--font-secondary', `"${secondary}", sans-serif`);
    } catch (e) {
      console.warn('[Admin] Failed to load platform fonts:', e);
    }
  };

  const checkAdminAuth = async () => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      try {
        api.setAdminToken(token);
        const response = await api.getProfile();
        if (response.user && (response.user.is_staff || response.user?.realm === 'ORGANIZATION')) {
          // Admin roles are a staff concept, exactly as in handleLogin below.
          // Requesting one as an organization account 403s, and the catch
          // would then stamp `super_admin` on it -- so it is skipped rather
          // than caught. Harmless today, because the realm branch returns the
          // organization dashboard before anything reads admin_role, but it
          // leaves a mislabelled role sitting on the account for the next
          // reader to trust.
          if (response.user.is_staff) {
            try {
              const roleResponse = await api.request(`/admin/users/${response.user.id}/admin-role/`);
              response.user.admin_role = roleResponse;
            } catch (e) {
              // If role fetch fails, default to super_admin
              response.user.admin_role = { role: 'super_admin' };
            }
          }
          setAdminUser(response.user);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('adminToken');
        }
      } catch (error) {
        localStorage.removeItem('adminToken');
      }
    }
    setLoading(false);
  };

  const handleLogin = async (email, password) => {
    try {
      const response = await api.login(email, password);
      
      // Two kinds of account reach this console: platform staff, and
      // organization accounts. Both are admitted here and separated below --
      // an organization user is served a different component entirely rather
      // than the staff shell with items hidden.
      const isOrganisationAccount = response.user?.realm === 'ORGANIZATION';

      if (response.user && (response.user.is_staff || isOrganisationAccount)) {
        api.setAdminToken(response.token);

        // Admin roles are a staff concept. Requesting one as an organization
        // account would 403, and the catch below would then mislabel them
        // super_admin -- so it is skipped rather than caught.
        if (response.user.is_staff) {
          try {
            const roleResponse = await api.request(`/admin/users/${response.user.id}/admin-role/`);
            response.user.admin_role = roleResponse;
          } catch (e) {
            response.user.admin_role = { role: 'super_admin' };
          }
        }
        
        setAdminUser(response.user);
        setIsAuthenticated(true);
        return { success: true };
      } else {
        return { success: false, error: 'Access denied. Admin privileges required.' };
      }
    } catch (error) {
      // Surface 429 lockouts with retryAfter so AdminLogin can render a live
      // countdown. Static fallback message used if AdminLogin doesn't handle
      // the countdown itself.
      if (error?.status === 429) {
        const secs = Number(error.retryAfter) || 600;
        return {
          success: false,
          error: 'Too many login attempts. Please wait before trying again.',
          retryAfter: secs,
        };
      }
      // Show remaining attempts if available
      const remaining = error?.data?.attempts_remaining;
      if (typeof remaining === 'number') {
        return { 
          success: false, 
          error: `Invalid credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.` 
        };
      }
      return { success: false, error: error.message || 'Invalid credentials. Please try again.' };
    }
  };

  const handleLogout = () => {
    api.setAdminToken(null);
    setIsAuthenticated(false);
    setAdminUser(null);
    setCurrentPage('dashboard');
    setUserRoleKey(prev => prev + 1);
    localStorage.removeItem('adminCurrentPage');
  };

  if (loading) {
    return (
      <div className="admin-root" style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: T.bg,
        fontFamily: adminFont,
      }}>
        <AdminLoading label="Loading admin panel..." size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin onLogin={handleLogin} theme={T} />;
  }

  // An organization account gets its own dashboard, returned before the staff
  // shell is constructed. Not the staff sidebar with entries hidden: hiding a
  // nav item is a rendering decision, and a user who guessed a page id would
  // still mount the component. Returning early means the Super Admin pages are
  // never instantiated for this account at all.
  //
  // Still not the security boundary -- every endpoint is scoped server-side,
  // and a staff-only route answers 403 whatever this file renders.
  if (adminUser?.realm === 'ORGANIZATION') {
    return <OrganizationAdminDashboard theme={T} user={adminUser} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <AdminDashboard
            theme={T}
            key={userRoleKey}
            adminUser={adminUser}
            onPageChange={handlePageChange}
          />;
      case 'mobile-app':
        return <MobileAppPage theme={T} key={userRoleKey} />;
      case 'users':
        return <UserManagement theme={T} onAdminGranted={() => { setCurrentPage('admins'); setAdminPageKey(prev => prev + 1); }} key={userRoleKey} />;
      case 'content':
        return <ContentModeration theme={T} key={userRoleKey} />;
      case 'analytics':
        return <AnalyticsPage theme={T} key={userRoleKey} />;
      case 'subscriptions':
        return <SubscriptionManagement theme={T} key={userRoleKey} />;
      case 'settings':
        return <SettingsPage theme={T} key={userRoleKey} />;
      case 'api-keys':
        return <APIKeysPage theme={T} key={userRoleKey} />;
      case 'logs':
        return <SystemLogsPage theme={T} key={userRoleKey} />;
      case 'notifications':
        return <NotificationsPage theme={T} key={userRoleKey} />;
      case 'admins':
        return <AdminManagementPage theme={T} key={`${adminPageKey}-${userRoleKey}`} />;
      case 'organization-coins':
        return <OrganizationCoinManagementPage theme={T} key={userRoleKey} />;
      case 'organizations':
        return <OrganizationManagementPage theme={T} key={userRoleKey} />;
      case 'master-campaigns':
        return <MasterCampaignManagementPage theme={T} key={userRoleKey} />;
      case 'campaigns':
        return <CampaignManagementPage theme={T} onManageCampaign={(id, action, type, data) => {
          setSelectedCampaignId(id);
          setSelectedCampaignType(type || 'daily');
          setSelectedCampaignData(data || null);
          if (action === 'scoring') setCurrentPage('campaign-scoring');
          else if (action === 'themes') setCurrentPage('campaign-themes');
          else if (action === 'moderation') setCurrentPage('campaign-moderation');
          else if (action === 'leaderboard') setCurrentPage('leaderboard');
        }} key={userRoleKey} />;
      case 'campaign-scoring':
        return <TypeSpecificScoringConfig
          campaignId={selectedCampaignId}
          campaignType={selectedCampaignType}
          onBack={() => setCurrentPage('campaigns')}
          theme={T}
          key={userRoleKey}
        />;
      case 'campaign-themes':
        return <CampaignThemeManagement campaignId={selectedCampaignId} onBack={() => setCurrentPage('campaigns')} key={userRoleKey} />;
      case 'campaign-moderation':
        return <CampaignPostModeration campaignId={selectedCampaignId} onBack={() => setCurrentPage('campaigns')} key={userRoleKey} />;
      case 'leaderboard':
        return <LeaderboardPage
          campaignId={selectedCampaignId}
          campaign={selectedCampaignData}
          theme={T}
          onBack={() => setCurrentPage('campaigns')}
          key={userRoleKey}
        />;
      case 'judging':
        return <JudgingPortalPage theme={T} key={userRoleKey} />;
      case 'reports':
        return <ReportsPage theme={T} key={userRoleKey} />;
      case 'support':
        return <SupportRequestsPage theme={T} key={userRoleKey} />;
      case 'security-monitoring':
        return <SecurityMonitoringPage theme={T} key={userRoleKey} />;
      case 'security':
        return <SecurityPage theme={T} onNavigate={setCurrentPage} key={userRoleKey} />;
      case 'legal':
        return <LegalDocumentsPage theme={T} key={userRoleKey} />;
      case 'gifts':
        return <GiftManagementPage theme={T} key={userRoleKey} />;
      case 'coins':
        return <CoinManagementPage theme={T} key={userRoleKey} />;
      case 'withdrawal-analytics':
        return <WithdrawalAnalyticsPage theme={T} key={userRoleKey} />;
      case 'charging':
        return <ChargingDashboard theme={T} key={userRoleKey} />;
      case 'crm-winners':
        return <CRMWinnersPage theme={T} key={userRoleKey} />;
      default:
        return <AdminDashboard
            theme={T}
            key={userRoleKey}
            adminUser={adminUser}
            onPageChange={handlePageChange}
          />;
    }
  };

  return (
    <div className="admin-root" style={{
      display: 'flex',
      width: '100vw',
      height: '100vh',
      background: T.bg,
      overflow: 'hidden',
      fontFamily: adminFont,
    }}>
      <AdminStyles tokens={buildTokens(T)} />
      <style>{`
        /* Theme changes ease rather than snap. Scoped to the properties
           that actually change -- a blanket transition-all on a page this
           size costs real frames. */
        .admin-root, .admin-page, .adm-card, .adm-table-wrap, .adm-modal {
          transition: background-color .18s ease, border-color .18s ease;
        }

        /* The content column, sized against the sidebar. Previously a hard
           marginLeft: 240 at every width, so below the drawer breakpoint the
           page was pushed off screen by a sidebar that was no longer there. */
        .admin-page {
          margin-left: ${SIDEBAR_WIDTH}px;
          padding: 32px;
          /* Nothing inside a page may widen the viewport -- a single wide
             table used to make the whole admin scroll sideways. */
          max-width: 100%;
          box-sizing: border-box;
        }
        @media (max-width: ${MOBILE_BREAKPOINT}px) {
          .admin-page { margin-left: 0; padding: 68px 18px 28px; }
        }
        @media (max-width: 560px) {
          .admin-page { padding: 64px 14px 24px; }
        }
      `}</style>

      <AdminSidebar
        theme={T}
        currentPage={currentPage}
        onPageChange={handlePageChange}
        adminUser={adminUser}
        onLogout={handleLogout}
        onShowProfile={() => setShowProfileModal(true)}
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
      />
      <div
        key={currentPage}
        className="admin-page"
        style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
          zIndex: 1,
          background: T.bg,
        }}
      >
        {renderPage()}
      </div>

      <NotAllowedModal
        isOpen={notAllowedModal.isOpen}
        message={notAllowedModal.message}
        onClose={() => setNotAllowedModal({ isOpen: false, message: '' })}
      />

      {showProfileModal && (
        <AdminProfileModal
          adminUser={adminUser}
          onClose={() => setShowProfileModal(false)}
          theme={T}
        />
      )}
    </div>
  );
}



