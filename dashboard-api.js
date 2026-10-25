// Eğitmen panosu API'si. server.js tarafından şöyle çağrılır:
// require('./dashboard-api')(app, db, auth, id => ...);
module.exports = function registerDashboard(app, db, auth, roomName) {
  const rn = id => (typeof roomName === 'function' ? roomName(id) : id);

  // Yalnızca eğitmen veya yönetici hesapları
  function teacherOnly(req, res, next) {
    if (req.user && (req.user.role === 'teacher' || req.user.isAdmin)) return next();
    return res.status(403).json({ error: 'Bu sayfa yalnızca eğitmenler içindir.' });
  }

  // Yerel tarihe göre "bugünden N gün önce" (attendance.day alanıyla aynı biçimde)
  function sinceFor(days) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1));
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function parseDays(q) {
    const n = Number(q);
    return Number.isInteger(n) && n > 0 && n <= 365 ? n : 30;
  }

  function collect(db, days) {
    const since = sinceFor(days);

    const sessions = db.prepare(
      'SELECT COUNT(*) AS c FROM (SELECT room_id, day FROM attendance WHERE day >= ? GROUP BY room_id, day)'
    ).get(since).c;

    const totalStudents = db.prepare(
      "SELECT COUNT(*) AS c FROM users WHERE role = 'student' AND is_admin = 0"
    ).get().c;

    const totalRows = db.prepare(
      'SELECT COUNT(*) AS c FROM attendance WHERE day >= ?'
    ).get(since).c;

    const activeStudents = db.prepare(
      'SELECT COUNT(DISTINCT user_id) AS c FROM attendance WHERE day >= ?'
    ).get(since).c;

    const daily = db.prepare(
      'SELECT day, COUNT(*) AS count, COUNT(DISTINCT user_id) AS people FROM attendance WHERE day >= ? GROUP BY day ORDER BY day'
    ).all(since);

    const rooms = db.prepare(
      'SELECT room_id AS roomId, COUNT(*) AS count FROM attendance WHERE day >= ? GROUP BY room_id ORDER BY count DESC'
    ).all(since).map(r => ({ roomId: r.roomId, name: rn(r.roomId), count: r.count }));

    const students = db.prepare(`
      SELECT u.id, u.display_name AS name, COUNT(a.id) AS count, MAX(a.day) AS lastDay
      FROM users u
      LEFT JOIN attendance a ON a.user_id = u.id AND a.day >= ?
      WHERE u.role = 'student' AND u.is_admin = 0
      GROUP BY u.id
      ORDER BY count DESC, u.display_name COLLATE NOCASE
    `).all(since);

    return {
      days,
      since,
      totals: {
        sessions,
        avgPerSession: sessions ? totalRows / sessions : 0,
        activeStudents,
        totalStudents,
        participationRate: totalStudents ? activeStudents / totalStudents : 0
      },
      daily: daily.map(d => ({ day: d.day, count: d.count, people: d.people })),
      rooms,
      students: students.map(s => ({ id: s.id, name: s.name, count: s.count, lastDay: s.lastDay || null }))
    };
  }

  app.get('/api/dashboard/summary', auth, teacherOnly, (req, res) => {
    res.json(collect(db, parseDays(req.query.days)));
  });

  app.get('/api/dashboard/export.csv', auth, teacherOnly, (req, res) => {
    const days = parseDays(req.query.days);
    const data = collect(db, days);
    // Türkçe Excel noktalı virgülle ayırır
    const esc = v => {
      const s = String(v == null ? '' : v);
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [['Ad', 'Katılım', 'Oran', 'Son katılım'].join(';')];
    for (const s of data.students) {
      const rate = data.totals.sessions ? Math.round(s.count / data.totals.sessions * 100) : 0;
      lines.push([s.name, s.count, rate + '%', s.lastDay || ''].map(esc).join(';'));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="katilim-' + days + '-gun.csv"');
    res.send('\uFEFF' + lines.join('\r\n'));
  });
};
