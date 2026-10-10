/* Prototype B: Analytical Instrument. Sample data only; see shared.js. */
(function () {
  'use strict'
  var P = window.Proto
  var hhmm = function (min) {
    min = Math.round(min)
    return P.pad(Math.floor(min / 60)) + ':' + P.pad(min % 60)
  }
  var sw = function (slot) {
    return '<i class="sw s' + slot + '" aria-hidden="true"></i>'
  }
  var seg = function (items, current, act) {
    return (
      '<div class="seg" role="group">' +
      items.map(function (it) {
        return '<button data-act="' + act + '" data-arg="' + it[0] + '" aria-pressed="' + (current === it[0]) + '">' + it[1] + '</button>'
      }).join('') +
      '</div>'
    )
  }

  function nav(s) {
    var items = [['track', 'Track'], ['explore', 'Explore'], ['settings', 'Settings']]
    return (
      '<nav class="rail" aria-label="Sections">' +
      items.map(function (t, i) {
        return '<button data-act="tab" data-arg="' + t[0] + '"' + (s.tab === t[0] ? ' aria-current="page"' : '') + '><span class="idx">0' + (i + 1) + '</span>' + t[1] + '</button>'
      }).join('') +
      '</nav>'
    )
  }

  /** 06:00–24:00 as one strip, coloured by group, with the live session outlined. */
  function dayStrip(day, timer) {
    var W = 320
    var x = function (min) {
      return ((Math.max(360, Math.min(1440, min)) - 360) / 1080) * W
    }
    var out = ''
    for (var h = 6; h <= 24; h += 1) {
      out += '<line class="' + (h % 6 === 0 ? 'tick major' : 'tick') + '" x1="' + x(h * 60).toFixed(1) + '" y1="' + (h % 6 === 0 ? 0 : 22) + '" x2="' + x(h * 60).toFixed(1) + '" y2="28"/>'
    }
    P.pieces(day).forEach(function (p) {
      if (p.e <= 360) return
      out += '<rect class="s' + P.slotOf(p.sess.cat) + '" x="' + (x(p.s) + 1).toFixed(1) + '" y="6" width="' + Math.max(2, x(p.e) - x(p.s) - 2).toFixed(1) + '" height="14" rx="1.5" data-tip="' + P.label(p.sess.cat) + ' · ' + P.hm(p.s) + '–' + P.hm(p.e) + ' · ' + hhmm(p.active) + '"/>'
    })
    if (timer && day === P.TODAY) {
      out += '<rect class="livebox s' + P.slotOf(timer.cat.id) + '" x="' + (x(timer.start / 60) + 1).toFixed(1) + '" y="6" width="' + Math.max(3, x(P.now() / 60) - x(timer.start / 60) - 2).toFixed(1) + '" height="14" rx="1.5"/>'
    }
    ;[6, 12, 18, 24].forEach(function (h) {
      out += '<text x="' + x(h * 60) + '" y="40" text-anchor="' + (h === 6 ? 'start' : h === 24 ? 'end' : 'middle') + '">' + P.pad(h) + ':00</text>'
    })
    return '<svg class="strip" viewBox="0 0 ' + W + ' 42" role="img" aria-label="Sessions across the day, by group">' + out + '</svg>'
  }

  function legend(day, withShare) {
    var rows = P.groupTotals(day)
    var total = P.sum(rows, function (r) { return r.min }) || 1
    return (
      '<table class="readout"><tbody>' +
      rows.map(function (r) {
        return '<tr><th scope="row">' + sw(r.slot) + r.group + '</th><td>' + hhmm(r.min) + '</td>' + (withShare ? '<td class="dim">' + Math.round((r.min / total) * 100) + '%</td>' : '') + '</tr>'
      }).join('') +
      '</tbody></table>'
    )
  }

  function track(s) {
    var t = P.timer()
    var out = ''
    if (t) {
      out +=
        '<section class="panel" aria-label="Current session"><header><h2><span class="idx">01</span>Session</h2>' +
        '<span class="state ' + (t.paused ? 'hold' : 'run') + '">' + (t.paused ? 'Paused' : 'Running') + '</span></header>' +
        '<div class="scope"><p class="chan">' + P.label(t.cat.id) + '</p>' + (t.title ? '<p class="dim">' + P.esc(t.title) + '</p>' : '') +
        '<p class="big" id="b-clock" role="timer" aria-label="Active time"></p><p class="unit">active · hh:mm:ss</p></div>' +
        '<dl class="cells"><div><dt>Start</dt><dd>' + P.hm(t.start / 60) + '</dd></div><div><dt>Elapsed</dt><dd id="b-elapsed"></dd></div><div><dt>Paused</dt><dd id="b-paused"></dd></div></dl>' +
        '<div class="trace" id="b-trace" aria-hidden="true"></div>' +
        '<div class="keys">' +
        (t.paused ? '<button class="key main" data-act="resume">Resume</button>' : '<button class="key main" data-act="pause">Pause</button>') +
        '<button class="key" data-act="finish">Finish</button>' +
        '<button class="key narrow" data-act="menu" aria-label="More actions" aria-expanded="' + s.menu + '">···</button></div>' +
        (s.menu ? '<div class="drawer"><button class="key warn" data-act="cancel">Discard session</button><span class="dim">Not saved. Cannot be undone.</span></div>' : '') +
        '</section>'
    } else {
      out +=
        '<section class="panel" aria-label="Start a session"><header><h2><span class="idx">01</span>Session</h2><span class="state idle">Idle</span></header>' +
        (s.note ? '<p class="log">' + s.note + '</p>' : '') +
        '<ul class="pick">' +
        ['violin', 'maths', 'physics', 'reading', 'piano', 'admin'].map(function (id) {
          return '<li><button data-act="start" data-arg="' + id + '">' + sw(P.slotOf(id)) + '<span>' + P.label(id) + '</span><span class="dim">Start</span></button></li>'
        }).join('') +
        '</ul></section>'
    }
    out +=
      '<section class="panel" aria-label="Today"><header><h2><span class="idx">02</span>Today</h2><span class="dim">' + P.pieces(P.TODAY).length + ' saved' + (t ? ' · 1 live' : '') + '</span></header>' +
      '<p class="total"><span class="num">' + hhmm(P.dayTotal(P.TODAY)) + '</span><span class="unit">active · hh:mm</span></p>' +
      dayStrip(P.TODAY, t) + legend(P.TODAY, true) + '</section>'
    return out
  }

  /** Every session drawn to scale against the clock. */
  function timeline(day, timer) {
    var all = P.pieces(day)
    // A session that began the day before is listed above the scale, so one
    // early-morning remainder does not stretch the whole day out.
    var carried = [], ps = []
    all.forEach(function (p) {
      ;(p.fromPrev ? carried : ps).push(p)
    })
    var live = timer && day === P.TODAY
    var first = ps.length ? Math.floor(ps[0].s / 60) : 8
    var last = Math.ceil(Math.max(ps.length ? ps[ps.length - 1].e : 600, live ? P.now() / 60 : 0) / 60)
    first = Math.max(0, first)
    last = Math.min(24, Math.max(last, first + 4))
    var PX = 44
    var y = function (min) {
      return ((min - first * 60) / 60) * PX
    }
    var out = ''
    for (var h = first; h <= last; h++) out += '<div class="hour" style="top:' + y(h * 60) + 'px"><span>' + P.pad(h % 24) + ':00</span></div>'
    ps.forEach(function (p) {
      var x = p.sess
      var ht = Math.max(15, y(p.e) - y(p.s) - 2)
      var meta = P.hm(p.s) + '–' + P.hm(p.e) + ' · ' + hhmm(p.active) + (p.paused ? ' · ' + hhmm(p.paused) + ' paused' : '')
      out +=
        '<div class="blk s' + P.slotOf(x.cat) + (ht < 30 ? ' tight' : '') + '" style="top:' + (y(p.s) + 1).toFixed(1) + 'px;height:' + ht.toFixed(1) + 'px">' +
        x.pauses.map(function (pp) {
          var shift = (x.d - day) * 1440
          return '<i class="gap" style="top:' + (y(pp[0] + shift) - y(p.s)).toFixed(1) + 'px;height:' + (y(pp[1] + shift) - y(pp[0] + shift)).toFixed(1) + 'px"></i>'
        }).join('') +
        '<p><b>' + P.label(x.cat) + '</b>' + (p.fromPrev ? ' <span class="tag">from ' + P.dayName(day - 1, true) + '</span>' : '') + (p.toNext ? ' <span class="tag">past 24:00</span>' : '') + '</p>' +
        '<p class="dim">' + meta + (x.conc !== null ? ' · C' + x.conc : '') + (x.fat !== null ? ' · F' + x.fat : '') + '</p></div>'
    })
    if (live) {
      out +=
        '<div class="blk live tight s' + P.slotOf(timer.cat.id) + '" style="top:' + (y(timer.start / 60) + 1).toFixed(1) + 'px;height:' + Math.max(22, y(P.now() / 60) - y(timer.start / 60) - 2).toFixed(1) + 'px">' +
        '<p><b>' + P.label(timer.cat.id) + '</b> <span class="tag">' + (timer.paused ? 'paused' : 'running') + '</span></p><p class="dim">from ' + P.hm(timer.start / 60) + '</p></div>' +
        '<div class="nowline" style="top:' + y(P.now() / 60).toFixed(1) + 'px"><span>' + P.hm(P.now() / 60) + '</span></div>'
    }
    var head = carried.map(function (p) {
      return '<p class="carry s' + P.slotOf(p.sess.cat) + '"><b>' + P.label(p.sess.cat) + '</b> <span class="tag">from ' + P.dayName(day - 1, true) + '</span><span class="dim">' + P.hm(p.s) + '–' + P.hm(p.e) + ' · ' + hhmm(p.active) + '</span></p>'
    }).join('')
    return head + '<div class="tl" style="height:' + (y(last * 60) + 14) + 'px">' + out + '</div>'
  }

  function weekChart() {
    var W = 320, H = 170, L = 26, B = 140
    var max = 5 * 60
    var slot = (W - L) / 7
    var out = ''
    for (var h = 0; h <= 5; h++) {
      var gy = B - (h * 60 / max) * 120
      out += '<line class="grid" x1="' + L + '" y1="' + gy + '" x2="' + W + '" y2="' + gy + '"/><text x="' + (L - 6) + '" y="' + (gy + 3) + '" text-anchor="end">' + h + 'h</text>'
    }
    for (var d = 0; d < 7; d++) {
      var cx = L + slot * d + slot / 2
      var rows = P.groupTotals(d)
      var yy = B
      var total = P.dayTotal(d)
      out += '<g' + (d <= P.TODAY ? ' class="col" data-act="openDay" data-arg="' + d + '"' : '') + '><rect class="hit" x="' + (L + slot * d) + '" y="0" width="' + slot + '" height="' + H + '"/>'
      rows.forEach(function (r) {
        if (!r.min) return
        var ht = (r.min / max) * 120
        yy -= ht
        out += '<rect class="s' + r.slot + '" x="' + (cx - 9) + '" y="' + (yy + 1).toFixed(1) + '" width="18" height="' + Math.max(1, ht - 2).toFixed(1) + '" rx="1.5" data-tip="' + P.dayName(d, true) + ' · ' + r.group + ' · ' + hhmm(r.min) + '"/>'
      })
      if (total) out += '<text class="val" x="' + cx + '" y="' + (yy - 5).toFixed(1) + '" text-anchor="middle">' + hhmm(total) + '</text>'
      out += '<text class="' + (d === P.TODAY ? 'val' : '') + '" x="' + cx + '" y="' + (B + 16) + '" text-anchor="middle">' + P.dayName(d, true).toUpperCase() + '</text></g>'
    }
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Active time per day this week, stacked by group">' + out + '</svg>'
  }

  function weekTable() {
    var out = ''
    for (var d = 0; d < 7; d++) {
      var n = P.pieces(d).length
      out += d <= P.TODAY
        ? '<tr><th scope="row"><button data-act="openDay" data-arg="' + d + '">' + P.dayName(d, true) + ' ' + P.dayDate(d) + '</button></th><td>' + n + '</td><td>' + hhmm(P.dayTotal(d)) + '</td></tr>'
        : '<tr class="dim"><th scope="row">' + P.dayName(d, true) + ' ' + P.dayDate(d) + '</th><td>–</td><td>–</td></tr>'
    }
    return '<table class="readout wide"><thead><tr><th scope="col">Day</th><th scope="col">Sessions</th><th scope="col">Active</th></tr></thead><tbody>' + out + '</tbody></table>'
  }

  /** Day × hour matrix: one hue, darker = more of that hour was active. */
  function heat() {
    var W = 320, L = 30, cell = (W - L) / 18, out = ''
    for (var d = 0; d <= P.TODAY; d++) {
      out += '<text x="0" y="' + (d * (cell + 2) + cell * 0.72).toFixed(1) + '">' + P.dayName(d, true).toUpperCase() + '</text>'
      for (var h = 6; h < 24; h++) {
        var min = 0
        P.pieces(d).forEach(function (p) {
          min += Math.max(0, Math.min(p.e, h * 60 + 60) - Math.max(p.s, h * 60))
        })
        var step = min === 0 ? 0 : min <= 15 ? 1 : min <= 30 ? 2 : min <= 45 ? 3 : 4
        out += '<rect class="q' + step + '" x="' + (L + (h - 6) * cell + 1).toFixed(1) + '" y="' + (d * (cell + 2)).toFixed(1) + '" width="' + (cell - 2).toFixed(1) + '" height="' + (cell - 2).toFixed(1) + '" rx="1.5" data-tip="' + P.dayName(d, true) + ' ' + P.pad(h) + ':00 · ' + Math.round(min) + ' min"/>'
      }
    }
    var base = (P.TODAY + 1) * (cell + 2) + 10
    ;[6, 9, 12, 15, 18, 21].forEach(function (h) {
      out += '<text x="' + (L + (h - 6) * cell + 1).toFixed(1) + '" y="' + base.toFixed(1) + '">' + P.pad(h) + '</text>'
    })
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + (base + 4).toFixed(0) + '" role="img" aria-label="Minutes recorded in each hour, by day">' + out + '</svg>' +
      '<p class="scale" aria-hidden="true"><span>0</span><i class="q0"></i><i class="q1"></i><i class="q2"></i><i class="q3"></i><i class="q4"></i><span>60 min</span></p>'
  }

  function histogram() {
    var edges = [0, 30, 60, 90, 120]
    var counts = [0, 0, 0, 0, 0]
    P.SESSIONS.forEach(function (x) {
      var m = x.e - x.s - P.sum(x.pauses, function (p) { return p[1] - p[0] })
      var i = Math.min(4, Math.floor(m / 30))
      counts[i]++
    })
    var W = 320, L = 26, B = 96, slot = (W - L) / 5, max = Math.max.apply(null, counts), out = ''
    for (var g = 0; g <= max; g += 2) {
      var gy = B - (g / max) * 80
      out += '<line class="grid" x1="' + L + '" y1="' + gy.toFixed(1) + '" x2="' + W + '" y2="' + gy.toFixed(1) + '"/><text x="' + (L - 6) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end">' + g + '</text>'
    }
    counts.forEach(function (c, i) {
      var ht = (c / max) * 80
      var name = i === 4 ? '120+' : edges[i] + '–' + (edges[i] + 30)
      out += '<rect class="mono" x="' + (L + slot * i + 2) + '" y="' + (B - ht).toFixed(1) + '" width="' + (slot - 4) + '" height="' + ht.toFixed(1) + '" rx="1.5" data-tip="' + name + ' min · ' + c + ' sessions"/>'
      out += '<text x="' + (L + slot * i + slot / 2) + '" y="' + (B + 14) + '" text-anchor="middle">' + name + '</text>'
    })
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + (B + 20) + '" role="img" aria-label="Number of sessions by active length in minutes">' + out + '</svg>'
  }

  function scatter() {
    var pts = []
    P.SESSIONS.forEach(function (x) {
      if (x.conc === null) return
      pts.push({ m: x.e - x.s - P.sum(x.pauses, function (p) { return p[1] - p[0] }), c: x.conc, x: x })
    })
    var W = 320, L = 26, B = 130, T = 8
    var px = function (m) { return L + (m / 140) * (W - L - 8) }
    var py = function (c) { return B - ((c - 1) / 9) * (B - T) }
    var out = ''
    ;[1, 4, 7, 10].forEach(function (c) {
      out += '<line class="grid" x1="' + L + '" y1="' + py(c).toFixed(1) + '" x2="' + W + '" y2="' + py(c).toFixed(1) + '"/><text x="' + (L - 6) + '" y="' + (py(c) + 3).toFixed(1) + '" text-anchor="end">' + c + '</text>'
    })
    ;[0, 30, 60, 90, 120].forEach(function (m) {
      out += '<text x="' + px(m).toFixed(1) + '" y="' + (B + 14) + '" text-anchor="middle">' + m + '</text>'
    })
    pts.forEach(function (p) {
      out += '<circle class="pt" cx="' + px(p.m).toFixed(1) + '" cy="' + py(p.c).toFixed(1) + '" r="4.5" data-tip="' + P.label(p.x.cat) + ' · ' + Math.round(p.m) + ' min · concentration ' + p.c + '"/>'
    })
    return {
      n: pts.length,
      missing: P.SESSIONS.length - pts.length,
      svg: '<svg class="chart" viewBox="0 0 ' + W + ' ' + (B + 20) + '" role="img" aria-label="Concentration rating against active minutes, one point per rated session">' + out + '</svg>',
    }
  }

  function explore(s) {
    var out = seg([['day', 'Day'], ['week', 'Week'], ['patterns', 'Patterns']], s.view, 'view')
    if (s.view === 'day') {
      out +=
        '<div class="step"><button class="key narrow" data-act="day" data-arg="-1" aria-label="Previous day"' + (s.day === 0 ? ' disabled' : '') + '>◀</button>' +
        P.datePick(P.dayName(s.day, true).toUpperCase() + ' ' + P.dayDate(s.day) + ' MAR 2026') +
        '<button class="key narrow" data-act="day" data-arg="1" aria-label="Next day"' + (s.day === P.TODAY ? ' disabled' : '') + '>▶</button></div>' +
        '<section class="panel"><header><h2><span class="idx">01</span>Timeline</h2><span class="dim">' + hhmm(P.dayTotal(s.day)) + ' active · ' + P.pieces(s.day).length + ' sessions</span></header>' +
        timeline(s.day, P.timer()) + '</section>'
    } else if (s.view === 'week') {
      out +=
        '<section class="panel"><header><h2><span class="idx">01</span>Week 11</h2><span class="dim">09–15 MAR</span></header>' +
        '<p class="total"><span class="num">' + hhmm(P.weekTotal()) + '</span><span class="unit">active · hh:mm · ' + P.SESSIONS.length + ' sessions</span></p>' +
        weekChart() + legend(null, true) + '</section>' +
        '<section class="panel"><header><h2><span class="idx">02</span>By day</h2></header>' + weekTable() + '</section>'
    } else {
      var sc = scatter()
      out +=
        '<p class="log">Preview. Sample data; these analyses are not implemented.</p>' +
        '<section class="panel"><header><h2><span class="idx">01</span>Hour of day</h2><span class="dim">min / hour</span></header>' + heat() + '</section>' +
        '<section class="panel"><header><h2><span class="idx">02</span>Session length</h2><span class="dim">count · active min</span></header>' + histogram() + '</section>' +
        '<section class="panel"><header><h2><span class="idx">03</span>Concentration × length</h2><span class="dim">n = ' + sc.n + '</span></header>' + sc.svg +
        '<p class="caveat">x: active minutes · y: concentration (1–10). ' + sc.missing + ' of ' + P.SESSIONS.length + ' sessions have no rating and are left out, not counted as zero. Exploratory: too few points to conclude anything, and never causal.</p></section>'
    }
    return out
  }

  function settings(s) {
    var row = function (id, i) {
      return '<tr><td class="dim">' + P.pad(i + 1) + '</td><th scope="row">' + sw(P.slotOf(id)) + P.label(id) + '</th><td><button data-act="demo" data-arg="Editor for ' + P.name(id) + ' (not built).">Edit</button></td></tr>'
    }
    return (
      '<section class="panel"><header><h2><span class="idx">01</span>Categories</h2><button class="act" data-act="demo" data-arg="New category form (not built).">+ New</button></header>' +
      '<table class="readout wide"><tbody>' + ['maths', 'physics', 'violin', 'piano', 'reading', 'admin'].map(row).join('') +
      '<tr class="dim"><td>A1</td><th scope="row"><i class="sw off" aria-hidden="true"></i>Italian — Languages <span class="tag">archived</span></th><td><button data-act="demo" data-arg="Italian restored (demo).">Restore</button></td></tr>' +
      '</tbody></table></section>' +
      '<section class="panel"><header><h2><span class="idx">02</span>Backup</h2><span class="dim">local only</span></header>' +
      '<dl class="cells two"><div><dt>Stored</dt><dd>This device</dd></div><div><dt>Records</dt><dd>' + P.SESSIONS.length + ' sessions</dd></div></dl>' +
      '<div class="keys"><button class="key main" data-act="demo" data-arg="Backup file written (demo).">Export JSON</button><button class="key" data-act="demo" data-arg="Choose file → validate → confirm (demo).">Restore…</button></div></section>' +
      '<section class="panel"><header><h2><span class="idx">03</span>System</h2></header>' +
      '<table class="readout wide"><tbody><tr><th scope="row">Week starts</th><td>MON</td></tr><tr><th scope="row">Appearance</th><td>AUTO</td></tr><tr><th scope="row">Time format</th><td>24 H</td></tr><tr><th scope="row">Backup schema</th><td>v1</td></tr></tbody></table></section>' +
      (s.note ? '<p class="log" role="status">' + s.note + '</p>' : '')
    )
  }

  P.mount({
    render: function (s) {
      var body = s.tab === 'track' ? track(s) : s.tab === 'explore' ? explore(s) : settings(s)
      document.getElementById('app').innerHTML =
        nav(s) + '<div class="frame"><header class="top"><p><b>Cadence</b><span class="dim"> / ' + s.tab + '</span></p><p class="dim">THU 12 MAR · <span id="b-now"></span></p></header><main>' + body + '</main></div>'
    },
    tick: function (t) {
      var nowEl = document.getElementById('b-now')
      if (nowEl) nowEl.textContent = P.clock(P.now(), true)
      var clock = document.getElementById('b-clock')
      if (!clock || !t) return
      clock.textContent = P.clock(t.active, true)
      document.getElementById('b-elapsed').textContent = P.clock(t.elapsed, true)
      document.getElementById('b-paused').textContent = P.clock(t.pausedFor, true)
      // The session so far: solid while running, hatched while paused.
      document.getElementById('b-trace').innerHTML = t.spans.map(function (p) {
        return '<i style="left:' + (p[0] * 100).toFixed(2) + '%;width:' + ((p[1] - p[0]) * 100).toFixed(2) + '%"></i>'
      }).join('')
    },
  })
})()
