import { useState, FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { TrendingUp } from 'lucide-react';

export default function LoginPage() {
    const { login, register } = useAuth();
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isRegister) {
                await register(email, username, password);
            } else {
                await login(username, password);
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                    <TrendingUp size={40} color="var(--accent-blue)" />
                </div>
                <h1 className="auth-title">Xcreener 2.0</h1>
                <p className="auth-subtitle">
                    {isRegister ? 'Create your trading account' : 'Welcome back, trader'}
                </p>

                <form onSubmit={handleSubmit}>
                    {isRegister && (
                        <div className="form-group">
                            <label className="form-label">Email</label>
                            <input
                                className="input"
                                type="email"
                                placeholder="trader@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">Username</label>
                        <input
                            className="input"
                            type="text"
                            placeholder="Your username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            className="input"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                        />
                    </div>

                    {error && (
                        <div style={{
                            padding: '10px 14px', borderRadius: 'var(--radius-md)',
                            background: 'var(--signal-sell-bg)', color: 'var(--signal-sell)',
                            fontSize: '0.85rem', marginBottom: '16px',
                        }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary btn-lg"
                        style={{ width: '100%' }}
                        disabled={loading}
                    >
                        {loading ? <span className="spinner" /> : (isRegister ? 'Create Account' : 'Sign In')}
                    </button>
                </form>

                <p className="auth-toggle">
                    {isRegister ? 'Already have an account? ' : "Don't have an account? "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setIsRegister(!isRegister); setError(''); }}>
                        {isRegister ? 'Sign In' : 'Register'}
                    </a>
                </p>
            </div>
        </div>
    );
}
