/* Prototype C: Quiet Native Utility. Sample data only; see shared.js. */
(function () {
  'use strict'
  var P = window.Proto
  var dur = function (min) {
    min = Math.round(min)
    var h = Math.floor(min / 60)
    return h ? h + 'h ' + P.pad(min % 60) + 'm' : min + 'm'
  }
  var dot = function (catId) {
    return '<i class="dot s' + P.slotOf(catId) + '" aria-hidden="true"></i>'
  }
  var chev = '<svg class="chev" viewBox="0 0 8 13" width="8" height="13" aria-hidden="true"><path d="M1.5 1.5l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  // Tab icons: plain line drawings, there because a tab bar is read by shape.
  var ICONS = {
    track: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 1.5M9.5 2.5h5"/>',
    explore: '<path d="M4 20V11M10 20V5M16 20v-7M22 20H2"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  }
  var name = function (id) {
    return '<span class="pri">' + P.name(id) + '</span>' + (P.parent(id) ? '<span class="sec"> — ' + P.parent(id) + '</span>' : '')
  }

  function tabbar(s) {
    return (
      '<nav class="tabbar" aria-label="Sections">' +
      [['track', 'Track'], ['explore', 'Explore'], ['settings', 'Settings']].map(function (t) {
        return '<button data-act="tab" data-arg="' + t[0] + '"' + (s.tab === t[0] ? ' aria-current="page"' : '') + '><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[t[0]] + '</svg><span>' + t[1] + '</span></button>'
      }).join('') +
      '</nav>'
    )
  }

  /** One thin bar for the day's split between groups. */
  function split(day) {
    var rows = P.groupTotals(day)
    var total = P.sum(rows, function (r) { return r.min })
    if (!total) return ''
    return (
      '<div class="split" role="img" aria-label="Share of active time by group">' +
      rows.map(function (r) {
        return r.min ? '<i class="s' + r.slot + '" style="flex:' + r.min + '" data-tip="' + r.group + ' · ' + dur(r.min) + '"></i>' : ''
      }).join('') +
      '</div><p class="key">' +
      rows.map(function (r) {
        return r.min ? '<span><i class="dot s' + r.slot + '" aria-hidden="true"></i>' + r.group + ' ' + dur(r.min) + '</span>' : ''
      }).join('') +
      '</p>'
    )
  }

  function sessionRows(day, timer) {
    var rows = P.pieces(day).map(function (p) {
      var bits = [P.hm(p.s) + '–' + P.hm(p.e)]
      if (p.sess.title) bits.push(P.esc(p.sess.title))
      if (p.fromPrev) bits.push('from ' + P.dayName(day - 1, true))
      if (p.toNext) bits.push('continues past midnight')
      return '<li><button data-act="demo" data-arg="">' + dot(p.sess.cat) + '<span class="main">' + name(p.sess.cat) + '<span class="detail">' + bits.join(' · ') + '</span></span><span class="value">' + dur(p.active) + '</span>' + chev + '</button></li>'
    })
    if (timer && day === P.TODAY) {
      rows.push('<li class="live"><div>' + dot(timer.cat.id) + '<span class="main">' + name(timer.cat.id) + '<span class="detail">' + P.hm(timer.start / 60) + '– · ' + (timer.paused ? 'paused' : 'in progress') + '</span></span><span class="badge">' + (timer.paused ? 'Paused' : 'Now') + '</span></div></li>')
    }
    return rows.length ? '<ul class="list">' + rows.join('') + '</ul>' : '<ul class="list"><li><div class="empty">No sessions</div></li></ul>'
  }

  function track(s) {
    var t = P.timer()
    var out = ''
    if (t) {
      out +=
        '<section class="hero' + (t.paused ? ' is-paused' : '') + '" aria-label="Current session">' +
        '<p class="status"><i class="pulse" aria-hidden="true"></i>' + (t.paused ? 'Paused' : 'Recording') + '</p>' +
        '<h2>' + name(t.cat.id) + '</h2>' + (t.title ? '<p class="sub">' + P.esc(t.title) + '</p>' : '') +
        '<p class="clock" id="c-clock" role="timer" aria-label="Active time"></p>' +
        '<p class="sub" id="c-meta"></p>' +
        '<div class="actions">' +
        (t.paused ? '<button class="btn tint" data-act="resume">Resume</button>' : '<button class="btn" data-act="pause">Pause</button>') +
        '<button class="btn tint" data-act="finish">Finish</button>' +
        '<button class="btn round" data-act="menu" aria-label="More" aria-expanded="' + s.menu + '"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button></div>' +
        (s.menu ? '<ul class="list menu"><li><button class="danger" data-act="cancel">Discard Session</button></li></ul>' : '') +
        '</section>'
    } else {
      out +=
        (s.note ? '<p class="footnote lead" role="status">' + s.note + '</p>' : '') +
        '<h3 class="head">Start</h3><ul class="list">' +
        ['violin', 'maths', 'physics', 'reading'].map(function (id) {
          return '<li><button data-act="start" data-arg="' + id + '">' + dot(id) + '<span class="main">' + name(id) + '</span><span class="go">Start</span></button></li>'
        }).join('') +
        '<li><button data-act="demo" data-arg=""><span class="main link">All Categories</span>' + chev + '</button></li></ul>' +
        '<p class="footnote">Most recent first.</p>'
    }
    out +=
      '<h3 class="head">Today</h3>' +
      '<div class="summary"><p class="figure">' + dur(P.dayTotal(P.TODAY)) + '</p><p class="sub">' + P.pieces(P.TODAY).length + ' sessions' + (t ? ' · 1 in progress' : '') + '</p>' + split(P.TODAY) + '</div>' +
      sessionRows(P.TODAY, t)
    return out
  }

  function weekChart() {
    var W = 320, B = 118, max = 5 * 60, slot = W / 7, out = ''
    ;[2, 4].forEach(function (h) {
      var gy = B - ((h * 60) / max) * 100
      out += '<line class="grid" x1="0" y1="' + gy + '" x2="' + W + '" y2="' + gy + '"/><text x="' + W + '" y="' + (gy - 3) + '" text-anchor="end">' + h + 'h</text>'
    })
    for (var d = 0; d < 7; d++) {
      var cx = slot * d + slot / 2, yy = B
      out += '<g' + (d <= P.TODAY ? ' class="col" data-act="openDay" data-arg="' + d + '"' : '') + '><rect class="hit" x="' + slot * d + '" y="0" width="' + slot + '" height="140"/>'
      var rows = P.groupTotals(d)
      var top = -1
      rows.forEach(function (r, i) { if (r.min) top = i })
      rows.forEach(function (r, i) {
        if (!r.min) return
        var ht = (r.min / max) * 100
        yy -= ht
        var h2 = Math.max(1, ht - 2)
        // Only the top segment gets a curved cap; the rest stay square so the stack reads as one bar.
        out += i === top
          ? '<path class="s' + r.slot + '" d="M' + (cx - 8) + ' ' + (yy + h2 + 1).toFixed(1) + 'V' + (yy + 5).toFixed(1) + 'a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4V' + (yy + h2 + 1).toFixed(1) + 'z" data-tip="' + P.dayName(d, true) + ' · ' + r.group + ' · ' + dur(r.min) + '"/>'
          : '<rect class="s' + r.slot + '" x="' + (cx - 8) + '" y="' + (yy + 1).toFixed(1) + '" width="16" height="' + h2.toFixed(1) + '" data-tip="' + P.dayName(d, true) + ' · ' + r.group + ' · ' + dur(r.min) + '"/>'
      })
      out += '<text class="' + (d === P.TODAY ? 'now' : '') + '" x="' + cx + '" y="' + (B + 15) + '" text-anchor="middle">' + P.dayName(d, true).charAt(0) + '</text></g>'
    }
    return '<svg class="chart" viewBox="0 0 ' + W + ' 138" role="img" aria-label="Active time per day this week, stacked by group"><line class="base" x1="0" y1="' + B + '" x2="' + W + '" y2="' + B + '"/>' + out + '</svg>'
  }

  function sixWeeks() {
    var vals = P.PAST_WEEKS.concat([P.weekTotal() / 60])
    var W = 320, B = 70, slot = W / vals.length, out = ''
    vals.forEach(function (v, i) {
      var ht = (v / 20) * 60
      var cx = slot * i + slot / 2
      var last = i === vals.length - 1
      out += '<path class="' + (last ? 'bar cur' : 'bar') + '" d="M' + (cx - 9) + ' ' + B + 'V' + (B - ht + 4).toFixed(1) + 'a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4V' + B + 'z" data-tip="' + (last ? 'This week so far' : 'Week of ' + (2 + i * 7 > 28 ? 2 + i * 7 - 28 + ' Mar' : 2 + i * 7 + ' Feb')) + ' · ' + v.toFixed(1) + ' h"/>'
      if (last) out += '<text class="now" x="' + cx + '" y="' + (B - ht - 5).toFixed(1) + '" text-anchor="middle">' + v.toFixed(1) + 'h</text>'
    })
    return '<svg class="chart" viewBox="0 0 ' + W + ' 86" role="img" aria-label="Hours per week over six weeks"><line class="base" x1="0" y1="' + B + '" x2="' + W + '" y2="' + B + '"/>' + out + '<text x="0" y="83">5 weeks ago</text><text x="' + W + '" y="83" text-anchor="end">This week</text></svg>'
  }

  function explore(s) {
    var out =
      '<div class="segmented" role="group">' +
      [['day', 'Day'], ['week', 'Week'], ['patterns', 'Trends']].map(function (v) {
        return '<button data-act="view" data-arg="' + v[0] + '" aria-pressed="' + (s.view === v[0]) + '">' + v[1] + '</button>'
      }).join('') +
      '</div>'
    if (s.view === 'day') {
      out +=
        '<div class="daynav"><button data-act="day" data-arg="-1" aria-label="Previous day"' + (s.day === 0 ? ' disabled' : '') + '><svg viewBox="0 0 8 13" width="10" height="16" aria-hidden="true"><path d="M6.5 1.5l-5 5 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        P.datePick(s.day === P.TODAY ? 'Today, ' + P.dayDate(s.day) + ' March' : P.dayName(s.day) + ', ' + P.dayDate(s.day) + ' March') +
        '<button data-act="day" data-arg="1" aria-label="Next day"' + (s.day === P.TODAY ? ' disabled' : '') + '><svg viewBox="0 0 8 13" width="10" height="16" aria-hidden="true"><path d="M1.5 1.5l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>' +
        '<div class="summary"><p class="figure">' + dur(P.dayTotal(s.day)) + '</p><p class="sub">' + P.pieces(s.day).length + ' sessions</p>' + split(s.day) + '</div>' +
        sessionRows(s.day, P.timer())
    } else if (s.view === 'week') {
      var cats = P.catTotals()
      out +=
        '<div class="summary"><p class="sub">9–15 March</p><p class="figure">' + dur(P.weekTotal()) + '</p><p class="sub">' + P.SESSIONS.length + ' sessions · ' + dur(P.weekTotal() / (P.TODAY + 1)) + ' a day</p>' + weekChart() +
        '<p class="key">' + P.groupTotals(null).map(function (r) { return '<span><i class="dot s' + r.slot + '" aria-hidden="true"></i>' + r.group + '</span>' }).join('') + '</p></div>' +
        '<h3 class="head">Categories</h3><ul class="list">' +
        cats.map(function (r) {
          return '<li><div>' + dot(r.cat.id) + '<span class="main">' + name(r.cat.id) + '<span class="meter"><i class="s' + P.slotOf(r.cat.id) + '" style="width:' + ((r.min / cats[0].min) * 100).toFixed(1) + '%"></i></span></span><span class="value">' + dur(r.min) + '</span></div></li>'
        }).join('') +
        '</ul>'
    } else {
      var longest = 0
      P.SESSIONS.forEach(function (x) { longest = Math.max(longest, x.e - x.s - P.sum(x.pauses, function (p) { return p[1] - p[0] })) })
      out +=
        '<p class="footnote lead">A preview with sample data. Trends are not built yet.</p>' +
        '<div class="tiles"><div><p class="sub">Daily average</p><p class="figure sm">' + dur(P.weekTotal() / (P.TODAY + 1)) + '</p></div><div><p class="sub">Longest session</p><p class="figure sm">' + dur(longest) + '</p></div><div><p class="sub">Typical start</p><p class="figure sm">09:05</p></div><div><p class="sub">Sessions a day</p><p class="figure sm">' + (P.SESSIONS.length / (P.TODAY + 1)).toFixed(1) + '</p></div></div>' +
        '<h3 class="head">Last six weeks</h3><div class="summary">' + sixWeeks() + '</div>' +
        '<p class="footnote">Totals only. Cadence does not set targets or score your weeks.</p>'
    }
    return out
  }

  function settings(s) {
    var row = function (id) {
      return '<li><button data-act="demo" data-arg="">' + dot(id) + '<span class="main">' + name(id) + '</span>' + chev + '</button></li>'
    }
    return (
      '<h3 class="head">Categories</h3><ul class="list">' + ['maths', 'physics', 'violin', 'piano', 'reading', 'admin'].map(row).join('') +
      '<li><button data-act="demo" data-arg="New Category would open here."><span class="main link">Add Category</span></button></li></ul>' +
      '<p class="footnote">Shown as name first, then group. A group is just a category that has others inside it.</p>' +
      '<ul class="list"><li><button data-act="demo" data-arg=""><span class="main">Archived</span><span class="value">1</span>' + chev + '</button></li></ul>' +
      '<h3 class="head">Backup</h3><ul class="list"><li><button data-act="demo" data-arg="The share sheet would open with your backup file."><span class="main link">Export Backup</span></button></li><li><button data-act="demo" data-arg="You would choose a file, review it, then confirm."><span class="main link">Restore from Backup…</span></button></li></ul>' +
      '<p class="footnote">Your data stays on this iPhone. It is not synced, so export a backup now and then.</p>' +
      '<h3 class="head">Preferences</h3><ul class="list"><li><button data-act="demo" data-arg=""><span class="main">Week Starts On</span><span class="value">Monday</span>' + chev + '</button></li><li><button data-act="demo" data-arg=""><span class="main">Appearance</span><span class="value">Automatic</span>' + chev + '</button></li><li><div><span class="main">Offer Reflection After Finishing</span><span class="switch" role="img" aria-label="On"></span></div></li></ul>' +
      (s.note ? '<p class="footnote lead" role="status">' + s.note + '</p>' : '')
    )
  }

  P.mount({
    render: function (s) {
      var title = { track: 'Track', explore: 'Explore', settings: 'Settings' }[s.tab]
      var body = s.tab === 'track' ? track(s) : s.tab === 'explore' ? explore(s) : settings(s)
      document.getElementById('app').innerHTML =
        tabbar(s) + '<main class="screen"><header class="large"><p class="date">Thursday 12 March</p><h1>' + title + '</h1></header>' + body + '</main>'
    },
    tick: function (t) {
      var clock = document.getElementById('c-clock')
      if (!clock || !t) return
      clock.textContent = P.clock(t.active)
      document.getElementById('c-meta').textContent =
        'Started ' + P.hm(t.start / 60) + (t.pausedFor >= 60 ? ' · ' + dur(t.pausedFor / 60) + ' paused' : '')
    },
  })
})()
