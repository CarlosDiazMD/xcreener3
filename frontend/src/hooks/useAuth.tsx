import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authAPI } from '../services/api';

interface User {
    id: number;
    email: string;
    username: string;
    is_active: boolean;
    is_admin: boolean;
    telegram_chat_id: string | null;
    telegram_notifications: boolean;
    web_notifications: boolean;
    watchlist: string[];
    preferred_timeframes: string[];
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (username: string, password: string) => Promise<void>;
    register: (email: string, username: string, password: string) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('xcreener_token'));
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (token) {
            authAPI.getProfile()
                .then(res => setUser(res.data))
                .catch(() => {
                    localStorage.removeItem('xcreener_token');
                    setToken(null);
                })
                .finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, [token]);

    const login = async (username: string, password: string) => {
        const res = await authAPI.login({ username, password });
        localStorage.setItem('xcreener_token', res.data.access_token);
        setToken(res.data.access_token);
        setUser(res.data.user);
    };

    const register = async (email: string, username: string, password: string) => {
        const res = await authAPI.register({ email, username, password });
        localStorage.setItem('xcreener_token', res.data.access_token);
        setToken(res.data.access_token);
        setUser(res.data.user);
    };

    const logout = () => {
        localStorage.removeItem('xcreener_token');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
