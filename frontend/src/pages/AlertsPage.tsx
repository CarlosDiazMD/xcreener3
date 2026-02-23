import { useState, useEffect } from 'react';
import { Bell, Filter } from 'lucide-react';
import { alertsAPI } from '../services/api';

export default function AlertsPage() {
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        alertsAPI.list({ limit: 100 })
            .then(res => setAlerts(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Alerts History</h1>
                    <p className="page-subtitle">All signals sent via Telegram and web</p>
                </div>
            </div>

            <div className="card">
                {loading ? (
                    <div className="loading-screen" style={{ minHeight: '200px' }}>
                        <div className="spinner" />
                    </div>
                ) : alerts.length === 0 ? (
                    <div className="empty-state">
                        <Bell />
                        <h3>No alerts yet</h3>
                        <p>Alerts will appear here after scans detect signals</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Signal</th>
                                    <th>Symbol</th>
                                    <th>Exchange</th>
                                    <th>Price</th>
                                    <th>RSI</th>
                                    <th>Momentum</th>
                                    <th>Timeframe</th>
                                    <th>Channel</th>
                                    <th>Sent At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {alerts.map((a, i) => (
                                    <tr key={i}>
                                        <td>
                                            <span className={`badge ${a.signal_type === 'BUY' ? 'badge-buy' : 'badge-sell'}`}>
                                                {a.signal_type === 'BUY' ? '🟢' : '🔴'} {a.signal_type}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{a.symbol}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.name}</div>
                                        </td>
                                        <td>{a.exchange}</td>
                                        <td style={{ fontFamily: 'var(--font-mono)' }}>${a.price?.toFixed(2)}</td>
                                        <td style={{ fontFamily: 'var(--font-mono)' }}>{a.rsi?.toFixed(1)}</td>
                                        <td style={{
                                            fontFamily: 'var(--font-mono)',
                                            color: a.momentum > 0 ? 'var(--signal-buy)' : 'var(--signal-sell)',
                                        }}>
                                            {a.momentum?.toFixed(4)}
                                        </td>
                                        <td><span className={`badge badge-${a.timeframe}`}>{a.timeframe}</span></td>
                                        <td>
                                            <span className="badge" style={{ background: 'var(--bg-elevated)' }}>
                                                {a.channel === 'telegram' ? '📱' : '🌐'} {a.channel}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            {new Date(a.sent_at).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
