import { useState, useEffect, useRef } from 'react';
import { Scan, Play, RefreshCw, Search, Database, Clock } from 'lucide-react';
import { scannerAPI, dashboardAPI } from '../services/api';

export default function ScannerPage() {
    const [signals, setSignals] = useState<any[]>([]);
    const [progress, setProgress] = useState<any>(null);
    const [selectedTimeframe, setSelectedTimeframe] = useState('daily');
    const [filterExchange, setFilterExchange] = useState('');
    const [filterType, setFilterType] = useState('');
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const pollRef = useRef<NodeJS.Timeout | null>(null);

    const loadSignals = async () => {
        try {
            const params: any = { limit: 100 };
            if (selectedTimeframe) params.timeframe = selectedTimeframe;
            if (filterExchange) params.exchange = filterExchange;
            if (filterType) params.signal_type = filterType;

            const res = await dashboardAPI.getRecentSignals(params);
            setSignals(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadSignals(); }, [selectedTimeframe, filterExchange, filterType]);

    const startScan = async () => {
        try {
            await scannerAPI.runScan(selectedTimeframe);
            // Poll for progress
            pollRef.current = setInterval(async () => {
                const res = await scannerAPI.getProgress();
                setProgress(res.data);
                if (res.data.status === 'completed' || res.data.status === 'idle' || res.data.status === 'failed') {
                    if (pollRef.current) clearInterval(pollRef.current);
                    setProgress(null);
                    loadSignals();
                }
            }, 2000);
        } catch (err) {
            console.error(err);
        }
    };

    const updateData = async () => {
        try {
            await scannerAPI.updateData();
            alert('Data update started in background');
        } catch (err) {
            console.error(err);
        }
    };

    const refreshUniverse = async () => {
        try {
            await scannerAPI.refreshUniverse();
            alert('Universe refresh started in background');
        } catch (err) {
            console.error(err);
        }
    };

    const filteredSignals = signals.filter(s =>
        !searchQuery || s.symbol?.toLowerCase().includes(searchQuery.toLowerCase())
        || s.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Scanner</h1>
                    <p className="page-subtitle">Squeeze Momentum + RSI signal detection</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={updateData}>
                        <Database size={14} /> Update Data
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={refreshUniverse}>
                        <RefreshCw size={14} /> Refresh Tickers
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div className="card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {['daily', 'weekly', 'monthly'].map(tf => (
                            <button
                                key={tf}
                                className={`btn ${selectedTimeframe === tf ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                                onClick={() => setSelectedTimeframe(tf)}
                            >
                                <Clock size={14} /> {tf.charAt(0).toUpperCase() + tf.slice(1)}
                            </button>
                        ))}
                    </div>

                    <select
                        className="input"
                        style={{ width: '150px' }}
                        value={filterExchange}
                        onChange={(e) => setFilterExchange(e.target.value)}
                    >
                        <option value="">All Exchanges</option>
                        <option value="NYSE">NYSE</option>
                        <option value="NASDAQ">NASDAQ</option>
                        <option value="ETF">ETF</option>
                        <option value="CRYPTO">Crypto</option>
                    </select>

                    <select
                        className="input"
                        style={{ width: '130px' }}
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="">All Signals</option>
                        <option value="BUY">🟢 Buy</option>
                        <option value="SELL">🔴 Sell</option>
                    </select>

                    <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                        <Search size={16} style={{
                            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                            color: 'var(--text-muted)',
                        }} />
                        <input
                            className="input"
                            placeholder="Search by symbol or name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: '36px' }}
                        />
                    </div>

                    <button className="btn btn-primary" onClick={startScan} disabled={!!progress}>
                        {progress ? (
                            <>
                                <span className="spinner" /> Scanning... ({progress.processed}/{progress.total})
                            </>
                        ) : (
                            <>
                                <Play size={16} /> Run Scan
                            </>
                        )}
                    </button>
                </div>

                {/* Progress bar */}
                {progress && progress.total > 0 && (
                    <div style={{ marginTop: '16px' }}>
                        <div style={{
                            height: '4px', background: 'var(--bg-dark)', borderRadius: '2px', overflow: 'hidden',
                        }}>
                            <div style={{
                                height: '100%', borderRadius: '2px', transition: 'width 0.3s',
                                width: `${(progress.processed / progress.total * 100)}%`,
                                background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-cyan))',
                            }} />
                        </div>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px',
                        }}>
                            <span>🟢 {progress.signals_found} signals found</span>
                            <span>{Math.round(progress.processed / progress.total * 100)}%</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Results */}
            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">
                        Signals ({filteredSignals.length})
                    </h2>
                </div>

                {loading ? (
                    <div className="loading-screen" style={{ minHeight: '200px' }}>
                        <div className="spinner" />
                    </div>
                ) : filteredSignals.length === 0 ? (
                    <div className="empty-state">
                        <Scan />
                        <h3>No signals found</h3>
                        <p>Run a scan or adjust your filters</p>
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
                                    <th>Squeeze</th>
                                    <th>Timeframe</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSignals.map((s, i) => (
                                    <tr key={i}>
                                        <td>
                                            <span className={`badge ${s.signal_type === 'BUY' ? 'badge-buy' : 'badge-sell'}`}>
                                                {s.signal_type === 'BUY' ? '🟢' : '🔴'} {s.signal_type}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{s.symbol}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.name?.slice(0, 30)}</div>
                                        </td>
                                        <td><span className="badge" style={{ background: 'var(--bg-elevated)' }}>{s.exchange}</span></td>
                                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${s.price?.toFixed(2)}</td>
                                        <td style={{ fontFamily: 'var(--font-mono)' }}>{s.rsi?.toFixed(1)}</td>
                                        <td style={{ fontFamily: 'var(--font-mono)', color: s.momentum > 0 ? 'var(--signal-buy)' : 'var(--signal-sell)' }}>
                                            {s.momentum?.toFixed(4)}
                                        </td>
                                        <td>{s.squeeze_on ? '🔵 ON' : '⚪ OFF'}</td>
                                        <td><span className={`badge badge-${s.timeframe}`}>{s.timeframe}</span></td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{s.signal_date}</td>
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
