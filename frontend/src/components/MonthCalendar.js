import React from 'react';

export default function MonthCalendar({ viewDate, events, onEventClick }) {
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