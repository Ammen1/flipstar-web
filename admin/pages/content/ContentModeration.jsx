import { useState, useEffect } from 'react';
import { Search, Trash2, TrendingUp, Eye, CheckCircle, XCircle, Flag, Filter } from 'lucide-react';
import api from '../../../api';
import { AlertModal } from '../../components/modal/AlertModal';
import { ContentDetailModal } from '../../components/modal/ContentDetailModal';
import { ReelPreview } from '../../components/ReelPreview';
import { usePermission } from '../../hooks/usePermission';

const TABS = [
  { id: 'all', label: 'All', icon: Filter },
  { id: 'pending', label: 'Pending', icon: Eye },
  { id: 'approved', label: 'Approved', icon: CheckCircle },
  { id: 'removed', label: 'Removed', icon: XCircle },
];

export function ContentModeration({ theme }) {
  const { canDelete } = usePermission();
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', type: 'info', onConfirm: null });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedReelId, setSelectedReelId] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    loadReels();
  }, [page, search, activeTab]);

  const loadReels = async () => {
    try {
      setLoading(true);
      const statusFilter = activeTab !== 'all' ? `&status=${activeTab}` : '';
      const response = await api.request(`/admin/reels/?page=${page}&search=${search}${statusFilter}`);
      setReels(response.reels);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error('Failed to load reels:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReel = async (reelId) => {
    if (!canDelete('content')) {
      setAlertModal({
        isOpen: true,
        title: 'Permission Denied',
        message: 'You do not have permission to delete content',
        type: 'error',
        showCancel: false
      });
      return;
    }
    setAlertModal({
      isOpen: true,
      title: 'Delete Reel',
      message: 'Are you sure you want to delete this reel? This action cannot be undone.',
      type: 'warning',
      showCancel: true,
      onConfirm: async () => {
        await performDeleteReel(reelId);
        setAlertModal({ ...alertModal, isOpen: false });
      }
    });
  };

  const performDeleteReel = async (reelId) => {

    try {
      await api.request(`/admin/reels/${reelId}/delete/`, { method: 'DELETE' });
      loadReels();
    } catch (error) {
      console.error('Failed to delete reel:', error);
    }
  };

  const handleBoostReel = async (reelId) => {
    const amount = prompt('Enter boost amount (votes to add):', '10');
    if (!amount) return;

    try {
      await api.request(`/admin/reels/${reelId}/boost/`, {
        method: 'POST',
        body: JSON.stringify({ amount: parseInt(amount) })
      });
      loadReels();
    } catch (error) {
      console.error('Failed to boost reel:', error);
    }
  };

  const handleViewDetail = (reelId) => {
    setSelectedReelId(reelId);
    setShowDetailModal(true);
  };

  const handleCloseDetail = () => {
    setShowDetailModal(false);
    setSelectedReelId(null);
  };

  const handleModerated = () => {
    loadReels();
  };

  // If a reel is selected, show the full-page detail view instead of the list
  if (showDetailModal && selectedReelId) {
    return (
      <ContentDetailModal
        isOpen={true}
        onClose={handleCloseDetail}
        reelId={selectedReelId}
        theme={theme}
        onModerated={handleModerated}
      />
    );
  }

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
          Content Moderation
        </h1>
        <p style={{
          margin: 0,
          fontSize: 16,
          color: theme.sub,
        }}>
          Review and moderate user-generated content
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        marginBottom: 24,
        display: 'flex',
        gap: 8,
        borderBottom: `1px solid ${theme.border}`,
        paddingBottom: 0,
      }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setPage(1);
              }}
              style={{
                padding: '12px 20px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${isActive ? theme.pri : 'transparent'}`,
                color: isActive ? theme.pri : theme.sub,
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = theme.txt;
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = theme.sub;
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

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
            placeholder="Search by caption, username, or hashtags..."
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

      {/* Reels Grid */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: theme.sub }}>
          Loading reels...
        </div>
      ) : reels.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: theme.sub }}>
          No reels found
        </div>
      ) : (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 24,
            marginBottom: 24,
          }}>
            {reels.map((reel) => (
              <div
                key={reel.id}
                style={{
                  background: theme.card,
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  overflow: 'hidden',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                }}
                onClick={() => handleViewDetail(reel.id)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Thumbnail */}
                <div style={{
                  width: '100%',
                  aspectRatio: '9/16',
                  background: 'linear-gradient(135deg, #1a1a1a, #2a2a2a)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 60,
                  position: 'relative',
                }}>
                  <ReelPreview reel={reel} />
                  {/* Hidden Status Badge */}
                  {reel.is_hidden && (
                    <div style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      padding: '4px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                      background: theme.red + '30',
                      color: theme.red,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}>
                      <XCircle size={12} />
                      Hidden
                    </div>
                  )}
                </div>

                {/* Content */}
                <div style={{ padding: 16 }}>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: theme.txt,
                    marginBottom: 8,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {reel.caption}
                  </div>

                  <div style={{
                    fontSize: 12,
                    color: theme.sub,
                    marginBottom: 12,
                  }}>
                    by @{reel.user.username}
                  </div>

                  {/* Stats */}
                  <div style={{
                    display: 'flex',
                    gap: 16,
                    marginBottom: 12,
                    fontSize: 13,
                    color: theme.sub,
                  }}>
                    <span>❤️ {reel.votes}</span>
                    <span>💬 {reel.comment_count}</span>
                    <span>🔖 {reel.save_count}</span>
                  </div>

                  {/* Actions */}
                  <div style={{
                    display: 'flex',
                    gap: 8,
                  }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBoostReel(reel.id);
                      }}
                      style={{
                        flex: 1,
                        padding: '8px',
                        background: theme.green + '15',
                        border: 'none',
                        borderRadius: 6,
                        color: theme.green,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                      }}
                    >
                      <TrendingUp size={14} />
                      Boost
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteReel(reel.id);
                      }}
                      style={{
                        padding: '8px 12px',
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
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              padding: 16,
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
        </>
      )}

      {/* Alert Modal */}
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




