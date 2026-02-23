import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard, Scan, Bell, BookOpen, Settings, LogOut,
    TrendingUp, Activity, Database,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Sidebar() {
    const { user, logout } = useAuth();

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo">⚡ Xcreener 2.0</div>
                <div className="sidebar-version">Squeeze Momentum + RSI</div>
            </div>

            <nav className="sidebar-nav">
                <div className="nav-section">
                    <div className="nav-section-title">Main</div>
                    <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
                        <LayoutDashboard /> Dashboard
                    </NavLink>
                    <NavLink to="/scanner" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <Scan /> Scanner
                    </NavLink>
                    <NavLink to="/explorer" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <Database /> Explorer
                    </NavLink>
                    <NavLink to="/alerts" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <Bell /> Alerts
                    </NavLink>
                </div>

                <div className="nav-section">
                    <div className="nav-section-title">Trading</div>
                    <NavLink to="/journal" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <BookOpen /> Journal
                    </NavLink>
                </div>

                <div className="nav-section">
                    <div className="nav-section-title">System</div>
                    <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <Settings /> Settings
                    </NavLink>
                </div>
            </nav>

            <div style={{ padding: '16px 12px', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', padding: '0 8px' }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '0.8rem',
                    }}>
                        {user?.username?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user?.username}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{user?.email}</div>
                    </div>
                </div>
                <button
                    onClick={logout}
                    className="nav-item"
                    style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left' }}
                >
                    <LogOut /> Logout
                </button>
            </div>
        </aside>
    );
}
