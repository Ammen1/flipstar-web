import { X, Mail, User, Shield } from 'lucide-react';

export function AdminProfileModal({ adminUser, onClose, theme }) {
  if (!adminUser) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.card,
          borderRadius: 16,
          width: '90%',
          maxWidth: 380,
          border: `1px solid ${theme.border}`,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}>
        {/* Header */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h2 style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: theme.txt,
          }}>
            Admin Profile
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.sub,
              cursor: 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = theme.border;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Profile Content */}
        <div style={{ padding: '20px' }}>
          {/* Avatar Section */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 20,
          }}>
            <div style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${theme.pri}, #8fc441)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 800,
              color: '#fff',
              boxShadow: `0 4px 16px ${theme.pri}40`,
            }}>
              {adminUser.username?.[0]?.toUpperCase() || 'A'}
            </div>
            <div>
              <div style={{
                fontSize: 18,
                fontWeight: 700,
                color: theme.txt,
                marginBottom: 2,
              }}>
                {adminUser.username || 'Admin'}
              </div>
              <div style={{
                fontSize: 12,
                color: theme.sub,
                textTransform: 'capitalize',
              }}>
                {adminUser.admin_role?.role?.replace('_', ' ') || 'Super Admin'}
              </div>
            </div>
          </div>

          {/* Info Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Email */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 10,
              background: theme.bg,
              borderRadius: 6,
            }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: `${theme.pri}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.pri,
              }}>
                <Mail size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: theme.sub,
                  marginBottom: 1,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Email
                </div>
                <div style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: theme.txt,
                }}>
                  {adminUser.email || 'N/A'}
                </div>
              </div>
            </div>

            {/* User ID */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 10,
              background: theme.bg,
              borderRadius: 6,
            }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: `${theme.blue}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.blue,
              }}>
                <User size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: theme.sub,
                  marginBottom: 1,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  User ID
                </div>
                <div style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: theme.txt,
                }}>
                  {adminUser.id || 'N/A'}
                </div>
              </div>
            </div>

            {/* Role */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 10,
              background: theme.bg,
              borderRadius: 6,
            }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: `${theme.green}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.green,
              }}>
                <Shield size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: theme.sub,
                  marginBottom: 1,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Role
                </div>
                <div style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: theme.txt,
                  textTransform: 'capitalize',
                }}>
                  {adminUser.admin_role?.role?.replace('_', ' ') || 'Super Admin'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: `1px solid ${theme.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: theme.pri,
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
