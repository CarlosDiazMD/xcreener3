import { useState } from 'react';
import { Settings, MessageCircle, Bell, Save, CheckCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { authAPI } from '../services/api';

export default function SettingsPage() {
    const { user } = useAuth();
    const [telegramId, setTelegramId] = useState(user?.telegram_chat_id || '');
    const [telegramNotif, setTelegramNotif] = useState(user?.telegram_notifications ?? true);
    const [webNotif, setWebNotif] = useState(user?.web_notifications ?? true);
    const [timeframes, setTimeframes] = useState<string[]>(user?.preferred_timeframes || ['daily', 'weekly']);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);

    const handleSave = async () => {
        setSaving(true);
        try {
            await authAPI.updateProfile({
                telegram_chat_id: telegramId || null,
                telegram_notifications: telegramNotif,
                web_notifications: webNotif,
                preferred_timeframes: timeframes,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const testTelegram = async () => {
        setTestResult(null);
        try {
            await authAPI.testTelegram();
            setTestResult('✅ Message sent successfully!');
        } catch (err: any) {
            setTestResult(`❌ ${err.response?.data?.detail || 'Failed to send test message'}`);
        }
    };

    const toggleTimeframe = (tf: string) => {
        setTimeframes(prev =>
            prev.includes(tf) ? prev.filter(t => t !== tf) : [...prev, tf]
        );
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">Configure your notifications and preferences</p>
                </div>
            </div>

            <div style={{ maxWidth: '600px' }}>
                {/* Telegram */}
                <div className="card" style={{ marginBottom: '20px' }}>
                    <div className="card-header">
                        <h2 className="card-title">
                            <MessageCircle size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                            Telegram Integration
                        </h2>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Chat ID</label>
                        <input
                            className="input"
                            placeholder="Your Telegram Chat ID"
                            value={telegramId}
                            onChange={(e) => setTelegramId(e.target.value)}
                        />
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                            Send /start to @userinfobot on Telegram to get your Chat ID
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button className="btn btn-secondary btn-sm" onClick={testTelegram}>
                            Send Test Message
                        </button>
                        {testResult && (
                            <span style={{ fontSize: '0.85rem', color: testResult.includes('✅') ? 'var(--signal-buy)' : 'var(--signal-sell)' }}>
                                {testResult}
                            </span>
                        )}
                    </div>
                </div>

                {/* Notifications */}
                <div className="card" style={{ marginBottom: '20px' }}>
                    <div className="card-header">
                        <h2 className="card-title">
                            <Bell size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                            Notification Preferences
                        </h2>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '8px 0' }}>
                            <input
                                type="checkbox"
                                checked={telegramNotif}
                                onChange={(e) => setTelegramNotif(e.target.checked)}
                                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-blue)' }}
                            />
                            <span>Telegram Notifications</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '8px 0' }}>
                            <input
                                type="checkbox"
                                checked={webNotif}
                                onChange={(e) => setWebNotif(e.target.checked)}
                                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-blue)' }}
                            />
                            <span>Web Notifications</span>
                        </label>
                    </div>

                    <div>
                        <label className="form-label">Alert Timeframes</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {['daily', 'weekly', 'monthly'].map(tf => (
                                <button
                                    key={tf}
                                    className={`btn ${timeframes.includes(tf) ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                                    onClick={() => toggleTimeframe(tf)}
                                >
                                    {tf.charAt(0).toUpperCase() + tf.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Save */}
                <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving}>
                    {saving ? <span className="spinner" /> : saved ? <CheckCircle size={16} /> : <Save size={16} />}
                    {saved ? 'Saved!' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
}
