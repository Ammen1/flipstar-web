/**
 * Admin sidebar.
 *
 * Presentation only -- the menu, the role filtering, the security badge, the
 * profile and logout actions all behave exactly as before.
 *
 * What changed and why:
 *
 *   active state   was a faint tint that read the same as hover at a glance.
 *                  It now carries a left rail as well, so "where am I" is
 *                  answered by shape rather than by a 4% difference in
 *                  background.
 *
 *   responsive     the sidebar was `position: fixed; width: 240` at every
 *                  size, so on a tablet it took a third of the screen and on
 *                  a phone it covered the content outright. Below 1024px it
 *                  is now a drawer behind a toggle.
 *
 *   focus          keyboard users had no visible focus anywhere. Every
 *                  control is now reachable and visibly focused.
 *
 *   styling        moved from inline styles and mouse handlers to classes, so
 *                  hover and focus are CSS rather than JavaScript setting
 *                  background colours by hand.
 */

import { LogOut, Menu, Monitor, Moon, Sun, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import api from '../../../api';
import { visibleSections } from '../../navigation';
import { buildTokens, MOBILE_BREAKPOINT, SIDEBAR_WIDTH } from '../../tokens';
import { hasPageAccess } from '../../utils/rolePermissions';

export function AdminSidebar({
  theme,
  currentPage,
  onPageChange,
  adminUser,
  onLogout,
  onShowProfile,
  themeMode,
  onThemeModeChange,
}) {
  const userRole = adminUser?.admin_role?.role || 'super_admin';
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const t = buildTokens(theme);
  const sections = visibleSections(hasPageAccess, userRole);

  useEffect(() => {
    loadSecurityStats();
    const interval = setInterval(loadSecurityStats, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const loadSecurityStats = async () => {
    try {
      const response = await api.request('/admin/security-stats/');
      setUnresolvedCount(response.unresolved_count || 0);
    } catch (e) {
      // Non-fatal: the badge is supplementary, and a failed poll should not
      // take the navigation down with it.
    }
  };

  // Close the drawer on navigation. Without this a phone user taps a menu
  // item and lands on the new page with the drawer still covering it.
  const go = (pageId) => {
    onPageChange(pageId);
    setDrawerOpen(false);
  };

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <>
      <SidebarStyles tokens={t} />

      {/* Drawer toggle. Hidden on desktop, where the sidebar is always there. */}
      <button
        type="button"
        className="adm-nav-toggle"
        onClick={() => setDrawerOpen((v) => !v)}
        aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={drawerOpen}
      >
        {drawerOpen ? <X size={19} /> : <Menu size={19} />}
      </button>

      {drawerOpen && (
        <div className="adm-nav-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      <aside className={`adm-nav${drawerOpen ? ' is-open' : ''}`} aria-label="Admin navigation">
        <div className="adm-nav-brand">
          <div className="adm-nav-logo">FS</div>
          <div style={{ minWidth: 0 }}>
            <div className="adm-nav-name">FlipStar</div>
            <div className="adm-nav-role">Admin Panel</div>
          </div>
        </div>

        <nav className="adm-nav-scroll">
          {sections.map((section) => (
            <div key={section.label} className="adm-nav-group">
              <div className="adm-nav-group-label">{section.label}</div>

              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                const showBadge = item.id === 'security-monitoring' && unresolvedCount > 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(item.id)}
                    className={`adm-nav-item${isActive ? ' is-active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    title={item.description || item.label}
                  >
                    <Icon size={17} strokeWidth={isActive ? 2.4 : 2} />
                    <span className="adm-nav-item-label">{item.label}</span>
                    {showBadge && (
                      <span className="adm-nav-badge">
                        {unresolvedCount > 99 ? '99+' : unresolvedCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="adm-nav-foot">
          {onThemeModeChange && (
            <ThemeSwitcher mode={themeMode} onChange={onThemeModeChange} />
          )}

          <button type="button" className="adm-nav-profile" onClick={onShowProfile}>
            <span className="adm-nav-avatar">
              {adminUser?.username?.[0]?.toUpperCase() || 'A'}
            </span>
            <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <span className="adm-nav-username">{adminUser?.username || 'Admin'}</span>
              <span className="adm-nav-viewprofile">
                <User size={11} /> View profile
              </span>
            </span>
          </button>

          <button type="button" className="adm-nav-logout" onClick={onLogout}>
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

/**
 * Appearance control.
 *
 * A segmented three-way rather than a sun/moon toggle, because "system" is a
 * real third state and a two-position switch cannot express it -- a toggle
 * would either hide the option or lie about which is active when the OS
 * decides.
 *
 * aria-pressed rather than colour alone marks the selection, so the current
 * mode is announced rather than merely shown.
 */
function ThemeSwitcher({ mode, onChange }) {
  const options = [
    { id: 'light', Icon: Sun, label: 'Light' },
    { id: 'dark', Icon: Moon, label: 'Dark' },
    { id: 'system', Icon: Monitor, label: 'System' },
  ];

  return (
    <div className="adm-theme-switch" role="group" aria-label="Appearance">
      {options.map(({ id, Icon, label }) => (
        <button
          key={id}
          type="button"
          className={`adm-theme-opt${mode === id ? ' is-on' : ''}`}
          onClick={() => onChange(id)}
          aria-pressed={mode === id}
          title={label}
        >
          <Icon size={14} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function SidebarStyles({ tokens: t }) {
  return (
    <style>{`
      .adm-nav {
        position: fixed; left: 0; top: 0; z-index: 1000;
        width: ${SIDEBAR_WIDTH}px; height: 100dvh;
        display: flex; flex-direction: column;
        background: ${t.navy};
        border-right: 1px solid ${t.navyBorder};
        box-sizing: border-box;
      }

      .adm-nav-brand {
        display: flex; align-items: center; gap: 12px;
        padding: 18px 18px 16px; border-bottom: 1px solid ${t.navyBorder}; flex-shrink: 0;
      }
      .adm-nav-logo {
        width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        background: linear-gradient(135deg, ${t.pri}, ${t.pri}CC);
        color: #fff; font-weight: 800; font-size: 13px;
      }
      .adm-nav-name { font-size: 15.5px; font-weight: 800; color: ${t.navyText}; letter-spacing: -0.02em; }
      .adm-nav-role {
        font-size: 9.5px; font-weight: 700; color: ${t.navySub};
        text-transform: uppercase; letter-spacing: .1em; margin-top: 2px;
      }

      .adm-nav-scroll { flex: 1; overflow-y: auto; padding: 12px 10px; }
      .adm-nav-group { margin-bottom: 16px; }
      .adm-nav-group:last-child { margin-bottom: 0; }
      .adm-nav-group-label {
        font-size: 10px; font-weight: 700; color: ${t.navySub};
        text-transform: uppercase; letter-spacing: .09em; padding: 4px 10px 8px;
      }

      .adm-nav-item {
        position: relative;
        display: flex; align-items: center; gap: 11px;
        width: 100%; box-sizing: border-box;
        padding: 9px 11px; margin-bottom: 2px;
        border: none; border-radius: ${t.radius.sm}px;
        background: transparent; color: ${t.navySub};
        font-size: 13.5px; font-weight: 500; text-align: left; cursor: pointer;
        transition: background .14s ease, color .14s ease;
      }
      .adm-nav-item:hover { background: rgba(255,255,255,0.07); color: ${t.navyText}; }
      .adm-nav-item:focus-visible { outline: 2px solid ${t.pri}; outline-offset: -2px; }
      .adm-nav-item-label {
        flex: 1; min-width: 0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      /* Active reads by shape as well as tint -- a 4% background difference
         is not a reliable "you are here". */
      .adm-nav-item.is-active {
        background: ${t.pri}2E; color: #fff; font-weight: 600;
      }
      .adm-nav-item.is-active::before {
        content: ''; position: absolute; left: 0; top: 50%;
        transform: translateY(-50%);
        width: 3px; height: 18px; border-radius: 0 3px 3px 0; background: ${t.pri};
      }

      .adm-nav-badge {
        flex-shrink: 0; min-width: 18px; padding: 1px 5px; border-radius: 999px;
        background: ${t.danger}; color: #fff;
        font-size: 10px; font-weight: 700; text-align: center; line-height: 16px;
      }

      .adm-nav-foot { flex-shrink: 0; padding: 12px 10px; border-top: 1px solid ${t.navyBorder}; }

      .adm-theme-switch {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px;
        padding: 3px; margin-bottom: 10px;
        background: rgba(255,255,255,0.05); border-radius: ${t.radius.sm}px;
      }
      .adm-theme-opt {
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        padding: 7px 2px; border: none; border-radius: 7px;
        background: transparent; color: ${t.navySub};
        font-size: 9.5px; font-weight: 600; cursor: pointer;
        transition: background .14s ease, color .14s ease;
      }
      .adm-theme-opt:hover { color: ${t.navyText}; background: rgba(255,255,255,0.06); }
      .adm-theme-opt.is-on { background: ${t.pri}; color: #fff; }
      .adm-theme-opt:focus-visible { outline: 2px solid ${t.pri}; outline-offset: 2px; }
      .adm-nav-profile {
        display: flex; align-items: center; gap: 10px; width: 100%;
        padding: 8px 9px; margin-bottom: 6px;
        background: transparent; border: none; border-radius: ${t.radius.sm}px;
        cursor: pointer; transition: background .14s ease;
      }
      .adm-nav-profile:hover { background: rgba(255,255,255,0.07); }
      .adm-nav-avatar {
        width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        background: ${t.pri}33; color: #fff; font-size: 12.5px; font-weight: 700;
      }
      .adm-nav-username {
        display: block; font-size: 13px; font-weight: 600; color: ${t.navyText};
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .adm-nav-viewprofile {
        display: flex; align-items: center; gap: 4px;
        font-size: 10.5px; color: ${t.navySub}; margin-top: 1px;
      }
      .adm-nav-logout {
        display: flex; align-items: center; justify-content: center; gap: 7px;
        width: 100%; padding: 8px; border-radius: ${t.radius.sm}px;
        background: transparent; border: 1px solid ${t.navyBorder};
        color: ${t.navySub}; font-size: 12.5px; font-weight: 600; cursor: pointer;
        transition: background .14s ease, color .14s ease, border-color .14s ease;
      }
      .adm-nav-logout:hover {
        background: ${t.danger}14; border-color: ${t.danger}59; color: ${t.danger};
      }

      /* ── Drawer below 1024px ────────────────────────────────────────── */
      .adm-nav-toggle { display: none; }
      .adm-nav-scrim { display: none; }

      @media (max-width: ${MOBILE_BREAKPOINT}px) {
        .adm-nav {
          transform: translateX(-100%);
          transition: transform .22s cubic-bezier(.22,1,.36,1);
          box-shadow: 8px 0 32px rgba(0,0,0,.5);
        }
        .adm-nav.is-open { transform: translateX(0); }

        .adm-nav-toggle {
          position: fixed; top: 14px; left: 14px; z-index: 1002;
          display: inline-flex; align-items: center; justify-content: center;
          width: 40px; height: 40px; border-radius: ${t.radius.sm}px;
          background: ${t.navy}; border: 1px solid ${t.navyBorder};
          color: ${t.navyText}; cursor: pointer;
        }
        .adm-nav-toggle:focus-visible { outline: 2px solid ${t.pri}; outline-offset: 2px; }

        .adm-nav-scrim {
          display: block; position: fixed; inset: 0; z-index: 999;
          background: rgba(0,0,0,.6);
          animation: adm-fade .16s ease both;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .adm-nav, .adm-nav-item, .adm-nav-profile, .adm-nav-logout { transition: none; }
      }
    `}</style>
  );
}
