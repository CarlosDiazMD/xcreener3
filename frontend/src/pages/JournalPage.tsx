import { useState, useEffect, FormEvent } from 'react';
import {
    BookOpen, Plus, X, TrendingUp, TrendingDown,
    DollarSign, Calendar, Tag, FileText,
} from 'lucide-react';
import { journalAPI } from '../services/api';

export default function JournalPage() {
    const [entries, setEntries] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [filter, setFilter] = useState('all');

    // Form state
    const [form, setForm] = useState({
        symbol: '', direction: 'LONG', entry_date: new Date().toISOString().split('T')[0],
        entry_price: '', shares: '', stop_loss: '', take_profit: '',
        timeframe: 'daily', strategy: 'Squeeze+RSI', notes: '', tags: '',
    });

    const [closeForm, setCloseForm] = useState({ exit_price: '', exit_date: '', fees: '' });

    const loadData = async () => {
        try {
            const params: any = { limit: 100 };
            if (filter !== 'all') params.status = filter;
            const [entriesRes, statsRes] = await Promise.all([
                journalAPI.list(params),
                journalAPI.getStats(),
            ]);
            setEntries(entriesRes.data);
            setStats(statsRes.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [filter]);

    const handleCreate = async (e: FormEvent) => {
        e.preventDefault();
        try {
            await journalAPI.create({
                ...form,
                entry_price: parseFloat(form.entry_price),
                shares: form.shares ? parseFloat(form.shares) : null,
                stop_loss: form.stop_loss ? parseFloat(form.stop_loss) : null,
                take_profit: form.take_profit ? parseFloat(form.take_profit) : null,
                tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
            });
            setShowForm(false);
            setForm({
                symbol: '', direction: 'LONG', entry_date: new Date().toISOString().split('T')[0],
                entry_price: '', shares: '', stop_loss: '', take_profit: '',
                timeframe: 'daily', strategy: 'Squeeze+RSI', notes: '', tags: '',
            });
            loadData();
        } catch (err) {
            console.error(err);
        }
    };

    const handleClose = async (id: number) => {
        try {
            await journalAPI.update(id, {
                exit_price: parseFloat(closeForm.exit_price),
                exit_date: closeForm.exit_date || new Date().toISOString().split('T')[0],
                fees: closeForm.fees ? parseFloat(closeForm.fees) : 0,
            });
            setEditingId(null);
            setCloseForm({ exit_price: '', exit_date: '', fees: '' });
            loadData();
        } catch (err) {
            console.error(err);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this entry?')) return;
        await journalAPI.delete(id);
        loadData();
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Trading Journal</h1>
                    <p className="page-subtitle">Track your trades and performance</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? <X size={16} /> : <Plus size={16} />}
                    {showForm ? 'Cancel' : 'New Trade'}
                </button>
            </div>

            {/* Stats */}
            {stats && (
                <div className="stats-grid" style={{ marginBottom: '20px' }}>
                    <div className="stat-card">
                        <div className="stat-label">Total Trades</div>
                        <div className="stat-value">{stats.total_trades}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Win Rate</div>
                        <div className="stat-value" style={{
                            color: stats.win_rate >= 50 ? 'var(--signal-buy)' : 'var(--signal-sell)',
                        }}>
                            {stats.win_rate?.toFixed(1)}%
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Total P&L</div>
                        <div className="stat-value" style={{
                            color: stats.total_pnl >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)',
                        }}>
                            ${stats.total_pnl?.toFixed(2)}
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Avg Win / Avg Loss</div>
                        <div style={{ marginTop: '8px' }}>
                            <span style={{ color: 'var(--signal-buy)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                                ${stats.avg_win?.toFixed(2)}
                            </span>
                            <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>/</span>
                            <span style={{ color: 'var(--signal-sell)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                                ${stats.avg_loss?.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* New Trade Form */}
            {showForm && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 className="card-title" style={{ marginBottom: '16px' }}>New Trade Entry</h3>
                    <form onSubmit={handleCreate}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                            <div className="form-group">
                                <label className="form-label">Symbol</label>
                                <input className="input" placeholder="AAPL" value={form.symbol}
                                    onChange={e => setForm({ ...form, symbol: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Direction</label>
                                <select className="input" value={form.direction}
                                    onChange={e => setForm({ ...form, direction: e.target.value })}>
                                    <option value="LONG">🟢 LONG</option>
                                    <option value="SHORT">🔴 SHORT</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Entry Date</label>
                                <input className="input" type="date" value={form.entry_date}
                                    onChange={e => setForm({ ...form, entry_date: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Entry Price</label>
                                <input className="input" type="number" step="0.01" placeholder="0.00" value={form.entry_price}
                                    onChange={e => setForm({ ...form, entry_price: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Shares</label>
                                <input className="input" type="number" step="0.01" placeholder="100" value={form.shares}
                                    onChange={e => setForm({ ...form, shares: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Stop Loss</label>
                                <input className="input" type="number" step="0.01" placeholder="0.00" value={form.stop_loss}
                                    onChange={e => setForm({ ...form, stop_loss: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Take Profit</label>
                                <input className="input" type="number" step="0.01" placeholder="0.00" value={form.take_profit}
                                    onChange={e => setForm({ ...form, take_profit: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Strategy</label>
                                <input className="input" value={form.strategy}
                                    onChange={e => setForm({ ...form, strategy: e.target.value })} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Notes</label>
                            <textarea className="input" rows={2} placeholder="Trade rationale..."
                                value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                                style={{ resize: 'vertical' }} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Tags (comma separated)</label>
                            <input className="input" placeholder="squeeze, breakout" value={form.tags}
                                onChange={e => setForm({ ...form, tags: e.target.value })} />
                        </div>
                        <button type="submit" className="btn btn-primary">
                            <Plus size={16} /> Add Trade
                        </button>
                    </form>
                </div>
            )}

            {/* Filter */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {['all', 'open', 'closed'].map(f => (
                    <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        onClick={() => setFilter(f)}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            {/* Entries Table */}
            <div className="card">
                {loading ? (
                    <div className="loading-screen" style={{ minHeight: '200px' }}>
                        <div className="spinner" />
                    </div>
                ) : entries.length === 0 ? (
                    <div className="empty-state">
                        <BookOpen />
                        <h3>No trades recorded</h3>
                        <p>Start tracking your trades by clicking "New Trade"</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Direction</th>
                                    <th>Symbol</th>
                                    <th>Entry</th>
                                    <th>Exit</th>
                                    <th>Shares</th>
                                    <th>P&L</th>
                                    <th>Status</th>
                                    <th>Strategy</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map(e => (
                                    <tr key={e.id}>
                                        <td>
                                            <span className={`badge ${e.direction === 'LONG' ? 'badge-buy' : 'badge-sell'}`}>
                                                {e.direction === 'LONG' ? '🟢' : '🔴'} {e.direction}
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{e.symbol}</td>
                                        <td>
                                            <div style={{ fontFamily: 'var(--font-mono)' }}>${e.entry_price?.toFixed(2)}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{e.entry_date}</div>
                                        </td>
                                        <td>
                                            {e.exit_price ? (
                                                <>
                                                    <div style={{ fontFamily: 'var(--font-mono)' }}>${e.exit_price?.toFixed(2)}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{e.exit_date}</div>
                                                </>
                                            ) : editingId === e.id ? (
                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                    <input className="input" type="number" step="0.01" placeholder="Exit price"
                                                        style={{ width: '100px', padding: '4px 8px', fontSize: '0.8rem' }}
                                                        value={closeForm.exit_price}
                                                        onChange={ev => setCloseForm({ ...closeForm, exit_price: ev.target.value })} />
                                                    <button className="btn btn-buy btn-sm" onClick={() => handleClose(e.id)}>✓</button>
                                                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>✗</button>
                                                </div>
                                            ) : '—'}
                                        </td>
                                        <td style={{ fontFamily: 'var(--font-mono)' }}>{e.shares || '—'}</td>
                                        <td style={{
                                            fontFamily: 'var(--font-mono)', fontWeight: 600,
                                            color: e.pnl == null ? 'var(--text-muted)' : e.pnl >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)',
                                        }}>
                                            {e.pnl != null ? (
                                                <>
                                                    ${e.pnl?.toFixed(2)}
                                                    <div style={{ fontSize: '0.7rem' }}>({e.pnl_percent?.toFixed(1)}%)</div>
                                                </>
                                            ) : '—'}
                                        </td>
                                        <td>
                                            <span className={`badge badge-${e.status}`}>{e.status}</span>
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{e.strategy}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                {e.status === 'open' && (
                                                    <button className="btn btn-secondary btn-sm"
                                                        onClick={() => { setEditingId(e.id); setCloseForm({ exit_price: '', exit_date: '', fees: '' }); }}>
                                                        Close
                                                    </button>
                                                )}
                                                <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(e.id)}
                                                    style={{ color: 'var(--signal-sell)' }}>
                                                    <X size={12} />
                                                </button>
                                            </div>
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
