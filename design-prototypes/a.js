/* Prototype A: Editorial Minimalism. Sample data only; see shared.js. */
(function () {
  'use strict'
  var P = window.Proto
  var WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
  var count = function (n, noun) {
    return (n < WORDS.length ? WORDS[n] : n) + ' ' + noun + (n === 1 ? '' : 's')
  }
  var dur = function (min) {
    return P.dur(min).replace(/ (h|m)/g, ' $1')
  }
  var label = function (id) {
    return '<span class="lbl"><span class="what">' + P.name(id) + '</span>' + (P.parent(id) ? ' <span class="of">— ' + P.parent(id) + '</span>' : '') + '</span>'
  }

  function tabs(s) {
    var items = [['track', 'Track'], ['explore', 'Explore'], ['settings', 'Settings']]
    return (
      '<nav class="tabs" aria-label="Sections">' +
      items
        .map(function (t) {
          return '<button data-act="tab" data-arg="' + t[0] + '"' + (s.tab === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + '</button>'
        })
        .join('') +
      '</nav>'
    )
  }

  /** The day as one thin line from 06:00 to midnight, inked where time was recorded. */
  function ribbon(day, timer) {
    var W = 320
    var x = function (min) {
      return ((Math.max(360, Math.min(1440, min)) - 360) / 1080) * W
    }
    var marks = P.pieces(day)
      .map(function (p) {
        return p.e <= 360 ? '' : '<rect class="ink" x="' + x(p.s).toFixed(1) + '" y="6" width="' + Math.max(1.5, x(p.e) - x(p.s)).toFixed(1) + '" height="5" data-tip="' + P.name(p.sess.cat) + ', ' + P.hm(p.s) + '–' + P.hm(p.e) + '"/>'
      })
      .join('')
    var live = timer && day === P.TODAY ? '<rect class="live" x="' + x(timer.start / 60).toFixed(1) + '" y="6" width="' + Math.max(2, x(P.now() / 60) - x(timer.start / 60)).toFixed(1) + '" height="5"/>' : ''
    var ticks = [6, 12, 18, 24]
      .map(function (h) {
        return '<text x="' + x(h * 60) + '" y="25" text-anchor="' + (h === 6 ? 'start' : h === 24 ? 'end' : 'middle') + '">' + P.pad(h) + '</text>'
      })
      .join('')
    return '<svg class="ribbon" viewBox="0 0 ' + W + ' 28" role="img" aria-label="Recorded time across the day"><line class="rule" x1="0" y1="8.5" x2="' + W + '" y2="8.5"/>' + marks + live + ticks + '</svg>'
  }

  function entries(day, full) {
    var ps = P.pieces(day)
    if (!ps.length) return '<p class="quiet">Nothing recorded.</p>'
    return (
      '<ol class="entries">' +
      ps
        .map(function (p) {
          var x = p.sess
          var notes = []
          if (p.fromPrev) notes.push('continued from ' + P.dayName(day - 1))
          if (p.toNext) notes.push('runs past midnight')
          if (full && x.title) notes.unshift(P.esc(x.title))
          if (full && p.paused) notes.push(dur(p.paused) + ' paused')
          if (full && x.conc !== null) notes.push('concentration ' + x.conc)
          if (full && x.fat !== null) notes.push('fatigue ' + x.fat)
          return (
            '<li><time>' + P.hm(p.s) + '</time><p class="body">' + label(x.cat) +
            (notes.length ? '<span class="note">' + notes.join(' · ') + '</span>' : '') +
            '</p><p class="len">' + dur(p.active) + '</p></li>'
          )
        })
        .join('') +
      '</ol>'
    )
  }

  function track(s) {
    var t = P.timer()
    var out = ''
    if (t) {
      out +=
        '<section class="now' + (t.paused ? ' is-paused' : '') + '" aria-label="Current session">' +
        '<p class="kicker"><span class="pip" aria-hidden="true"></span>' + (t.paused ? 'Paused' : 'In progress') + '</p>' +
        '<h2>' + t.cat.name + '</h2>' +
        '<p class="sub">' + [t.cat.group, P.esc(t.title)].join(t.cat.group && t.title ? ' · ' : '') + '</p>' +
        '<p class="figure" id="a-clock" role="timer" aria-label="Active time"></p>' +
        '<p class="meta" id="a-meta"></p>' +
        '<p class="acts">' +
        (t.paused ? '<button class="lead" data-act="resume">Resume</button>' : '<button class="lead" data-act="pause">Pause</button>') +
        '<button data-act="finish">Finish</button>' +
        '<button class="faint" data-act="menu" aria-expanded="' + s.menu + '">More</button></p>' +
        (s.menu ? '<p class="more"><button data-act="cancel">Discard this session</button><span>It will not be saved.</span></p>' : '') +
        '</section>'
    } else {
      out +=
        '<section class="begin" aria-label="Start a session">' +
        (s.note ? '<p class="saved">' + s.note + '</p>' : '') +
        '<p class="kicker">Begin</p><ul class="choices">' +
        ['violin', 'maths', 'physics', 'reading', 'piano', 'admin']
          .map(function (id) {
            return '<li><button data-act="start" data-arg="' + id + '">' + label(id) + '<span class="go" aria-hidden="true">→</span></button></li>'
          })
          .join('') +
        '</ul></section>'
    }
    var n = P.pieces(P.TODAY).length
    out +=
      '<section aria-label="Today"><p class="kicker">Today so far</p>' +
      '<p class="lede"><strong>' + dur(P.dayTotal(P.TODAY)) + '</strong> in ' + count(n, 'session') + (t ? ', and one under way.' : '.') + '</p>' +
      ribbon(P.TODAY, t) + entries(P.TODAY, false) + '</section>'
    return out
  }

  function weekBars() {
    var max = 0
    for (var d = 0; d < 7; d++) max = Math.max(max, P.dayTotal(d))
    var W = 320, H = 132, slot = W / 7
    var out = ''
    for (d = 0; d < 7; d++) {
      var min = P.dayTotal(d)
      var h = max ? (min / max) * 84 : 0
      var cx = slot * d + slot / 2
      var today = d === P.TODAY
      out += '<g' + (d <= P.TODAY ? ' data-act="openDay" data-arg="' + d + '" data-tip="' + P.dayName(d) + ': ' + P.dur(min) + '" class="col"' : '') + '>'
      out += '<rect class="hit" x="' + slot * d + '" y="0" width="' + slot + '" height="' + H + '"/>'
      if (d <= P.TODAY) {
        out += '<rect class="' + (today ? 'bar today' : 'bar') + '" x="' + (cx - 5) + '" y="' + (104 - h).toFixed(1) + '" width="10" height="' + h.toFixed(1) + '"/>'
        out += '<text class="val" x="' + cx + '" y="' + (98 - h).toFixed(1) + '" text-anchor="middle">' + Math.floor(min / 60) + ':' + P.pad(Math.round(min % 60)) + '</text>'
      } else {
        out += '<line class="rule" x1="' + (cx - 5) + '" y1="103.5" x2="' + (cx + 5) + '" y2="103.5"/>'
      }
      out += '<text class="' + (today ? 'dayl today' : 'dayl') + '" x="' + cx + '" y="122" text-anchor="middle">' + P.dayName(d, true) + '</text></g>'
    }
    return '<svg class="weekbars" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Active hours and minutes for each day this week"><line class="rule" x1="0" y1="104.5" x2="' + W + '" y2="104.5"/>' + out + '</svg>'
  }

  function byActivity() {
    var rows = P.catTotals()
    var max = rows[0].min
    return (
      '<ul class="shares">' +
      rows
        .map(function (r) {
          return '<li><p>' + label(r.cat.id) + '</p><p class="len">' + dur(r.min) + '</p><span class="bar" style="width:' + ((r.min / max) * 100).toFixed(1) + '%"></span></li>'
        })
        .join('') +
      '</ul>'
    )
  }

  function hours() {
    var prof = P.hourProfile()
    var max = Math.max.apply(null, prof)
    var W = 320, slot = W / 18, out = ''
    for (var h = 6; h < 24; h++) {
      var ht = (prof[h] / max) * 56
      out += '<rect class="bar" x="' + (slot * (h - 6) + 3).toFixed(1) + '" y="' + (62 - ht).toFixed(1) + '" width="' + (slot - 6).toFixed(1) + '" height="' + ht.toFixed(1) + '" data-tip="' + P.pad(h) + ':00–' + P.pad(h + 1) + ':00, ' + P.dur(prof[h]) + ' this week"/>'
    }
    var ticks = [6, 9, 12, 15, 18, 21].map(function (h) {
      return '<text x="' + (slot * (h - 6) + slot / 2).toFixed(1) + '" y="80" text-anchor="middle">' + P.pad(h) + '</text>'
    }).join('')
    return '<svg class="hours" viewBox="0 0 ' + W + ' 84" role="img" aria-label="Active time by hour of day"><line class="rule" x1="0" y1="62.5" x2="' + W + '" y2="62.5"/>' + out + ticks + '</svg>'
  }

  function sixWeeks() {
    var vals = P.PAST_WEEKS.concat([P.weekTotal() / 60])
    var W = 320, max = 20
    var pts = vals.map(function (v, i) {
      return [20 + (i * (W - 40)) / (vals.length - 1), 66 - (v / max) * 56]
    })
    var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) }).join(' ')
    var dots = pts.map(function (p, i) {
      var last = i === pts.length - 1
      return '<circle class="' + (last ? 'dot today' : 'dot') + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (last ? 4 : 3) + '" data-tip="' + (last ? 'This week so far' : (vals.length - 1 - i) + ' week' + (vals.length - 1 - i === 1 ? '' : 's') + ' ago') + ': ' + vals[i].toFixed(1) + ' h"/>'
    }).join('')
    var lastP = pts[pts.length - 1]
    return '<svg class="trend" viewBox="0 0 ' + W + ' 86" role="img" aria-label="Weekly hours over six weeks"><line class="rule" x1="0" y1="66.5" x2="' + W + '" y2="66.5"/><path class="line" d="' + path + '"/>' + dots + '<text class="val" x="' + lastP[0] + '" y="' + (lastP[1] - 10).toFixed(1) + '" text-anchor="end">' + vals[vals.length - 1].toFixed(1) + ' h so far</text><text x="20" y="82" text-anchor="start">five weeks ago</text><text x="' + (W - 20) + '" y="82" text-anchor="end">this week</text></svg>'
  }

  function explore(s) {
    var views = [['day', 'Day'], ['week', 'Week'], ['patterns', 'Patterns']]
    var out =
      '<nav class="views" aria-label="View">' +
      views.map(function (v) {
        return '<button data-act="view" data-arg="' + v[0] + '"' + (s.view === v[0] ? ' aria-current="true"' : '') + '>' + v[1] + '</button>'
      }).join('<span aria-hidden="true">·</span>') +
      '</nav>'
    if (s.view === 'day') {
      var n = P.pieces(s.day).length
      out +=
        '<p class="stepper"><button data-act="day" data-arg="-1" aria-label="Previous day"' + (s.day === 0 ? ' disabled' : '') + '>←</button>' +
        P.datePick(P.dayName(s.day) + ', ' + P.dayDate(s.day) + ' March') +
        '<button data-act="day" data-arg="1" aria-label="Next day"' + (s.day === P.TODAY ? ' disabled' : '') + '>→</button></p>' +
        '<p class="lede"><strong>' + dur(P.dayTotal(s.day)) + '</strong> in ' + count(n, 'session') + '.</p>' +
        ribbon(s.day, P.timer()) + entries(s.day, true)
    } else if (s.view === 'week') {
      out +=
        '<p class="kicker">9 – 15 March</p>' +
        '<p class="lede"><strong>' + dur(P.weekTotal()) + '</strong> so far this week, across ' + count(P.SESSIONS.length, 'session') + '.</p>' +
        '<figure>' + weekBars() + '<figcaption>Hours and minutes of active time. Choose a day to read it.</figcaption></figure>' +
        '<p class="kicker">By activity</p>' + byActivity()
    } else {
      out +=
        '<p class="aside">A sketch of what Patterns could show. Drawn from sample data; none of this is built yet.</p>' +
        '<p class="kicker">When the work happens</p><figure>' + hours() + '<figcaption>Active time by hour of day, this week. Mornings carry most of it.</figcaption></figure>' +
        '<p class="kicker">Six weeks</p><figure>' + sixWeeks() + '<figcaption>Hours per week. Descriptive only: no targets, no scores.</figcaption></figure>'
    }
    return out
  }

  function settings(s) {
    var groups = [['Academics', ['maths', 'physics']], ['Music', ['violin', 'piano']], ['On their own', ['reading', 'admin']]]
    return (
      '<p class="kicker">Activities</p>' +
      groups.map(function (g) {
        return '<h3 class="group">' + g[0] + '</h3><ul class="plain">' + g[1].map(function (id) {
          return '<li><button data-act="demo" data-arg="Editing ' + P.name(id) + ' would open here.">' + label(id) + '<span class="go" aria-hidden="true">Edit</span></button></li>'
        }).join('') + '</ul>'
      }).join('') +
      '<ul class="plain"><li><button class="link" data-act="demo" data-arg="A new activity would be named here.">Add an activity</button></li></ul>' +
      '<h3 class="group">Archived</h3><ul class="plain"><li><button data-act="demo" data-arg="Italian would return to the list.">' + '<span class="lbl"><span class="what">Italian</span> <span class="of">— Languages</span></span><span class="go" aria-hidden="true">Restore</span></button></li></ul>' +
      '<p class="kicker">Keeping your record</p>' +
      '<p class="prose">Everything is kept on this device and nowhere else. A backup is a single file you can store wherever you trust.</p>' +
      '<ul class="plain"><li><button class="link" data-act="demo" data-arg="A backup file would be saved.">Export a backup</button></li><li><button class="link" data-act="demo" data-arg="You would choose a file, review it, then confirm.">Restore from a backup</button></li></ul>' +
      '<p class="kicker">Preferences</p>' +
      '<dl class="facts"><dt>Week begins</dt><dd>Monday</dd><dt>Appearance</dt><dd>Follows the device</dd><dt>Reflection after finishing</dt><dd>Offered, never required</dd></dl>' +
      (s.note ? '<p class="saved" role="status">' + s.note + '</p>' : '')
    )
  }

  P.mount({
    render: function (s) {
      var title = { track: 'Thursday, <em>12 March</em>', explore: 'Explore', settings: 'Settings' }[s.tab]
      var body = s.tab === 'track' ? track(s) : s.tab === 'explore' ? explore(s) : settings(s)
      document.getElementById('app').innerHTML =
        tabs(s) + '<main class="page"><header class="mast"><p class="kicker">Cadence</p><h1>' + title + '</h1></header>' + body + '</main>'
    },
    tick: function (t) {
      var clock = document.getElementById('a-clock')
      if (!clock || !t) return
      clock.textContent = P.clock(t.active)
      document.getElementById('a-meta').textContent =
        'Begun at ' + P.hm(t.start / 60) + (t.pausedFor >= 60 ? ' · ' + P.dur(t.pausedFor / 60) + ' paused' : '')
    },
  })
})()
