import { X, Lock } from 'lucide-react';

export function NotAllowedModal({ isOpen, onClose, message = 'You do not have permission to access this feature.' }) {
  if (!isOpen) return null;

  return (
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
        background: '#1A1A1A',
        padding: 32,
        borderRadius: 16,
        maxWidth: 400,
        width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        border: '1px solid #333',
        textAlign: 'center'
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px'
        }}>
          <Lock size={32} color="#EF4444" />
        </div>

        <h2 style={{
          margin: '0 0 12px 0',
          fontSize: 20,
          fontWeight: 700,
          color: '#FFFFFF'
        }}>
          Access Denied
        </h2>

        <p style={{
          margin: '0 0 24px 0',
          fontSize: 14,
          color: '#A8A8A8',
          lineHeight: 1.5
        }}>
          {message}
        </p>

        <button
          onClick={onClose}
          style={{
            padding: '12px 24px',
            background: '#2563EB',
            border: 'none',
            borderRadius: 8,
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%'
          }}
        >
          I Understand
        </button>
      </div>
    </div>
  );
}
