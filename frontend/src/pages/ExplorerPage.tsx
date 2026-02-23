import { useState, useEffect, useCallback } from 'react';
import {
    Database, Search, ChevronLeft, ChevronRight, AlertTriangle,
    CheckCircle, XCircle, ArrowUpDown, ArrowUp, ArrowDown,
    Eye, X, BarChart3, Activity, Shield,
} from 'lucide-react';
import { explorerAPI } from '../services/api';

interface TickerRow {
    id: number;
    symbol: string;
    name: string;
    exchange: string;
    sector: string | null;
    industry: string | null;
    is_active: boolean;
    last_updated: string | null;
    error_count: number;
    last_error: string | null;
    data_points: number;
    first_date: string | null;
    last_date: string | null;
    signal_count: number;
}

interface TickerDetail {
    ticker: any;
    data_stats: any;
    quality: any;
    recent_ohlcv: any[];
    signals: any[];
}

interface UniverseStats {
    exchanges: Record<string, { active: number; inactive: number }>;
    total_active: number;
    total_inactive: number;
    total_tickers: number;
    total_ohlcv_records: number;
    tickers_with_errors: number;
    active_with_no_data: number;
    data_date_range: { first: string | null; last: string | null };
}

export default function ExplorerPage() {
    const [tickers, setTickers] = useState<TickerRow[]>([]);
    const [universeStats, setUniverseStats] = useState<UniverseStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterExchange, setFilterExchange] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [sortBy, setSortBy] = useState('symbol');
    const [sortDir, setSortDir] = useState('asc');
    const [page, setPage] = useState(1);
    const [perPage] = useState(50);
    const [totalPages, setTotalPages] = useState(0);
    const [total, setTotal] = useState(0);

    // Detail panel
    const [selectedTicker, setSelectedTicker] = useState<TickerDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const loadTickers = useCallback(async () => {
        setLoading(true);
        try {
            const params: any = { page, per_page: perPage, sort_by: sortBy, sort_dir: sortDir };
            if (searchQuery) params.q = searchQuery;
            if (filterExchange) params.exchange = filterExchange;
            if (filterStatus !== 'all') params.status = filterStatus;

            const res = await explorerAPI.listTickers(params);
            setTickers(res.data.tickers);
            setTotal(res.data.total);
            setTotalPages(res.data.total_pages);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [page, perPage, sortBy, sortDir, searchQuery, filterExchange, filterStatus]);

    const loadStats = async () => {
        try {
            const res = await explorerAPI.getUniverseStats();
            setUniverseStats(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => { loadStats(); }, []);
    useEffect(() => { loadTickers(); }, [loadTickers]);

    // Reset page when filters change
    useEffect(() => { setPage(1); }, [searchQuery, filterExchange, filterStatus]);

    const openDetail = async (symbol: string) => {
        setDetailLoading(true);
        try {
            const res = await explorerAPI.getTickerDetail(symbol);
            setSelectedTicker(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setDetailLoading(false);
        }
    };

    const toggleSort = (col: string) => {
        if (sortBy === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(col);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ col }: { col: string }) => {
        if (sortBy !== col) return <ArrowUpDown size={12} style={{ opacity: 0.3 }} />;
        return sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
    };

    const getQualityColor = (score: number) => {
        if (score >= 90) return 'var(--signal-buy)';
        if (score >= 70) return 'var(--warning)';
        return 'var(--signal-sell)';
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Ticker Explorer</h1>
                    <p className="page-subtitle">Browse, search, and verify market data integrity</p>
                </div>
            </div>

            {/* Universe Stats */}
            {universeStats && (
                <div className="stats-grid" style={{ marginBottom: '20px' }}>
                    <div className="stat-card">
                        <div className="stat-label">Total Tickers</div>
                        <div className="stat-value">{universeStats.total_tickers.toLocaleString()}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            <span style={{ color: 'var(--signal-buy)' }}>{universeStats.total_active} active</span>
                            {' · '}
                            <span style={{ color: 'var(--text-muted)' }}>{universeStats.total_inactive} inactive</span>
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-label">OHLCV Records</div>
                        <div className="stat-value">{universeStats.total_ohlcv_records.toLocaleString()}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {universeStats.data_date_range.first || '—'} → {universeStats.data_date_range.last || '—'}
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-label">Data Issues</div>
                        <div className="stat-value" style={{
                            color: universeStats.tickers_with_errors > 0 ? 'var(--warning)' : 'var(--signal-buy)',
                        }}>
                            {universeStats.tickers_with_errors}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            <AlertTriangle size={11} style={{ verticalAlign: 'middle' }} /> tickers with errors
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-label">Missing Data</div>
                        <div className="stat-value" style={{
                            color: universeStats.active_with_no_data > 0 ? 'var(--signal-sell)' : 'var(--signal-buy)',
                        }}>
                            {universeStats.active_with_no_data}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            active tickers with zero OHLCV records
                        </div>
                    </div>
                </div>
            )}

            {/* Exchange breakdown */}
            {universeStats && (
                <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span className="card-title" style={{ marginBottom: 0 }}>
                            <Database size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                            Exchanges
                        </span>
                        {Object.entries(universeStats.exchanges).map(([ex, counts]) => (
                            <div key={ex} style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '6px 14px', background: 'var(--bg-dark)',
                                borderRadius: 'var(--radius-md)', fontSize: '0.85rem',
                            }}>
                                <span style={{ fontWeight: 600 }}>{ex}</span>
                                <span style={{ color: 'var(--signal-buy)' }}>{counts.active}</span>
                                {counts.inactive > 0 && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                        (+{counts.inactive} inactive)
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                        <Search size={16} style={{
                            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                            color: 'var(--text-muted)',
                        }} />
                        <input
                            className="input"
                            placeholder="Search by symbol, name, sector, or industry..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: '36px' }}
                        />
                    </div>

                    <select className="input" style={{ width: '150px' }} value={filterExchange}
                        onChange={(e) => setFilterExchange(e.target.value)}>
                        <option value="">All Exchanges</option>
                        <option value="NYSE">NYSE</option>
                        <option value="NASDAQ">NASDAQ</option>
                        <option value="ETF">ETF</option>
                        <option value="CRYPTO">Crypto</option>
                    </select>

                    <select className="input" style={{ width: '160px' }} value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}>
                        <option value="all">All Status</option>
                        <option value="active">✅ Active</option>
                        <option value="inactive">❌ Inactive</option>
                        <option value="errors">⚠️ With Errors</option>
                        <option value="no_data">🔴 No Data</option>
                    </select>

                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {total.toLocaleString()} results
                    </div>
                </div>
            </div>

            {/* Main Content: Table + Detail Panel side by side */}
            <div style={{ display: 'flex', gap: '20px' }}>

                {/* Table */}
                <div className="card" style={{ flex: selectedTicker ? 1 : 'auto', minWidth: 0, overflow: 'hidden' }}>
                    {loading ? (
                        <div className="loading-screen" style={{ minHeight: '200px' }}>
                            <div className="spinner" />
                        </div>
                    ) : tickers.length === 0 ? (
                        <div className="empty-state">
                            <Database />
                            <h3>No tickers found</h3>
                            <p>Try adjusting your search or filters</p>
                        </div>
                    ) : (
                        <>
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('symbol')}>
                                                Symbol <SortIcon col="symbol" />
                                            </th>
                                            <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('name')}>
                                                Name <SortIcon col="name" />
                                            </th>
                                            <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('exchange')}>
                                                Exchange <SortIcon col="exchange" />
                                            </th>
                                            <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('data_points')}>
                                                Data Points <SortIcon col="data_points" />
                                            </th>
                                            <th>Date Range</th>
                                            <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('signal_count')}>
                                                Signals <SortIcon col="signal_count" />
                                            </th>
                                            <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('error_count')}>
                                                Status <SortIcon col="error_count" />
                                            </th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tickers.map((t) => (
                                            <tr key={t.id} style={{
                                                opacity: t.is_active ? 1 : 0.5,
                                                cursor: 'pointer',
                                            }}
                                                onClick={() => openDetail(t.symbol)}
                                            >
                                                <td>
                                                    <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                                                        {t.symbol}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{
                                                        maxWidth: selectedTicker ? '120px' : '200px',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        fontSize: '0.8rem', color: 'var(--text-secondary)',
                                                    }}>
                                                        {t.name || '—'}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="badge" style={{ background: 'var(--bg-elevated)' }}>{t.exchange}</span>
                                                </td>
                                                <td>
                                                    <span style={{
                                                        fontFamily: 'var(--font-mono)', fontWeight: 600,
                                                        color: t.data_points > 0 ? 'var(--text-primary)' : 'var(--signal-sell)',
                                                    }}>
                                                        {t.data_points.toLocaleString()}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {t.first_date && t.last_date
                                                        ? `${t.first_date} → ${t.last_date}`
                                                        : '—'}
                                                </td>
                                                <td>
                                                    <span style={{
                                                        fontFamily: 'var(--font-mono)',
                                                        color: t.signal_count > 0 ? 'var(--accent-cyan)' : 'var(--text-muted)',
                                                    }}>
                                                        {t.signal_count}
                                                    </span>
                                                </td>
                                                <td>
                                                    {!t.is_active ? (
                                                        <span className="badge badge-sell">Inactive</span>
                                                    ) : t.error_count > 0 ? (
                                                        <span className="badge badge-open" title={t.last_error || ''}>
                                                            ⚠️ {t.error_count} err
                                                        </span>
                                                    ) : t.data_points === 0 ? (
                                                        <span className="badge badge-sell">No Data</span>
                                                    ) : (
                                                        <span className="badge badge-buy">✓ OK</span>
                                                    )}
                                                </td>
                                                <td onClick={(e) => e.stopPropagation()}>
                                                    <button className="btn btn-secondary btn-sm" onClick={() => openDetail(t.symbol)}>
                                                        <Eye size={12} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '16px 0 0', borderTop: '1px solid var(--border-color)', marginTop: '12px',
                            }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Page {page} of {totalPages} · {total.toLocaleString()} tickers
                                </span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="btn btn-secondary btn-sm" disabled={page <= 1}
                                        onClick={() => setPage(p => Math.max(1, p - 1))}>
                                        <ChevronLeft size={14} /> Prev
                                    </button>
                                    <button className="btn btn-secondary btn-sm" disabled={page >= totalPages}
                                        onClick={() => setPage(p => p + 1)}>
                                        Next <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Detail Panel */}
                {(selectedTicker || detailLoading) && (
                    <div className="card" style={{
                        width: '420px', flexShrink: 0, position: 'sticky', top: '24px',
                        alignSelf: 'flex-start', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
                    }}>
                        {detailLoading ? (
                            <div className="loading-screen" style={{ minHeight: '200px' }}>
                                <div className="spinner" />
                            </div>
                        ) : selectedTicker && (
                            <>
                                {/* Header */}
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                                    marginBottom: '20px',
                                }}>
                                    <div>
                                        <div style={{
                                            fontFamily: 'var(--font-mono)', fontWeight: 800,
                                            fontSize: '1.4rem', color: 'var(--text-bright)',
                                        }}>
                                            {selectedTicker.ticker.symbol}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                            {selectedTicker.ticker.name}
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                            <span className="badge" style={{ background: 'var(--bg-elevated)' }}>
                                                {selectedTicker.ticker.exchange}
                                            </span>
                                            {selectedTicker.ticker.sector && (
                                                <span className="badge" style={{ background: 'var(--bg-elevated)', fontSize: '0.7rem' }}>
                                                    {selectedTicker.ticker.sector}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setSelectedTicker(null)}>
                                        <X size={14} />
                                    </button>
                                </div>

                                {/* Quality Score */}
                                <div style={{
                                    padding: '16px', borderRadius: 'var(--radius-md)',
                                    background: 'var(--bg-dark)', marginBottom: '16px',
                                    border: `1px solid ${getQualityColor(selectedTicker.quality.score)}22`,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.85rem' }}>
                                            <Shield size={16} color={getQualityColor(selectedTicker.quality.score)} />
                                            Data Quality
                                        </span>
                                        <span style={{
                                            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.2rem',
                                            color: getQualityColor(selectedTicker.quality.score),
                                        }}>
                                            {selectedTicker.quality.score}/100
                                        </span>
                                    </div>
                                    <div style={{ height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%', width: `${selectedTicker.quality.score}%`,
                                            background: getQualityColor(selectedTicker.quality.score),
                                            borderRadius: '2px', transition: 'width 0.3s',
                                        }} />
                                    </div>
                                    <div style={{ marginTop: '10px' }}>
                                        {selectedTicker.quality.issues.map((issue: string, i: number) => (
                                            <div key={i} style={{
                                                fontSize: '0.78rem', padding: '3px 0',
                                                color: issue.includes('✅') ? 'var(--signal-buy)' : 'var(--warning)',
                                            }}>
                                                {issue}
                                            </div>
                                        ))}
                                        {selectedTicker.quality.coverage_pct !== undefined && (
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                Coverage: {selectedTicker.quality.coverage_pct}% of expected trading days
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Data Stats */}
                                <div style={{
                                    display: 'grid', gridTemplateColumns: '1fr 1fr',
                                    gap: '10px', marginBottom: '16px',
                                }}>
                                    <div style={{ padding: '10px', background: 'var(--bg-dark)', borderRadius: 'var(--radius-sm)' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Records</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem' }}>
                                            {selectedTicker.data_stats.total_records.toLocaleString()}
                                        </div>
                                    </div>
                                    <div style={{ padding: '10px', background: 'var(--bg-dark)', borderRadius: 'var(--radius-sm)' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg Volume</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem' }}>
                                            {selectedTicker.data_stats.avg_volume
                                                ? (selectedTicker.data_stats.avg_volume > 1e6
                                                    ? `${(selectedTicker.data_stats.avg_volume / 1e6).toFixed(1)}M`
                                                    : selectedTicker.data_stats.avg_volume.toLocaleString())
                                                : '—'}
                                        </div>
                                    </div>
                                    <div style={{ padding: '10px', background: 'var(--bg-dark)', borderRadius: 'var(--radius-sm)' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Price Range</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                                            ${selectedTicker.data_stats.min_close?.toFixed(2)} — ${selectedTicker.data_stats.max_close?.toFixed(2)}
                                        </div>
                                    </div>
                                    <div style={{ padding: '10px', background: 'var(--bg-dark)', borderRadius: 'var(--radius-sm)' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date Range</div>
                                        <div style={{ fontSize: '0.78rem' }}>
                                            {selectedTicker.data_stats.first_date || '—'}
                                            <br />
                                            {selectedTicker.data_stats.last_date || '—'}
                                        </div>
                                    </div>
                                </div>

                                {/* Ticker Meta */}
                                {(selectedTicker.ticker.error_count > 0 || selectedTicker.ticker.last_error) && (
                                    <div style={{
                                        padding: '10px 14px', borderRadius: 'var(--radius-md)',
                                        background: 'var(--signal-sell-bg)', marginBottom: '16px',
                                        fontSize: '0.8rem', color: 'var(--signal-sell)',
                                    }}>
                                        <strong>Errors ({selectedTicker.ticker.error_count}):</strong>{' '}
                                        {selectedTicker.ticker.last_error || 'Unknown error'}
                                    </div>
                                )}

                                {/* Recent OHLCV */}
                                <div style={{ marginBottom: '16px' }}>
                                    <div className="card-title" style={{ marginBottom: '10px' }}>
                                        <BarChart3 size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                                        Recent OHLCV ({selectedTicker.recent_ohlcv.length} records)
                                    </div>
                                    {selectedTicker.recent_ohlcv.length > 0 ? (
                                        <div className="table-container" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>O</th>
                                                        <th>H</th>
                                                        <th>L</th>
                                                        <th>C</th>
                                                        <th>Vol</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {selectedTicker.recent_ohlcv.map((r: any, i: number) => {
                                                        const hasIssue = r.high < r.low || r.close > r.high || r.close < r.low || r.close <= 0;
                                                        return (
                                                            <tr key={i} style={{
                                                                background: hasIssue ? 'var(--signal-sell-bg)' : undefined,
                                                            }}>
                                                                <td style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{r.date}</td>
                                                                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{r.open}</td>
                                                                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{r.high}</td>
                                                                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{r.low}</td>
                                                                <td style={{
                                                                    fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600,
                                                                    color: i > 0 && selectedTicker.recent_ohlcv[i - 1]
                                                                        ? (r.close > selectedTicker.recent_ohlcv[i - 1].close ? 'var(--signal-sell)' : 'var(--signal-buy)')
                                                                        : undefined,
                                                                }}>{r.close}</td>
                                                                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                                    {r.volume ? (r.volume > 1e6 ? `${(r.volume / 1e6).toFixed(1)}M` : Math.round(r.volume).toLocaleString()) : '—'}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>
                                            No OHLCV data available
                                        </div>
                                    )}
                                </div>

                                {/* Signals */}
                                {selectedTicker.signals.length > 0 && (
                                    <div>
                                        <div className="card-title" style={{ marginBottom: '10px' }}>
                                            <Activity size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                                            Signal History ({selectedTicker.signals.length})
                                        </div>
                                        {selectedTicker.signals.map((s: any, i: number) => (
                                            <div key={i} style={{
                                                display: 'flex', gap: '8px', alignItems: 'center',
                                                padding: '6px 0', borderBottom: '1px solid var(--border-color)',
                                                fontSize: '0.8rem',
                                            }}>
                                                <span className={`badge ${s.signal_type === 'BUY' ? 'badge-buy' : 'badge-sell'}`}>
                                                    {s.signal_type}
                                                </span>
                                                <span className={`badge badge-${s.timeframe}`}>{s.timeframe}</span>
                                                <span style={{ fontFamily: 'var(--font-mono)' }}>${s.price?.toFixed(2)}</span>
                                                <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{s.signal_date}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
