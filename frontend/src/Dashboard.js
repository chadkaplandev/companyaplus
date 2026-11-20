import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, MapPin, Plus, ChevronLeft, ChevronRight, User, LogOut, Cake, Heart, Phone, Mail, Megaphone, Sun, Gift, Upload, Search, X } from 'lucide-react';
import { apiFetch } from './api';
import {
  byLastName,
  formatMonthDay,
  fullName,
  normalizeAnnouncement,
  normalizeEvent,
  normalizeUser,
  uploadAttachment
} from './helpers';
import { Avatar, Detail, inputClass } from './components/ui';
import EventModal from './components/EventModal';
import MemberModal from './components/MemberModal';
import AnnouncementModal, { Attachments } from './components/AnnouncementModal';
import ImportModal from './components/ImportModal';
import MailingListModal from './components/MailingListModal';
import MonthCalendar from './components/MonthCalendar';
import AnnouncementBody from './components/AnnouncementBody'

export default function Dashboard({ currentUser, token, onLogout }) {
  const [tab, setTab] = useState('calendar');
  const [viewDate, setViewDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [showEventModal, setShowEventModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMailingModal, setShowMailingModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

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
    try {
      const data = await apiFetch('/users', { token });
      setUsers(data.map(normalizeUser));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, [token]);

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

  const importMembers = async (members) => {
    const data = await apiFetch('/users/import', { method: 'POST', token, body: { members } });
    await loadUsers();
    return data;
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
      let announcementId = data.id;
      if (data.id) {
        await apiFetch(`/announcements/${data.id}`, { method: 'PUT', token, body });
      } else {
        const created = await apiFetch('/announcements', { method: 'POST', token, body });
        announcementId = created._id;
      }

      // file problems get collected instead of stopping everything, otherwise a retry
      // could post the same announcement twice
      const problems = [];
      for (const attId of data.removedIds || []) {
        try {
          await apiFetch(`/announcements/${announcementId}/attachments/${attId}`, { method: 'DELETE', token });
        } catch (err) {
          problems.push(`a file couldn't be removed (${err.message})`);
        }
      }
      for (const file of data.newFiles || []) {
        try {
          await uploadAttachment(announcementId, file, token);
        } catch (err) {
          problems.push(`${file.name} didn't upload (${err.message})`);
        }
      }

      await loadAnnouncements();
      closeAnnouncementModal();
      if (problems.length) {
        setLoadError(`The announcement was saved, but ${problems.join('; ')}. Edit it to try again.`);
      }
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

  // every word typed has to appear in the member's name, so "smith jo" and "jo smith" both find Jo Smith
  const searchWords = memberSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleMembers = [...users]
    .filter((u) => {
      const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      return searchWords.every((w) => name.includes(w));
    })
    .sort(byLastName);

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
          <button onClick={() => setTab('members')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'members' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
            Members
          </button>
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
                    <div className="mt-3"><AnnouncementBody body={a.body} token={token} /></div>
                    <Attachments files={a.attachments} token={token} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'members' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
              <h2 className="text-lg font-semibold text-gray-800">
                Members <span className="text-gray-400 font-normal text-sm">({users.length})</span>
              </h2>
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setShowMailingModal(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">
                    <Mail className="w-4 h-4" /> Mailing List
                  </button>
                  <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">
                    <Upload className="w-4 h-4" /> Import CSV
                  </button>
                  <button onClick={openNewMember} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
                    <Plus className="w-4 h-4" /> Add Member
                  </button>
                </div>
              )}
            </div>

            <div className="relative mb-4">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search members by name"
                className={`${inputClass} pl-9 pr-9`}
              />
              {memberSearch && (
                <button onClick={() => setMemberSearch('')} title="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {searchWords.length > 0 && (
              <p className="text-xs text-gray-500 mb-3">Showing {visibleMembers.length} of {users.length} members</p>
            )}
            {visibleMembers.length === 0 && users.length > 0 && (
              <p className="text-sm text-gray-400">No members match your search.</p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {visibleMembers.map(u => (
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
                      {isAdmin && (
                        <button onClick={() => openMember(u)} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex-shrink-0">
                          Edit
                        </button>
                      )}
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
          token={token}
        />
      )}

      {showImportModal && (
        <ImportModal onClose={() => setShowImportModal(false)} onImport={importMembers} />
      )}

      {showMailingModal && (
        <MailingListModal users={users} onClose={() => setShowMailingModal(false)} />
      )}
    </div>
  );
}