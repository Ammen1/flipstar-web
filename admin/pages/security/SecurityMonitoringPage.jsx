import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, Filter, Search } from 'lucide-react';
import api from '../../../api';

export function SecurityMonitoringPage({ theme }) {
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ event_type: '', severity: '', is_resolved: '' });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadEvents();
    loadStats();
  }, [page, filter]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page,
        page_size: 50,
        ...filter
      });
      const response = await api.request(`/admin/security-events/?${params}`);
      setEvents(response.events || []);
      setTotal(response.total || 0);
    } catch (error) {
      console.error('Failed to load security events:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.request('/admin/security-stats/');
      setStats(response);
    } catch (error) {
      console.error('Failed to load security stats:', error);
    }
  };

  const resolveEvent = async (eventId) => {
    try {
      await api.request(`/admin/security-events/${eventId}/resolve/`, { method: 'POST' });
      loadEvents();
      loadStats();
    } catch (error) {
      console.error('Failed to resolve event:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.request('/admin/security-events/mark-all-read/', { method: 'POST' });
      loadEvents();
      loadStats();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'LOW': return '#10B981';
      case 'MEDIUM': return '#F59E0B';
      case 'HIGH': return '#EF4444';
      case 'CRITICAL': return '#DC2626';
      default: return '#6B7280';
    }
  };

  const getEventTypeIcon = (eventType) => {
    switch (eventType) {
      case 'UNAUTHORIZED_API':
      case 'UNAUTHORIZED_PAGE':
        return <XCircle size={16} color="#EF4444" />;
      case 'PERMISSION_DENIED':
        return <AlertTriangle size={16} color="#F59E0B" />;
      case 'ADMIN_ACTION':
        return <Shield size={16} color="#3B82F6" />;
      default:
        return <AlertTriangle size={16} color="#6B7280" />;
    }
  };

  return (
    <div style={{ color: theme.txt }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Security Monitoring</h1>
        <p style={{ color: theme.sub, fontSize: 14 }}>Monitor unauthorized access attempts and suspicious activities</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <div style={{
            background: theme.card || theme.bg,
            padding: 20,
            borderRadius: 12,
            border: `1px solid ${theme.border}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Shield size={24} color="#3B82F6" />
              <span style={{ fontSize: 12, color: theme.sub, fontWeight: 600 }}>Total Events</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {stats.events_by_type?.reduce((sum, item) => sum + item.count, 0) || 0}
            </div>
          </div>

          <div style={{
            background: theme.card || theme.bg,
            padding: 20,
            borderRadius: 12,
            border: `1px solid ${theme.border}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <AlertTriangle size={24} color="#EF4444" />
              <span style={{ fontSize: 12, color: theme.sub, fontWeight: 600 }}>Unresolved</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#EF4444' }}>
              {stats.unresolved_count || 0}
            </div>
          </div>

          <div style={{
            background: theme.card || theme.bg,
            padding: 20,
            borderRadius: 12,
            border: `1px solid ${theme.border}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <AlertTriangle size={24} color="#F59E0B" />
              <span style={{ fontSize: 12, color: theme.sub, fontWeight: 600 }}>Last 24h</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {stats.recent_events || 0}
            </div>
          </div>

          <div style={{
            background: theme.card || theme.bg,
            padding: 20,
            borderRadius: 12,
            border: `1px solid ${theme.border}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <AlertTriangle size={24} color="#DC2626" />
              <span style={{ fontSize: 12, color: theme.sub, fontWeight: 600 }}>High Severity</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#DC2626' }}>
              {stats.high_severity_events || 0}
            </div>
          </div>
        </div>
      )}

      {/* Mark All as Read Button */}
      {stats && stats.unresolved_count > 0 && (
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={markAllAsRead}
            style={{
              padding: '10px 20px',
              background: '#10B981',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <CheckCircle size={16} />
            Mark All as Read ({stats.unresolved_count})
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{
        background: theme.card || theme.bg,
        padding: 20,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        marginBottom: 24,
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 12, color: theme.sub, marginBottom: 6 }}>Event Type</label>
          <select
            value={filter.event_type}
            onChange={(e) => setFilter({ ...filter, event_type: e.target.value })}
            style={{
              width: '100%',
              padding: 8,
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              color: theme.txt,
              fontSize: 14
            }}
          >
            <option value="">All Types</option>
            <option value="UNAUTHORIZED_API">Unauthorized API</option>
            <option value="UNAUTHORIZED_PAGE">Unauthorized Page</option>
            <option value="PERMISSION_DENIED">Permission Denied</option>
            <option value="SUSPICIOUS_ACTIVITY">Suspicious Activity</option>
            <option value="ADMIN_ACTION">Admin Action</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 12, color: theme.sub, marginBottom: 6 }}>Severity</label>
          <select
            value={filter.severity}
            onChange={(e) => setFilter({ ...filter, severity: e.target.value })}
            style={{
              width: '100%',
              padding: 8,
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              color: theme.txt,
              fontSize: 14
            }}
          >
            <option value="">All Severities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 12, color: theme.sub, marginBottom: 6 }}>Status</label>
          <select
            value={filter.is_resolved}
            onChange={(e) => setFilter({ ...filter, is_resolved: e.target.value })}
            style={{
              width: '100%',
              padding: 8,
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              color: theme.txt,
              fontSize: 14
            }}
          >
            <option value="">All Status</option>
            <option value="false">Unresolved</option>
            <option value="true">Resolved</option>
          </select>
        </div>

        <button
          onClick={() => setFilter({ event_type: '', severity: '', is_resolved: '' })}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            color: theme.txt,
            fontSize: 14,
            cursor: 'pointer',
            height: 38,
            marginTop: 24
          }}
        >
          Clear Filters
        </button>
      </div>

      {/* Events Table */}
      <div style={{
        background: theme.card || theme.bg,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: theme.sub }}>
            Loading security events...
          </div>
        ) : events.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: theme.sub }}>
            No security events found
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: theme.bg, borderBottom: `1px solid ${theme.border}` }}>
                <th style={{ padding: 12, textAlign: 'left', fontSize: 12, color: theme.sub, fontWeight: 600 }}>Type</th>
                <th style={{ padding: 12, textAlign: 'left', fontSize: 12, color: theme.sub, fontWeight: 600 }}>Severity</th>
                <th style={{ padding: 12, textAlign: 'left', fontSize: 12, color: theme.sub, fontWeight: 600 }}>User</th>
                <th style={{ padding: 12, textAlign: 'left', fontSize: 12, color: theme.sub, fontWeight: 600 }}>IP Address</th>
                <th style={{ padding: 12, textAlign: 'left', fontSize: 12, color: theme.sub, fontWeight: 600 }}>Endpoint/Page</th>
                <th style={{ padding: 12, textAlign: 'left', fontSize: 12, color: theme.sub, fontWeight: 600 }}>Details</th>
                <th style={{ padding: 12, textAlign: 'left', fontSize: 12, color: theme.sub, fontWeight: 600 }}>Time</th>
                <th style={{ padding: 12, textAlign: 'left', fontSize: 12, color: theme.sub, fontWeight: 600 }}>Status</th>
                <th style={{ padding: 12, textAlign: 'left', fontSize: 12, color: theme.sub, fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {getEventTypeIcon(event.event_type)}
                      <span style={{ fontSize: 13 }}>{event.event_type.replace(/_/g, ' ')}</span>
                    </div>
                  </td>
                  <td style={{ padding: 12 }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: `${getSeverityColor(event.severity)}20`,
                      color: getSeverityColor(event.severity)
                    }}>
                      {event.severity}
                    </span>
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>{event.username || 'Anonymous'}</td>
                  <td style={{ padding: 12, fontSize: 13, fontFamily: 'monospace' }}>{event.ip_address || '-'}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{event.endpoint || event.page || '-'}</td>
                  <td style={{ padding: 12, fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.details || '-'}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{new Date(event.timestamp).toLocaleString()}</td>
                  <td style={{ padding: 12 }}>
                    {event.is_resolved ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10B981', fontSize: 13 }}>
                        <CheckCircle size={14} /> Resolved
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#EF4444', fontSize: 13 }}>
                        <XCircle size={14} /> Unresolved
                      </span>
                    )}
                  </td>
                  <td style={{ padding: 12 }}>
                    {!event.is_resolved && (
                      <button
                        onClick={() => resolveEvent(event.id)}
                        style={{
                          padding: '6px 12px',
                          background: '#10B981',
                          border: 'none',
                          borderRadius: 6,
                          color: '#fff',
                          fontSize: 12,
                          cursor: 'pointer'
                        }}
                      >
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {total > 50 && (
          <div style={{
            padding: 16,
            borderTop: `1px solid ${theme.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: 13, color: theme.sub }}>
              Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, total)} of {total}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                style={{
                  padding: '6px 12px',
                  background: page === 1 ? theme.bg : theme.pri,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 6,
                  color: page === 1 ? theme.sub : '#fff',
                  fontSize: 12,
                  cursor: page === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(Math.ceil(total / 50), page + 1))}
                disabled={page >= Math.ceil(total / 50)}
                style={{
                  padding: '6px 12px',
                  background: page >= Math.ceil(total / 50) ? theme.bg : theme.pri,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 6,
                  color: page >= Math.ceil(total / 50) ? theme.sub : '#fff',
                  fontSize: 12,
                  cursor: page >= Math.ceil(total / 50) ? 'not-allowed' : 'pointer'
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
