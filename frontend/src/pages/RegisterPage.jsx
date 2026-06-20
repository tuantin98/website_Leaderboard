import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await register(username, password, role);
      navigate(role === 'admin' ? '/admin' : '/student');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <h2 className="text-3xl font-semibold text-white">Register</h2>
        <p className="mt-2 text-slate-400">Create your account</p>
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
          <select
            className="w-full rounded-lg bg-slate-950 px-4 py-3 text-white outline-none ring-1 ring-slate-700"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="student">Student</option>
            <option value="admin">Admin</option>
          </select>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="w-full rounded-lg bg-cyan-500 py-3 font-semibold text-slate-950">Register</button>
        </form>
        <p className="mt-4 text-sm text-slate-400">
          Already have an account? <Link to="/login" className="text-cyan-400">Login</Link>
        </p>
      </div>
    </div>
  );
}
