import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import { apiFetch } from '../api';
import { PasswordInput, inputClass } from './ui';

// ---------- Login ----------
export function Login({ onSubmit, onForgot }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);

  const handleLogin = async () => {
    setError('');
    setSlow(false);
    setLoading(true);
    // if sign-in takes over 4 seconds the server is probably waking up, so I tell the person
    const timer = setTimeout(() => setSlow(true), 4000);
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      clearTimeout(timer);
      setSlow(false);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block p-3 bg-indigo-100 rounded-full mb-4">
            <Calendar className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">Company A+</h1>
          <p className="text-gray-600 mt-2">Sign in to continue</p>
        </div>
        <div className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}
          {slow && <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-sm">The server is waking up. The first sign-in after a quiet period can take up to a minute.</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <button onClick={onForgot} className="text-xs text-indigo-600 hover:underline">Forgot password?</button>
            </div>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
            />
          </div>
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium transition-colors disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Forgot Password ----------
export function ForgotPassword({ onBack }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setStatus('sending');
    try {
      await apiFetch('/auth/forgot-password', { method: 'POST', body: { email } });
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block p-3 bg-indigo-100 rounded-full mb-4">
            <Calendar className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Reset your password</h1>
          <p className="text-gray-600 mt-2 text-sm">Enter your email and we'll send you a reset link.</p>
        </div>

        {status === 'sent' ? (
          <div className="space-y-4">
            <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">
              If an account with that email exists, a reset link has been sent. Check your inbox.
            </div>
            <button onClick={onBack} className="w-full border border-gray-300 py-2 rounded-lg hover:bg-gray-50 font-medium">
              Back to Sign In
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>
            <button
              onClick={submit}
              disabled={status === 'sending' || !email.trim()}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-60"
            >
              {status === 'sending' ? 'Sending…' : 'Send Reset Link'}
            </button>
            <button onClick={onBack} className="w-full text-sm text-gray-500 hover:underline">Back to Sign In</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Reset Password ----------
export function ResetPassword({ token, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    setStatus('saving');
    try {
      await apiFetch('/auth/reset-password', { method: 'POST', body: { token, password } });
      setStatus('done');
    } catch (err) {
      setStatus('idle');
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block p-3 bg-indigo-100 rounded-full mb-4">
            <Calendar className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Set a new password</h1>
        </div>

        {status === 'done' ? (
          <div className="space-y-4">
            <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">
              Your password has been updated. You can now sign in.
            </div>
            <button onClick={onDone} className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium">
              Go to Sign In
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()} className={inputClass} />
            </div>
            <button
              onClick={submit}
              disabled={status === 'saving'}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-60"
            >
              {status === 'saving' ? 'Saving…' : 'Set New Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}