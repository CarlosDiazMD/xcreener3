import { useState, useEffect } from 'react';
import {
    Activity, TrendingUp, TrendingDown, BarChart3,
    Database, Bell, BookOpen, RefreshCw,
} from 'lucide-react';
import { dashboardAPI } from '../services/api';

interface Stats {
    total_tickers: number;
    active_tickers: number;
    signals_today: number;
    signals_this_week: number;
    buy_signals_today: number;
    sell_signals_today: number;
    last_data_update: string | null;
    journal_open_trades: number;
    journal_total_pnl: number;
}

interface Signal {
    id: number;
    symbol: string;
    name: string;
    exchange: string;
    signal_type: string;
    timeframe: string;
    signal_date: string;
    price: number;
    rsi: number;
    momentum: number;
    squeeze_on: boolean;
}

export default function DashboardPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [signals, setSignals] = useState<Signal[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        try {
            const [statsRes, signalsRes] = await Promise.all([
                dashboardAPI.getStats(),
                dashboardAPI.getRecentSignals({ limit: 20 }),
            ]);
            setStats(statsRes.data);
            setSignals(signalsRes.data);
        } catch (err) {
            console.error('Failed to load dashboard:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner" style={{ width: 32, height: 32 }} />
                <span>Loading dashboard...</span>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Market overview and recent activity</p>
                </div>
                <button className="btn btn-secondary" onClick={loadData}>
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">Active Tickers</div>
                    <div className="stat-value">{stats?.active_tickers?.toLocaleString() || 0}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <Database size={12} style={{ verticalAlign: 'middle' }} /> of {stats?.total_tickers?.toLocaleString() || 0} total
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Signals Today</div>
                    <div className="stat-value">{stats?.signals_today || 0}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <span className="badge badge-buy">🟢 {stats?.buy_signals_today || 0} Buy</span>
                        <span className="badge badge-sell">🔴 {stats?.sell_signals_today || 0} Sell</span>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Signals This Week</div>
                    <div className="stat-value">{stats?.signals_this_week || 0}</div>
                    <div className="stat-change positive">
                        <Activity size={12} /> Active scanning
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Open Trades</div>
                    <div className="stat-value">{stats?.journal_open_trades || 0}</div>
                    <div className={`stat-change ${(stats?.journal_total_pnl || 0) >= 0 ? 'positive' : 'negative'}`}>
                        {(stats?.journal_total_pnl || 0) >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        ${Math.abs(stats?.journal_total_pnl || 0).toFixed(2)} total P&L
                    </div>
                </div>
            </div>

            {/* Last Update */}
            {stats?.last_data_update && (
                <div style={{
                    fontSize: '0.8rem', color: 'var(--text-muted)',
                    marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                    <div className="pulse" style={{
                        width: 8, height: 8, borderRadius: '50%', background: 'var(--signal-buy)',
                    }} />
                    Last data update: {new Date(stats.last_data_update).toLocaleString()}
                </div>
            )}

            {/* Recent Signals */}
            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">Recent Signals</h2>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Squeeze Momentum + RSI
                    </span>
                </div>

                {signals.length === 0 ? (
                    <div className="empty-state">
                        <BarChart3 />
                        <h3>No signals yet</h3>
                        <p>Run a scan from the Scanner page to detect trading opportunities</p>
                    </div>
                ) : (
                    <div>
                        {signals.map((signal) => (
                            <div key={signal.id} className="signal-row">
                                <span className={`badge ${signal.signal_type === 'BUY' ? 'badge-buy' : 'badge-sell'}`}>
                                    {signal.signal_type}
                                </span>
                                <div>
                                    <div className="signal-symbol">{signal.symbol}</div>
                                    <div className="signal-name">{signal.name}</div>
                                </div>
                                <div className="signal-price" style={{
                                    fontFamily: 'var(--font-mono)',
                                }}>
                                    ${signal.price?.toFixed(2)}
                                </div>
                                <div className="signal-indicator">
                                    <div>RSI: {signal.rsi?.toFixed(1)}</div>
                                    <div>Mom: {signal.momentum?.toFixed(4)}</div>
                                </div>
                                <div>
                                    <span className={`badge badge-${signal.timeframe}`}>{signal.timeframe}</span>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        {signal.exchange}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
