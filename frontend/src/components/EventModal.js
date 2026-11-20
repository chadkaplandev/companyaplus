import React, { useState } from 'react';
import { Clock, MapPin, Users, X } from 'lucide-react';
import { toLocalInputValue } from '../helpers';
import { Field, inputClass } from './ui';

export default function EventModal({ event, isAdmin, currentUser, saving, error, onClose, onSave, onDelete, onRsvp }) {
  const isNew = !event;
  const [initialFd] = useState(() => ({
    title: event?.title || '',
    description: event?.description || '',
    date: event?.date ? toLocalInputValue(event.date) : '',
    location: event?.location || ''
  }));
  const [fd, setFd] = useState(initialFd);
  const [editing, setEditing] = useState(isNew);

  // only counts as unsaved if I'm in the edit form and something actually changed
  const dirty = editing && JSON.stringify(fd) !== JSON.stringify(initialFd);
  const confirmDiscard = () => !dirty || window.confirm('Close without saving? What you typed will be lost.');
  const requestClose = () => { if (confirmDiscard()) onClose(); };
  const cancelEditing = () => {
    if (confirmDiscard()) {
      setFd(initialFd);
      setEditing(false);
    }
  };

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
    // no click-outside-to-close, only the X closes it
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">
              {isNew ? 'Create Event' : editing ? 'Edit Event' : event.title}
            </h2>
            <button onClick={requestClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
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
                  <button onClick={cancelEditing} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
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
                      className={`flex-1 py-2 rounded-lg font-medium capitalize transition-colors disabled:opacity-60 ${myRsvp === status
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
                        <p className={`text-xs font-semibold uppercase tracking-wide ${status === 'yes' ? 'text-green-600' : status === 'no' ? 'text-red-600' : 'text-yellow-600'
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