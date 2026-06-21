import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Message passed in by a redirect (e.g. forced logout after account deletion).
  const notice = location.state?.message;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await login(username, password);
      if (res.user.role === 'admin') navigate('/admin');
      else navigate('/student');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <h2 className="text-3xl font-semibold text-white">Login</h2>
        <p className="mt-2 text-slate-400">Welcome back</p>
        {notice && (
          <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            {notice}
          </p>
        )}
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <input
            className="w-full rounded-lg bg-slate-950 px-4 py-3 text-white outline-none ring-1 ring-slate-700"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="w-full rounded-lg bg-slate-950 px-4 py-3 text-white outline-none ring-1 ring-slate-700"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="w-full rounded-lg bg-cyan-500 py-3 font-semibold text-slate-950">Login</button>
        </form>
        <p className="mt-4 text-sm text-slate-400">
          Don’t have an account? <Link to="/register" className="text-cyan-400">Register</Link>
        </p>
      </div>
    </div>
  );
}
