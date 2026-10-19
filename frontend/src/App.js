// npm start

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, MapPin, Users, Plus, ChevronLeft, ChevronRight, User, LogOut, X, Cake, Heart, Phone, Mail, Megaphone, Sun, Gift } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ---------- API helper ----------
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

// ---------- Helpers ----------
// Mongo gives me _id, so I copy it to id to keep the rest of the code simple
const normalizeUser = (u) => ({ ...u, id: u._id });
const normalizeEvent = (e) => ({ ...e, id: e._id });
const normalizeAnnouncement = (a) => ({ ...a, id: a._id });

const fullName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : '');

// sorting by last name first, then first name as the tiebreaker
const byLastName = (a, b) =>
  (a.lastName || '').localeCompare(b.lastName || '', undefined, { sensitivity: 'base' }) ||
  (a.firstName || '').localeCompare(b.firstName || '', undefined, { sensitivity: 'base' });

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in the viewer's own timezone.
// toISOString() gives UTC, which was shifting the time, so I subtract the offset first.
const toLocalInputValue = (iso) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const formatMonthDay = (dateStr) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });

// shrinks the chosen photo to max 256px so it stays tiny in the database
function resizeImageToDataUrl(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be loaded.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; // white behind transparent PNGs so they don't turn black
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const inputClass = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none';

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Avatar({ user, size = 'md' }) {
  const sizes = {
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-lg',
    xl: 'w-24 h-24 text-2xl'
  };
  const initials = `${(user.firstName || '?')[0]}${(user.lastName || '')[0] || ''}`.toUpperCase();

  if (user.profilePicture) {
    return <img src={user.profilePicture} alt={fullName(user)} className={`${sizes[size]} rounded-full object-cover flex-shrink-0`} />;
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center flex-shrink-0`}>
      {initials}
    </div>
  );
}

function Detail({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
      <span className="whitespace-pre-line break-words min-w-0">
        {label && <span className="text-gray-400">{label}: </span>}
        {children}
      </span>
    </div>
  );
}

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
              className={inputClass}
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
              className={inputClass}
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

// ---------- Event Modal ----------
function EventModal({ event, isAdmin, currentUser, saving, error, onClose, onSave, onDelete, onRsvp }) {
  const isNew = !event;
  const [fd, setFd] = useState({
    title: event?.title || '',
    description: event?.description || '',
    date: event?.date ? toLocalInputValue(event.date) : '',
    location: event?.location || ''
  });
  const [editing, setEditing] = useState(isNew);

  const myRsvp = event?.rsvps?.[currentUser.id];
  const rsvpCounts = event ? Object.values(event.rsvps).reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {}) : {};
  const canSubmit = fd.title.trim() && fd.date;

  // names come from the server with each event, so members can see them too
  const namesFor = (status) =>
    Object.entries(event.rsvps)
      .filter(([, s]) => s === status)
      .map(([uid]) => (event.rsvpNames && event.rsvpNames[uid]) || 'A member')
      .sort((a, b) => a.localeCompare(b));

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
              <Field label="Title">
                <input type="text" value={fd.title} onChange={(e) => setFd({ ...fd, title: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Date & Time">
                <input type="datetime-local" value={fd.date} onChange={(e) => setFd({ ...fd, date: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Location">
                <input type="text" value={fd.location} onChange={(e) => setFd({ ...fd, location: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Description">
                <textarea value={fd.description} onChange={(e) => setFd({ ...fd, description: e.target.value })} className={`${inputClass} h-24`} />
              </Field>
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
                    const names = namesFor(status);
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
  const [photoError, setPhotoError] = useState('');
  const [fd, setFd] = useState({
    firstName: member?.firstName || '',
    lastName: member?.lastName || '',
    email: member?.email || '',
    password: '',
    profilePicture: member?.profilePicture || '',
    spouse: member?.spouse || '',
    birthday: member?.birthday || '',
    anniversary: member?.anniversary || '',
    address: member?.address || '',
    summerAddress: member?.summerAddress || '',
    phoneCell: member?.phoneCell || '',
    phoneHome: member?.phoneHome || '',
    phoneSummer: member?.phoneSummer || '',
    role: member?.role || 'member'
  });

  const set = (key) => (e) => setFd({ ...fd, [key]: e.target.value });

  const canSubmit =
    fd.firstName.trim() && fd.lastName.trim() && fd.email.trim() && (!isNew || fd.password.trim().length >= 6);

  const handlePhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // so picking the same file twice still triggers onChange
    if (!file) return;
    setPhotoError('');
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setFd((prev) => ({ ...prev, profilePicture: dataUrl }));
    } catch (err) {
      setPhotoError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">{isNew ? 'Add Member' : 'Edit Member'}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">{error}</div>}

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar user={{ firstName: fd.firstName, lastName: fd.lastName, profilePicture: fd.profilePicture }} size="xl" />
              <div>
                <label htmlFor="photo-upload" className="inline-block px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                  {fd.profilePicture ? 'Change photo' : 'Upload photo'}
                </label>
                <input id="photo-upload" type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
                {fd.profilePicture && (
                  <button onClick={() => setFd({ ...fd, profilePicture: '' })} className="ml-3 text-sm text-red-600 hover:underline">
                    Remove
                  </button>
                )}
                {photoError && <p className="text-xs text-red-600 mt-1">{photoError}</p>}
                <p className="text-xs text-gray-400 mt-1">Photos are resized automatically.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="First Name">
                <input type="text" value={fd.firstName} onChange={set('firstName')} className={inputClass} />
              </Field>
              <Field label="Last Name">
                <input type="text" value={fd.lastName} onChange={set('lastName')} className={inputClass} />
              </Field>
            </div>

            <Field label="Spouse / Significant Other">
              <input type="text" value={fd.spouse} onChange={set('spouse')} className={inputClass} />
            </Field>

            <Field label="Email">
              <input type="email" value={fd.email} onChange={set('email')} className={inputClass} />
            </Field>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isNew ? 'Temporary Password' : 'Reset Password'}
                {!isNew && <span className="text-gray-400 font-normal"> (leave blank to keep current)</span>}
              </label>
              <input type="password" value={fd.password} onChange={set('password')}
                placeholder={isNew ? 'Min. 6 characters' : '••••••••'} className={inputClass} />
              {isNew && <p className="text-xs text-gray-400 mt-1">Share this with the member directly. They'll use it to log in.</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Birthday">
                <input type="date" value={fd.birthday} onChange={set('birthday')} className={inputClass} />
              </Field>
              <Field label="Anniversary">
                <input type="date" value={fd.anniversary} onChange={set('anniversary')} className={inputClass} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Cell Phone">
                <input type="tel" value={fd.phoneCell} onChange={set('phoneCell')} className={inputClass} />
              </Field>
              <Field label="Home Phone">
                <input type="tel" value={fd.phoneHome} onChange={set('phoneHome')} className={inputClass} />
              </Field>
              <Field label="Summer Phone">
                <input type="tel" value={fd.phoneSummer} onChange={set('phoneSummer')} className={inputClass} />
              </Field>
            </div>

            <Field label="Address">
              <textarea value={fd.address} onChange={set('address')} className={`${inputClass} h-20`} />
            </Field>
            <Field label="Summer Address">
              <textarea value={fd.summerAddress} onChange={set('summerAddress')} className={`${inputClass} h-20`} />
            </Field>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={fd.role}
                disabled={roleLocked}
                onChange={set('role')}
                className={`${inputClass} disabled:bg-gray-100 disabled:text-gray-400`}
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
                    ? `Saving will give ${fullName(member)} full admin access, including managing members.`
                    : `Saving will remove ${fullName(member)}'s admin access.`}
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
            <Field label="Title">
              <input type="text" value={fd.title} onChange={(e) => setFd({ ...fd, title: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Message">
              <textarea value={fd.body} onChange={(e) => setFd({ ...fd, body: e.target.value })} className={`${inputClass} h-32`} />
            </Field>
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

  // ----- events -----
  const openEvent = (evt) => { setSelectedEvent(evt); setModalError(''); setShowEventModal(true); };
  const openNewEvent = () => { setSelectedEvent(null); setModalError(''); setShowEventModal(true); };
  const closeEventModal = () => { setShowEventModal(false); setSelectedEvent(null); setModalError(''); };

  const saveEvent = async (data) => {
    setSaving(true);
    setModalError('');
    try {
      const body = {
        title: data.title,
        description: data.description,
        // the input gives me local time with no timezone, so I turn it into a real UTC timestamp here.
        // this is the line that fixes the "4 hours early" bug
        date: new Date(data.date).toISOString(),
        location: data.location
      };
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

  // ----- members -----
  const openMember = (m) => { setSelectedMember(m); setModalError(''); setShowMemberModal(true); };
  const openNewMember = () => { setSelectedMember(null); setModalError(''); setShowMemberModal(true); };
  const closeMemberModal = () => { setShowMemberModal(false); setSelectedMember(null); setModalError(''); };

  const saveMember = async (data) => {
    setSaving(true);
    setModalError('');
    try {
      const body = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        profilePicture: data.profilePicture,
        spouse: data.spouse,
        birthday: data.birthday,
        anniversary: data.anniversary,
        address: data.address,
        summerAddress: data.summerAddress,
        phoneCell: data.phoneCell,
        phoneHome: data.phoneHome,
        phoneSummer: data.phoneSummer,
        role: data.role
      };
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

  // ----- announcements -----
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
              <span className="font-medium">{fullName(currentUser)}</span>
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
                          {a.createdBy ? `Posted by ${fullName(a.createdBy)}` : 'Posted'} · {new Date(a.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
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
              <h2 className="text-lg font-semibold text-gray-800">
                Members <span className="text-gray-400 font-normal text-sm">({users.length})</span>
              </h2>
              <button onClick={openNewMember} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
                <Plus className="w-4 h-4" /> Add Member
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[...users].sort(byLastName).map(u => (
                <div key={u.id} className="border border-gray-200 rounded-xl p-4 flex gap-4">
                  <Avatar user={u} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-800 truncate">{fullName(u)}</h3>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'}`}>
                          {u.role}
                        </span>
                      </div>
                      <button onClick={() => openMember(u)} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex-shrink-0">
                        Edit
                      </button>
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-gray-600">
                      {u.spouse && <Detail icon={Heart} label="Spouse/SO">{u.spouse}</Detail>}
                      <Detail icon={Mail}>{u.email}</Detail>
                      {u.phoneCell && <Detail icon={Phone} label="Cell">{u.phoneCell}</Detail>}
                      {u.phoneHome && <Detail icon={Phone} label="Home">{u.phoneHome}</Detail>}
                      {u.phoneSummer && <Detail icon={Phone} label="Summer">{u.phoneSummer}</Detail>}
                      {u.birthday && <Detail icon={Cake} label="Birthday">{formatMonthDay(u.birthday)}</Detail>}
                      {u.anniversary && <Detail icon={Gift} label="Anniversary">{formatMonthDay(u.anniversary)}</Detail>}
                      {u.address && <Detail icon={MapPin} label="Address">{u.address}</Detail>}
                      {u.summerAddress && <Detail icon={Sun} label="Summer address">{u.summerAddress}</Detail>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showEventModal && (
        <EventModal
          event={selectedEvent}
          isAdmin={isAdmin}
          currentUser={currentUser}
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
  const [view, setView] = useState('login'); // 'login' | 'forgot' | 'reset' | 'app'
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