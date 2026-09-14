// npm start

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, MapPin, Users, Plus, ChevronLeft, ChevronRight, User, LogOut, X, Cake, Heart, Phone, Mail, Megaphone } from 'lucide-react';

const API_URL = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) || 'http://localhost:5000/api';

async function apiFetch(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    throw new Error(`Can't reach the server at ${API_URL}. Is the backend running?`);
  }

  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body is fine */ }

  if (!res.ok) throw new Error((data && data.message) || `Request failed (${res.status})`);
  return data;
}

const normalizeUser = (u) => ({ ...u, id: u._id });
const normalizeEvent = (e) => ({ ...e, id: e._id });
const normalizeAnnouncement = (a) => ({ ...a, id: a._id });

// ---------- Login ----------
function Login({ onSubmit, onForgot }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
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
          <h1 className="text-3xl font-bold text-gray-800">Event Manager</h1>
          <p className="text-gray-600 mt-2">Sign in to continue</p>
        </div>
        <div className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="you@example.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <button onClick={onForgot} className="text-xs text-indigo-600 hover:underline">Forgot password?</button>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
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
function ForgotPassword({ onBack }) {
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
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
function ResetPassword({ token, onDone }) {
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
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
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

// ---------- Event Modal ----------
function EventModal({ event, isAdmin, currentUser, users = [], saving, error, onClose, onSave, onDelete, onRsvp }) {
  const isNew = !event;
  const [fd, setFd] = useState({
    title: event?.title || '',
    description: event?.description || '',
    date: event?.date ? new Date(event.date).toISOString().slice(0, 16) : '',
    location: event?.location || ''
  });
  const [editing, setEditing] = useState(isNew);

  const myRsvp = event?.rsvps?.[currentUser.id];
  const rsvpCounts = event ? Object.values(event.rsvps).reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {}) : {};
  const usersById = Object.fromEntries(users.map(u => [u.id, u.name]));
  const canSubmit = fd.title.trim() && fd.date;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">
              {isNew ? 'Create Event' : editing ? 'Edit Event' : event.title}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">{error}</div>}

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input type="text" value={fd.title} onChange={(e) => setFd({ ...fd, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                <input type="datetime-local" value={fd.date} onChange={(e) => setFd({ ...fd, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input type="text" value={fd.location} onChange={(e) => setFd({ ...fd, location: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={fd.description} onChange={(e) => setFd({ ...fd, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg h-24 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  disabled={!canSubmit || saving}
                  onClick={() => onSave({ ...fd, id: event?.id })}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : isNew ? 'Create Event' : 'Save Changes'}
                </button>
                {!isNew && (
                  <button onClick={() => setEditing(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center text-gray-600">
                <Clock className="w-4 h-4 mr-2 flex-shrink-0" />
                <span>{new Date(event.date).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {event.location && (
                <div className="flex items-center text-gray-600">
                  <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                  <span>{event.location}</span>
                </div>
              )}
              {event.description && <p className="text-gray-700">{event.description}</p>}

              <div className="pt-4 border-t">
                <h4 className="font-semibold text-gray-800 mb-3">Your RSVP</h4>
                <div className="flex gap-2">
                  {['yes', 'maybe', 'no'].map(status => (
                    <button
                      key={status}
                      disabled={saving}
                      onClick={() => onRsvp(event.id, status)}
                      className={`flex-1 py-2 rounded-lg font-medium capitalize transition-colors disabled:opacity-60 ${
                        myRsvp === status
                          ? status === 'yes' ? 'bg-green-600 text-white' : status === 'no' ? 'bg-red-600 text-white' : 'bg-yellow-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-semibold text-gray-800 mb-2 flex items-center">
                  <Users className="w-4 h-4 mr-2" />
                  RSVPs — {rsvpCounts.yes || 0} yes, {rsvpCounts.maybe || 0} maybe, {rsvpCounts.no || 0} no
                </h4>
                <div className="space-y-2 mt-3">
                  {['yes', 'maybe', 'no'].map(status => {
                    const names = Object.entries(event.rsvps)
                      .filter(([, s]) => s === status)
                      .map(([uid]) => usersById[uid] || (uid === currentUser.id ? currentUser.name : 'A member'));
                    if (names.length === 0) return null;
                    return (
                      <div key={status}>
                        <p className={`text-xs font-semibold uppercase tracking-wide ${
                          status === 'yes' ? 'text-green-600' : status === 'no' ? 'text-red-600' : 'text-yellow-600'
                        }`}>
                          {status} ({names.length})
                        </p>
                        <p className="text-sm text-gray-700">{names.join(', ')}</p>
                      </div>
                    );
                  })}
                  {Object.keys(event.rsvps).length === 0 && (
                    <p className="text-sm text-gray-400">No responses yet.</p>
                  )}
                </div>
              </div>

              {isAdmin && (
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setEditing(true)} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium">
                    Edit
                  </button>
                  <button disabled={saving} onClick={() => onDelete(event.id)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-60">
                    {saving ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Member Modal ----------
function MemberModal({ member, currentUser, saving, error, onClose, onSave, onDelete }) {
  const isNew = !member;
  const isSelf = !isNew && currentUser && member.id === currentUser.id;
  const roleLocked = isSelf && member.role === 'admin';
  const [fd, setFd] = useState({
    name: member?.name || '',
    email: member?.email || '',
    password: '',
    phone: member?.phone || '',
    spouse: member?.spouse || '',
    birthday: member?.birthday || '',
    role: member?.role || 'member'
  });

  const canSubmit = fd.name.trim() && fd.email.trim() && (!isNew || fd.password.trim().length >= 6);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">{isNew ? 'Add Member' : 'Edit Member'}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">{error}</div>}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" value={fd.name} onChange={(e) => setFd({ ...fd, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={fd.email} onChange={(e) => setFd({ ...fd, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isNew ? 'Temporary Password' : 'Reset Password'}
                {!isNew && <span className="text-gray-400 font-normal"> (leave blank to keep current)</span>}
              </label>
              <input type="password" value={fd.password} onChange={(e) => setFd({ ...fd, password: e.target.value })}
                placeholder={isNew ? 'Min. 6 characters' : '••••••••'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              {isNew && <p className="text-xs text-gray-400 mt-1">Share this with the member directly — they'll use it to log in.</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={fd.phone} onChange={(e) => setFd({ ...fd, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Spouse</label>
              <input type="text" value={fd.spouse} onChange={(e) => setFd({ ...fd, spouse: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Birthday</label>
              <input type="date" value={fd.birthday} onChange={(e) => setFd({ ...fd, birthday: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={fd.role}
                disabled={roleLocked}
                onChange={(e) => setFd({ ...fd, role: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              {roleLocked && (
                <p className="text-xs text-gray-500 mt-1">
                  You can't change your own role while logged in. Ask another admin to do this if needed.
                </p>
              )}
              {!roleLocked && !isNew && fd.role !== member.role && (
                <p className="text-xs text-amber-600 mt-1">
                  {fd.role === 'admin'
                    ? `Saving will give ${member.name} full admin access, including managing members.`
                    : `Saving will remove ${member.name}'s admin access.`}
                </p>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                disabled={!canSubmit || saving}
                onClick={() => onSave({ ...fd, id: member?.id })}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : isNew ? 'Add Member' : 'Save Changes'}
              </button>
              {!isNew && (
                <button
                  onClick={() => onDelete(member.id)}
                  disabled={isSelf || saving}
                  title={isSelf ? "You can't delete your own account while logged in" : undefined}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-600"
                >
                  {saving ? 'Deleting…' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Announcement Modal ----------
function AnnouncementModal({ announcement, saving, error, onClose, onSave, onDelete }) {
  const isNew = !announcement;
  const [fd, setFd] = useState({
    title: announcement?.title || '',
    body: announcement?.body || ''
  });

  const canSubmit = fd.title.trim() && fd.body.trim();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">{isNew ? 'New Announcement' : 'Edit Announcement'}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">{error}</div>}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input type="text" value={fd.title} onChange={(e) => setFd({ ...fd, title: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea value={fd.body} onChange={(e) => setFd({ ...fd, body: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg h-32 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                disabled={!canSubmit || saving}
                onClick={() => onSave({ ...fd, id: announcement?.id })}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : isNew ? 'Post Announcement' : 'Save Changes'}
              </button>
              {!isNew && (
                <button
                  onClick={() => onDelete(announcement.id)}
                  disabled={saving}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-60"
                >
                  {saving ? 'Deleting…' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Calendar ----------
function MonthCalendar({ viewDate, events, onEventClick }) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const eventsForDay = (day) => {
    if (!day) return [];
    const dateStr = new Date(year, month, day).toDateString();
    return events.filter(e => new Date(e.date).toDateString() === dateStr)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  return (
    <div className="grid grid-cols-7 gap-2">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
        <div key={d} className="text-center text-sm font-semibold text-gray-500 py-2">{d}</div>
      ))}
      {cells.map((day, i) => {
        const dayEvents = eventsForDay(day);
        const isToday = day && new Date().toDateString() === new Date(year, month, day).toDateString();
        return (
          <div
            key={i}
            className={`min-h-[6rem] p-2 rounded-lg border ${day ? 'bg-white border-gray-200' : 'bg-gray-50 border-transparent'} ${isToday ? 'ring-2 ring-indigo-400' : ''}`}
          >
            {day && (
              <>
                <div className={`text-sm font-medium mb-1 ${isToday ? 'text-indigo-600' : 'text-gray-700'}`}>{day}</div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map(e => (
                    <button
                      key={e.id}
                      onClick={() => onEventClick(e)}
                      className="w-full text-left text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded truncate hover:bg-indigo-200 transition-colors"
                    >
                      {e.title}
                    </button>
                  ))}
                  {dayEvents.length > 3 && <div className="text-xs text-gray-400 pl-1">+{dayEvents.length - 3} more</div>}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ currentUser, token, onLogout }) {
  const [tab, setTab] = useState('calendar');
  const [viewDate, setViewDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [showEventModal, setShowEventModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  const isAdmin = currentUser.role === 'admin';

  const loadEvents = useCallback(async () => {
    try {
      const data = await apiFetch('/events', { token });
      const normalized = data.map(normalizeEvent);
      setEvents(normalized);
      setLoadError('');
      return normalized;
    } catch (err) {
      setLoadError(err.message);
      return [];
    }
  }, [token]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await apiFetch('/users', { token });
      setUsers(data.map(normalizeUser));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, [token, isAdmin]);

  const loadAnnouncements = useCallback(async () => {
    try {
      const data = await apiFetch('/announcements', { token });
      setAnnouncements(data.map(normalizeAnnouncement));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, [token]);

  useEffect(() => { loadEvents(); loadUsers(); loadAnnouncements(); }, [loadEvents, loadUsers, loadAnnouncements]);

  const changeMonth = (delta) => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1));

  const openEvent = (evt) => { setSelectedEvent(evt); setModalError(''); setShowEventModal(true); };
  const openNewEvent = () => { setSelectedEvent(null); setModalError(''); setShowEventModal(true); };
  const closeEventModal = () => { setShowEventModal(false); setSelectedEvent(null); setModalError(''); };

  const saveEvent = async (data) => {
    setSaving(true);
    setModalError('');
    try {
      const body = { title: data.title, description: data.description, date: data.date, location: data.location };
      if (data.id) {
        await apiFetch(`/events/${data.id}`, { method: 'PUT', token, body });
      } else {
        await apiFetch('/events', { method: 'POST', token, body });
      }
      await loadEvents();
      closeEventModal();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (id) => {
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    setSaving(true);
    setModalError('');
    try {
      await apiFetch(`/events/${id}`, { method: 'DELETE', token });
      await loadEvents();
      closeEventModal();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const rsvp = async (eventId, status) => {
    setSaving(true);
    setModalError('');
    try {
      await apiFetch(`/events/${eventId}/rsvp`, { method: 'POST', token, body: { status } });
      const normalized = await loadEvents();
      setSelectedEvent(normalized.find(e => e.id === eventId) || null);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openMember = (m) => { setSelectedMember(m); setModalError(''); setShowMemberModal(true); };
  const openNewMember = () => { setSelectedMember(null); setModalError(''); setShowMemberModal(true); };
  const closeMemberModal = () => { setShowMemberModal(false); setSelectedMember(null); setModalError(''); };

  const saveMember = async (data) => {
    setSaving(true);
    setModalError('');
    try {
      const body = { name: data.name, email: data.email, phone: data.phone, spouse: data.spouse, birthday: data.birthday, role: data.role };
      if (data.password) body.password = data.password;

      if (data.id) {
        await apiFetch(`/users/${data.id}`, { method: 'PUT', token, body });
      } else {
        await apiFetch('/users', { method: 'POST', token, body });
      }
      await loadUsers();
      closeMemberModal();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteMember = async (id) => {
    if (!window.confirm('Delete this member? This cannot be undone.')) return;
    setSaving(true);
    setModalError('');
    try {
      await apiFetch(`/users/${id}`, { method: 'DELETE', token });
      await loadUsers();
      closeMemberModal();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openAnnouncement = (a) => { setSelectedAnnouncement(a); setModalError(''); setShowAnnouncementModal(true); };
  const openNewAnnouncement = () => { setSelectedAnnouncement(null); setModalError(''); setShowAnnouncementModal(true); };
  const closeAnnouncementModal = () => { setShowAnnouncementModal(false); setSelectedAnnouncement(null); setModalError(''); };

  const saveAnnouncement = async (data) => {
    setSaving(true);
    setModalError('');
    try {
      const body = { title: data.title, body: data.body };
      if (data.id) {
        await apiFetch(`/announcements/${data.id}`, { method: 'PUT', token, body });
      } else {
        await apiFetch('/announcements', { method: 'POST', token, body });
      }
      await loadAnnouncements();
      closeAnnouncementModal();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteAnnouncement = async (id) => {
    if (!window.confirm('Delete this announcement? This cannot be undone.')) return;
    setSaving(true);
    setModalError('');
    try {
      await apiFetch(`/announcements/${id}`, { method: 'DELETE', token });
      await loadAnnouncements();
      closeAnnouncementModal();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Calendar className="w-7 h-7 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-800">Event Manager</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 text-gray-700 text-sm">
              <User className="w-4 h-4" />
              <span className="font-medium">{currentUser.name}</span>
              <span className="text-gray-400">({currentUser.role})</span>
            </div>
            <button onClick={onLogout} className="flex items-center space-x-1 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </nav>

      {loadError && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 text-center border-b border-red-100">
          {loadError}
        </div>
      )}

      <div className="max-w-6xl mx-auto p-4">
        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('calendar')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'calendar' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
            Calendar
          </button>
          <button onClick={() => setTab('announcements')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'announcements' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
            Announcements
          </button>
          {isAdmin && (
            <button onClick={() => setTab('members')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'members' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
              Members
            </button>
          )}
        </div>

        {tab === 'calendar' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
                <h2 className="text-lg font-semibold text-gray-800 min-w-[10rem] text-center">
                  {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h2>
                <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
              </div>
              {isAdmin && (
                <button onClick={openNewEvent} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
                  <Plus className="w-4 h-4" /> New Event
                </button>
              )}
            </div>
            <MonthCalendar viewDate={viewDate} events={events} onEventClick={openEvent} />
          </div>
        )}

        {tab === 'announcements' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-indigo-600" />
                Announcements
              </h2>
              {isAdmin && (
                <button onClick={openNewAnnouncement} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
                  <Plus className="w-4 h-4" /> New Announcement
                </button>
              )}
            </div>
            {announcements.length === 0 ? (
              <p className="text-gray-400 text-sm">No announcements yet.</p>
            ) : (
              <div className="space-y-4">
                {announcements.map(a => (
                  <div key={a.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h3 className="font-semibold text-gray-800">{a.title}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {a.createdBy?.name ? `Posted by ${a.createdBy.name}` : 'Posted'} · {new Date(a.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      {isAdmin && (
                        <button onClick={() => openAnnouncement(a)} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex-shrink-0">
                          Edit
                        </button>
                      )}
                    </div>
                    <p className="text-gray-700 mt-2 whitespace-pre-wrap">{a.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'members' && isAdmin && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-gray-800">Members</h2>
              <button onClick={openNewMember} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
                <Plus className="w-4 h-4" /> Add Member
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Contact</th>
                    <th className="py-2 pr-4 font-medium">Spouse</th>
                    <th className="py-2 pr-4 font-medium">Birthday</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 pr-4 font-medium text-gray-800">{u.name}</td>
                      <td className="py-3 pr-4 text-gray-600">
                        <div className="flex items-center gap-1"><Mail className="w-3 h-3" />{u.email}</div>
                        {u.phone && <div className="flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{u.phone}</div>}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {u.spouse ? <div className="flex items-center gap-1"><Heart className="w-3 h-3" />{u.spouse}</div> : '—'}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {u.birthday ? <div className="flex items-center gap-1"><Cake className="w-3 h-3" />{new Date(u.birthday + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}</div> : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'}`}>{u.role}</span>
                      </td>
                      <td className="py-3 text-right">
                        <button onClick={() => openMember(u)} className="text-indigo-600 hover:text-indigo-800 font-medium">Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showEventModal && (
        <EventModal
          event={selectedEvent}
          isAdmin={isAdmin}
          currentUser={currentUser}
          users={users}
          saving={saving}
          error={modalError}
          onClose={closeEventModal}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onRsvp={rsvp}
        />
      )}

      {showMemberModal && (
        <MemberModal
          member={selectedMember}
          currentUser={currentUser}
          saving={saving}
          error={modalError}
          onClose={closeMemberModal}
          onSave={saveMember}
          onDelete={deleteMember}
        />
      )}

      {showAnnouncementModal && (
        <AnnouncementModal
          announcement={selectedAnnouncement}
          saving={saving}
          error={modalError}
          onClose={closeAnnouncementModal}
          onSave={saveAnnouncement}
          onDelete={deleteAnnouncement}
        />
      )}
    </div>
  );
}

// ---------- App ----------
export default function App() {
  const [view, setView] = useState('login');
  const [resetToken, setResetToken] = useState(null);
  const [token, setToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (window.location.pathname.includes('reset-password') && t) {
      setResetToken(t);
      setView('reset');
    }
  }, []);

  const login = async (email, password) => {
    const data = await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    setCurrentUser(normalizeUser(data.user));
    setView('app');
  };

  const logout = () => {
    setToken(null);
    setCurrentUser(null);
    setView('login');
  };

  const backToLogin = () => {
    window.history.replaceState({}, '', '/');
    setResetToken(null);
    setView('login');
  };

  if (view === 'forgot') return <ForgotPassword onBack={() => setView('login')} />;
  if (view === 'reset') return <ResetPassword token={resetToken} onDone={backToLogin} />;
  if (view === 'app' && currentUser) return <Dashboard currentUser={currentUser} token={token} onLogout={logout} />;

  return <Login onSubmit={login} onForgot={() => setView('forgot')} />;
}