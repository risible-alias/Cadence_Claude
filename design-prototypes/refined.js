/* Refined editorial direction (round 2). Sample data only; see shared.js. */
(function () {
  'use strict'
  var P = window.Proto
  var INKS = ['', 'Lapis', 'Oxblood', 'Plum', 'Forest', 'Brass']

  // Which variation is showing. Set from the address (?track=2&nav=rule) and
  // changeable from the small prototype strip above the page.
  var q = new URLSearchParams(location.search)
  var opt = {
    track: q.get('track') === '2' ? '2' : '1',
    nav: q.get('nav') === 'rule' ? 'rule' : 'glass',
    bare: q.has('bare'),
  }
  P.state.others = false
  P.state.sheet = false
  P.actions.opt = function (arg) {
    var kv = arg.split(':')
    opt[kv[0]] = kv[1]
    history.replaceState(null, '', '?track=' + opt.track + '&nav=' + opt.nav + location.hash)
  }
  P.actions.others = function () {
    P.state.others = !P.state.others
  }
  P.actions.sheet = function () {
    P.state.sheet = !P.state.sheet
  }
  var start = P.actions.start
  P.actions.start = function (arg) {
    start(arg)
    P.state.others = false
    P.state.sheet = false
  }

  var WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
  var count = function (n, noun) {
    return (n < WORDS.length ? WORDS[n] : n) + ' ' + noun + (n === 1 ? '' : 's')
  }
  var dur = function (min) {
    return P.dur(min).replace(/ (h|m)/g, ' $1')
  }
  var cls = function (id) {
    return 'c' + P.slotOf(id)
  }
  /** A small square of the category's ink. Always next to the name, never instead of it. */
  var mark = function (id) {
    return '<i class="mark ' + cls(id) + '" aria-hidden="true"></i>'
  }
  var label = function (id) {
    return '<span class="lbl"><span class="what">' + P.name(id) + '</span>' + (P.parent(id) ? ' <span class="of">— ' + P.parent(id) + '</span>' : '') + '</span>'
  }

  /* ---------- Track ---------- */

  function running(s, t) {
    var hours = t.active >= 3600
    return (
      '<section class="now ' + cls(t.cat.id) + (t.paused ? ' is-paused' : '') + '" aria-label="Current session">' +
      '<p class="state"><span class="pip" aria-hidden="true"></span>' + (t.paused ? 'Paused' : 'In progress') + '</p>' +
      '<h2>' + t.cat.name + '</h2>' +
      '<p class="sub">' + [t.cat.group, P.esc(t.title)].join(t.cat.group && t.title ? ' · ' : '') + '</p>' +
      '<p class="figure' + (hours ? ' long' : '') + '" id="r-clock" role="timer" aria-label="Active time"></p>' +
      '<div class="trace" id="r-trace" aria-hidden="true"></div>' +
      '<p class="meta" id="r-meta"></p>' +
      '<div class="acts">' +
      (t.paused ? '<button class="plate full" data-act="resume">Resume</button>' : '<button class="plate full" data-act="pause">Pause</button>') +
      '<button class="plate" data-act="finish">Finish</button></div>' +
      '<p class="aside-act"><button data-act="menu" aria-expanded="' + s.menu + '">' + (s.menu ? 'Keep going' : 'Other options') + '</button></p>' +
      (s.menu ? '<p class="discard"><button data-act="cancel">Discard this session</button> It will not be saved, and this cannot be undone.</p>' : '') +
      '</section>'
    )
  }

  /** Variation 1: a ledger. Full-width rows, one activity to a line. */
  function chooseRows(s) {
    var ids = P.recents()
    var row = function (id, small) {
      return (
        '<li><button class="row ' + cls(id) + (small ? ' small' : '') + '" data-act="start" data-arg="' + id + '">' +
        '<span class="edge" aria-hidden="true"></span>' +
        '<span class="rt"><span class="nm">' + P.name(id) + '</span><span class="ctx">' + (P.parent(id) ? P.parent(id) + ' · ' : '') + 'last ' + P.lastUsed(id) + '</span></span>' +
        '<span class="cue">Begin<span aria-hidden="true"> →</span></span></button></li>'
      )
    }
    return (
      '<p class="kicker">Begin</p><ul class="rows">' + ids.slice(0, 4).map(function (id) { return row(id) }).join('') + '</ul>' +
      '<button class="disclose" data-act="others" aria-expanded="' + s.others + '"><span>Other activities</span><span class="n">' + (ids.length - 4) + '</span><span class="caret" aria-hidden="true">' + (s.others ? '–' : '+') + '</span></button>' +
      (s.others
        ? '<ul class="rows">' + ids.slice(4).map(function (id) { return row(id, true) }).join('') + '<li><button class="row small plain" data-act="demo" data-arg="A new activity would be named here."><span class="rt"><span class="nm">New activity…</span></span></button></li></ul>'
        : '')
    )
  }

  /** Variation 2: catalogue cards for the recent four, and a sheet for the rest. */
  function chooseCards(s) {
    var ids = P.recents()
    var groups = [['Academics', ['maths', 'physics']], ['Music', ['violin', 'piano']], ['On their own', ['reading', 'admin']]]
    return (
      '<p class="kicker">Begin</p><ul class="cards">' +
      ids.slice(0, 4).map(function (id) {
        return '<li><button class="card ' + cls(id) + '" data-act="start" data-arg="' + id + '"><span class="tab" aria-hidden="true"></span><span class="nm">' + P.name(id) + '</span><span class="ctx">' + (P.parent(id) || 'last ' + P.lastUsed(id).split(',')[0]) + '</span></button></li>'
      }).join('') +
      '</ul><button class="card wide" data-act="sheet" aria-haspopup="dialog"><span class="nm">Another activity</span><span class="ctx">' + count(ids.length, 'activity').replace('activitys', 'activities') + ' in all</span></button>' +
      (s.sheet
        ? '<div class="scrim" data-act="sheet"></div><div class="sheet" role="dialog" aria-label="Choose an activity"><p class="grip" aria-hidden="true"></p><h2>Begin</h2>' +
          groups.map(function (g) {
            return '<h3>' + g[0] + '</h3><ul class="rows">' + g[1].map(function (id) {
              return '<li><button class="row small ' + cls(id) + '" data-act="start" data-arg="' + id + '"><span class="edge" aria-hidden="true"></span><span class="rt"><span class="nm">' + P.name(id) + '</span><span class="ctx">last ' + P.lastUsed(id) + '</span></span></button></li>'
            }).join('') + '</ul>'
          }).join('') +
          '<button class="plate" data-act="sheet">Close</button></div>'
        : '')
    )
  }

  /** The day as one line from 06:00 to midnight, each stretch in its category's ink. */
  function ribbon(day, timer) {
    var W = 320
    var x = function (min) {
      return ((Math.max(360, Math.min(1440, min)) - 360) / 1080) * W
    }
    var marks = P.pieces(day).map(function (p) {
      return p.e <= 360 ? '' : '<rect class="' + cls(p.sess.cat) + '" x="' + (x(p.s) + 1).toFixed(1) + '" y="4" width="' + Math.max(2, x(p.e) - x(p.s) - 2).toFixed(1) + '" height="8" rx="1" data-tip="' + P.label(p.sess.cat) + ', ' + P.hm(p.s) + '–' + P.hm(p.e) + '"/>'
    }).join('')
    var live = timer && day === P.TODAY
      ? '<rect class="live ' + cls(timer.cat.id) + '" x="' + (x(timer.start / 60) + 1).toFixed(1) + '" y="4.75" width="' + Math.max(3, x(P.now() / 60) - x(timer.start / 60) - 2).toFixed(1) + '" height="6.5" rx="1"/>'
      : ''
    var ticks = [6, 12, 18, 24].map(function (h) {
      return '<text x="' + x(h * 60) + '" y="27" text-anchor="' + (h === 6 ? 'start' : h === 24 ? 'end' : 'middle') + '">' + P.pad(h) + '</text>'
    }).join('')
    return '<svg class="ribbon" viewBox="0 0 ' + W + ' 30" role="img" aria-label="Recorded time across the day, by category"><line class="base" x1="0" y1="8" x2="' + W + '" y2="8"/>' + marks + live + ticks + '</svg>'
  }

  function entries(day, timer) {
    var rows = P.pieces(day).map(function (p) {
      var note = p.fromPrev ? 'continued from ' + P.dayName(day - 1) : p.toNext ? 'runs past midnight' : ''
      return '<li><time>' + P.hm(p.s) + '</time>' + mark(p.sess.cat) + '<p class="body">' + label(p.sess.cat) + (note ? '<span class="note">' + note + '</span>' : '') + '</p><p class="len">' + dur(p.active) + '</p></li>'
    })
    if (timer && day === P.TODAY) {
      rows.push('<li class="live"><time>' + P.hm(timer.start / 60) + '</time><i class="mark open ' + cls(timer.cat.id) + '" aria-hidden="true"></i><p class="body">' + label(timer.cat.id) + '<span class="note">' + (timer.paused ? 'paused' : 'in progress') + ', not yet counted</span></p><p class="len">now</p></li>')
    }
    return rows.length ? '<ol class="entries">' + rows.join('') + '</ol>' : '<p class="quiet">Nothing recorded.</p>'
  }

  function track(s) {
    var t = P.timer()
    var n = P.pieces(P.TODAY).length
    return (
      (t ? running(s, t) : '<section class="begin" aria-label="Start a session">' + (s.note ? '<p class="saved" role="status">' + s.note + '</p>' : '') + (opt.track === '2' ? chooseCards(s) : chooseRows(s)) + '</section>') +
      '<section class="today" aria-label="Today"><p class="kicker">Today so far</p>' +
      '<p class="lede"><strong>' + dur(P.dayTotal(P.TODAY)) + '</strong> in ' + count(n, 'session') + (t ? ', and one under way.' : '.') + '</p>' +
      ribbon(P.TODAY, t) + entries(P.TODAY, t) + '</section>'
    )
  }

  /* ---------- Explore ---------- */

  /** Sessions drawn to scale against the clock, washed in their category's ink. */
  function timeline(day, timer) {
    var carried = [], ps = []
    P.pieces(day).forEach(function (p) {
      ;(p.fromPrev ? carried : ps).push(p)
    })
    var live = timer && day === P.TODAY
    var first = ps.length ? Math.floor(ps[0].s / 60) : 8
    var last = Math.ceil(Math.max(ps.length ? ps[ps.length - 1].e : 600, live ? P.now() / 60 : 0) / 60)
    last = Math.min(24, Math.max(last, first + 4))
    var PX = 52
    var y = function (min) {
      return ((min - first * 60) / 60) * PX
    }
    var out = ''
    for (var h = first; h <= last; h++) out += '<div class="hr" style="top:' + y(h * 60) + 'px"><span>' + P.pad(h % 24) + '</span></div>'
    ps.forEach(function (p) {
      var x = p.sess
      var ht = Math.max(20, y(p.e) - y(p.s) - 2)
      var extra = []
      if (x.title) extra.push(P.esc(x.title))
      if (p.paused) extra.push(dur(p.paused) + ' paused')
      if (x.conc !== null) extra.push('concentration ' + x.conc)
      if (x.fat !== null) extra.push('fatigue ' + x.fat)
      out +=
        '<div class="blk ' + cls(x.cat) + (ht < 36 ? ' one' : '') + '" style="top:' + (y(p.s) + 1).toFixed(1) + 'px;height:' + ht.toFixed(1) + 'px">' +
        x.pauses.map(function (pp) {
          var shift = (x.d - day) * 1440
          return '<i class="gap" style="top:' + (y(pp[0] + shift) - y(p.s) - 1).toFixed(1) + 'px;height:' + Math.max(3, y(pp[1] + shift) - y(pp[0] + shift)).toFixed(1) + 'px"></i>'
        }).join('') +
        '<p class="head">' + label(x.cat) + '<span class="len">' + dur(p.active) + '</span></p>' +
        '<p class="more">' + P.hm(p.s) + '–' + P.hm(p.e) + (p.toNext ? ', past midnight' : '') + (ht >= 60 && extra.length ? ' · ' + extra.join(' · ') : '') + '</p></div>'
    })
    if (live) {
      out +=
        '<div class="blk live one ' + cls(timer.cat.id) + '" style="top:' + (y(timer.start / 60) + 1).toFixed(1) + 'px;height:' + Math.max(24, y(P.now() / 60) - y(timer.start / 60) - 2).toFixed(1) + 'px"><p class="head">' + label(timer.cat.id) + '<span class="len">' + (timer.paused ? 'paused' : 'in progress') + '</span></p></div>' +
        '<div class="nowline" style="top:' + y(P.now() / 60).toFixed(1) + 'px"><span>' + P.hm(P.now() / 60) + '</span></div>'
    }
    var head = carried.map(function (p) {
      return '<p class="carry ' + cls(p.sess.cat) + '">' + label(p.sess.cat) + '<span class="more">until ' + P.hm(p.e) + ', continued from ' + P.dayName(day - 1) + '</span><span class="len">' + dur(p.active) + '</span></p>'
    }).join('')
    return head + '<div class="tl" style="height:' + (y(last * 60) + 10) + 'px">' + out + '</div>'
  }

  function weekChart() {
    var W = 320, H = 150, L = 22, B = 118, max = 5 * 60, slot = (W - L) / 7, out = ''
    for (var h = 0; h <= 5; h++) {
      var gy = B - ((h * 60) / max) * 100
      out += '<line class="gridl" x1="' + L + '" y1="' + gy + '" x2="' + W + '" y2="' + gy + '"/>'
      if (h) out += '<text x="' + (L - 6) + '" y="' + (gy + 3) + '" text-anchor="end">' + h + '</text>'
    }
    for (var d = 0; d < 7; d++) {
      var cx = L + slot * d + slot / 2, yy = B, total = P.dayTotal(d)
      out += '<g' + (d <= P.TODAY ? ' class="col" data-act="openDay" data-arg="' + d + '"' : '') + '><rect class="hit" x="' + (L + slot * d) + '" y="0" width="' + slot + '" height="' + H + '"/>'
      P.groupTotals(d).forEach(function (r) {
        if (!r.min) return
        var ht = (r.min / max) * 100
        yy -= ht
        out += '<rect class="c' + r.slot + '" x="' + (cx - 7) + '" y="' + (yy + 1).toFixed(1) + '" width="14" height="' + Math.max(1, ht - 2).toFixed(1) + '" rx="1" data-tip="' + P.dayName(d) + ' · ' + r.group + ' · ' + P.dur(r.min) + '"/>'
      })
      if (total) out += '<text class="val" x="' + cx + '" y="' + (yy - 5).toFixed(1) + '" text-anchor="middle">' + Math.floor(total / 60) + ':' + P.pad(Math.round(total % 60)) + '</text>'
      out += '<text class="' + (d === P.TODAY ? 'val strong' : '') + '" x="' + cx + '" y="' + (B + 16) + '" text-anchor="middle">' + P.dayName(d, true) + '</text></g>'
    }
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Active hours for each day this week, stacked by category group">' + out + '<text x="0" y="12">hours</text></svg>'
  }

  function shares(rows, max, total) {
    return (
      '<ul class="shares">' +
      rows.map(function (r) {
        return '<li class="' + r.cls + '"><p>' + r.head + '</p><p class="len">' + dur(r.min) + (total ? '<span class="pct">' + Math.round((r.min / total) * 100) + '%</span>' : '') + '</p><span class="track"><span class="fill" style="width:' + ((r.min / max) * 100).toFixed(1) + '%"></span></span></li>'
      }).join('') +
      '</ul>'
    )
  }

  function hours() {
    var prof = P.hourProfile()
    var max = Math.max.apply(null, prof)
    var W = 320, slot = W / 18, out = ''
    for (var h = 6; h < 24; h++) {
      var ht = (prof[h] / max) * 56
      out += '<rect class="total" x="' + (slot * (h - 6) + 3).toFixed(1) + '" y="' + (62 - ht).toFixed(1) + '" width="' + (slot - 6).toFixed(1) + '" height="' + ht.toFixed(1) + '" rx="1" data-tip="' + P.pad(h) + ':00–' + P.pad(h + 1) + ':00 · ' + P.dur(prof[h]) + ' this week"/>'
    }
    var ticks = [6, 9, 12, 15, 18, 21].map(function (h) {
      return '<text x="' + (slot * (h - 6) + slot / 2).toFixed(1) + '" y="80" text-anchor="middle">' + P.pad(h) + '</text>'
    }).join('')
    return '<svg class="chart" viewBox="0 0 ' + W + ' 84" role="img" aria-label="Active time by hour of day"><line class="base" x1="0" y1="62.5" x2="' + W + '" y2="62.5"/>' + out + ticks + '</svg>'
  }

  function sixWeeks() {
    var vals = P.PAST_WEEKS.concat([P.weekTotal() / 60])
    var W = 320
    var pts = vals.map(function (v, i) {
      return [20 + (i * (W - 40)) / (vals.length - 1), 66 - (v / 20) * 56]
    })
    var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) }).join(' ')
    var dots = pts.map(function (p, i) {
      var last = i === pts.length - 1
      var ago = vals.length - 1 - i
      return '<circle class="' + (last ? 'dot open' : 'dot') + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (last ? 4.5 : 3.5) + '" data-tip="' + (last ? 'This week so far' : ago + ' week' + (ago === 1 ? '' : 's') + ' ago') + ' · ' + vals[i].toFixed(1) + ' h"/>'
    }).join('')
    var end = pts[pts.length - 1]
    return '<svg class="chart" viewBox="0 0 ' + W + ' 86" role="img" aria-label="Hours per week over six weeks"><line class="base" x1="0" y1="66.5" x2="' + W + '" y2="66.5"/><path class="line" d="' + path + '"/>' + dots + '<text class="val" x="' + end[0] + '" y="' + (end[1] - 10).toFixed(1) + '" text-anchor="end">' + vals[vals.length - 1].toFixed(1) + ' h so far</text><text x="20" y="82">five weeks ago</text><text x="' + (W - 20) + '" y="82" text-anchor="end">this week</text></svg>'
  }

  function scatter() {
    var pts = []
    P.SESSIONS.forEach(function (x) {
      if (x.conc !== null) pts.push({ m: x.e - x.s - P.sum(x.pauses, function (p) { return p[1] - p[0] }), c: x.conc, x: x })
    })
    var W = 320, L = 22, B = 118, T = 8
    var px = function (m) { return L + (m / 140) * (W - L - 8) }
    var py = function (c) { return B - ((c - 1) / 9) * (B - T) }
    var out = ''
    ;[1, 4, 7, 10].forEach(function (c) {
      out += '<line class="gridl" x1="' + L + '" y1="' + py(c).toFixed(1) + '" x2="' + W + '" y2="' + py(c).toFixed(1) + '"/><text x="' + (L - 6) + '" y="' + (py(c) + 3).toFixed(1) + '" text-anchor="end">' + c + '</text>'
    })
    ;[0, 30, 60, 90, 120].forEach(function (m) {
      out += '<text x="' + px(m).toFixed(1) + '" y="' + (B + 14) + '" text-anchor="middle">' + m + '</text>'
    })
    pts.forEach(function (p) {
      out += '<circle class="dot" cx="' + px(p.m).toFixed(1) + '" cy="' + py(p.c).toFixed(1) + '" r="4" data-tip="' + P.label(p.x.cat) + ' · ' + Math.round(p.m) + ' min · concentration ' + p.c + '"/>'
    })
    return { n: pts.length, missing: P.SESSIONS.length - pts.length, svg: '<svg class="chart" viewBox="0 0 ' + W + ' ' + (B + 20) + '" role="img" aria-label="Concentration rating against active minutes, one point per rated session">' + out + '</svg>' }
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
      out +=
        '<p class="stepper"><button data-act="day" data-arg="-1" aria-label="Previous day"' + (s.day === 0 ? ' disabled' : '') + '>←</button>' +
        P.datePick(P.dayName(s.day) + ', ' + P.dayDate(s.day) + ' March') +
        '<button data-act="day" data-arg="1" aria-label="Next day"' + (s.day === P.TODAY ? ' disabled' : '') + '>→</button></p>' +
        '<p class="lede"><strong>' + dur(P.dayTotal(s.day)) + '</strong> in ' + count(P.pieces(s.day).length, 'session') + '.</p>' +
        timeline(s.day, P.timer())
    } else if (s.view === 'week') {
      var groups = P.groupTotals(null)
      var total = P.weekTotal()
      var cats = P.catTotals()
      out +=
        '<p class="kicker">9 – 15 March</p>' +
        '<p class="lede"><strong>' + dur(total) + '</strong> so far this week, across ' + count(P.SESSIONS.length, 'session') + '.</p>' +
        '<figure>' + weekChart() + '<figcaption>Each bar is a day, built from its categories. Choose a day to read it.</figcaption></figure>' +
        shares(groups.map(function (g) { return { cls: 'c' + g.slot, head: '<i class="mark c' + g.slot + '" aria-hidden="true"></i><span class="what">' + g.group + '</span>', min: g.min } }), groups[0].min, total) +
        '<p class="kicker">By activity</p>' +
        shares(cats.map(function (r) { return { cls: cls(r.cat.id), head: mark(r.cat.id) + label(r.cat.id), min: r.min } }), cats[0].min, 0)
    } else {
      var sc = scatter()
      out +=
        '<p class="aside">A sketch of what Patterns could show. Drawn from sample data; none of this is built yet.</p>' +
        '<p class="kicker">When the work happens</p><figure>' + hours() + '<figcaption>Active time by hour of day, this week, all categories together. Totals are drawn in plain ink; colour is kept for categories.</figcaption></figure>' +
        '<p class="kicker">Six weeks</p><figure>' + sixWeeks() + '<figcaption>Hours per week. The open circle is the week still in progress.</figcaption></figure>' +
        '<p class="kicker">Concentration and length <span class="n">n = ' + sc.n + '</span></p><figure>' + sc.svg +
        '<figcaption>Across: active minutes. Up: concentration, 1 to 10. ' + count(sc.missing, 'session') + ' of ' + P.SESSIONS.length + ' had no rating and are left out, not counted as zero. Too few points to conclude anything.</figcaption></figure>'
    }
    return out
  }

  /* ---------- Settings ---------- */

  function settings(s) {
    var groups = [['Academics', ['maths', 'physics']], ['Music', ['violin', 'piano']], ['On their own', ['reading', 'admin']]]
    return (
      '<p class="kicker">Activities</p>' +
      groups.map(function (g) {
        return '<h3 class="group">' + g[0] + '</h3><ul class="plain">' + g[1].map(function (id) {
          return '<li><button data-act="demo" data-arg="Editing ' + P.name(id) + ' would open here.">' + mark(id) + label(id) + '<span class="go">' + INKS[P.slotOf(id)] + '</span></button></li>'
        }).join('') + '</ul>'
      }).join('') +
      '<ul class="plain"><li><button class="link" data-act="demo" data-arg="A new activity would be named here, and given an ink.">Add an activity</button></li></ul>' +
      '<h3 class="group">Archived</h3><ul class="plain"><li><button data-act="demo" data-arg="Italian would return to the list."><i class="mark c5" aria-hidden="true"></i><span class="lbl"><span class="what">Italian</span> <span class="of">— Languages</span></span><span class="go">Restore</span></button></li></ul>' +
      '<p class="kicker">Keeping your record</p>' +
      '<p class="prose">Everything is kept on this device and nowhere else. A backup is a single file you can store wherever you trust.</p>' +
      '<ul class="plain"><li><button class="link" data-act="demo" data-arg="A backup file would be saved.">Export a backup</button></li><li><button class="link" data-act="demo" data-arg="You would choose a file, review it, then confirm.">Restore from a backup</button></li></ul>' +
      '<p class="kicker">Preferences</p>' +
      '<dl class="facts"><dt>Week begins</dt><dd>Monday</dd><dt>Appearance</dt><dd>Follows the device</dd><dt>Reflection after finishing</dt><dd>Offered, never required</dd></dl>' +
      (s.note ? '<p class="saved" role="status">' + s.note + '</p>' : '')
    )
  }

  /* ---------- Shell ---------- */

  var TABS = ['track', 'explore', 'settings']
  var built = false
  function shell() {
    var pick = function (key, value, text) {
      return '<button data-act="opt" data-arg="' + key + ':' + value + '" data-opt="' + key + ':' + value + '">' + text + '</button>'
    }
    document.getElementById('app').innerHTML =
      (opt.bare ? '' : '<p class="proto" aria-label="Prototype options"><a href="index.html">Prototypes</a><span>Track ' + pick('track', '1', 'Rows') + pick('track', '2', 'Cards') + '</span><span>Nav ' + pick('nav', 'glass', 'Glass') + pick('nav', 'rule', 'Rule') + '</span></p>') +
      '<main class="page" id="view"></main>' +
      '<nav class="nav" id="nav" aria-label="Sections"><span class="thumb" aria-hidden="true"></span>' +
      TABS.map(function (t) {
        return '<button data-act="tab" data-arg="' + t + '">' + t.charAt(0).toUpperCase() + t.slice(1) + '</button>'
      }).join('') +
      '</nav>'
    built = true
  }

  P.mount({
    render: function (s) {
      if (!built) shell()
      var title = { track: 'Thursday, <em>12 March</em>', explore: 'Explore', settings: 'Settings' }[s.tab]
      var body = s.tab === 'track' ? track(s) : s.tab === 'explore' ? explore(s) : settings(s)
      document.getElementById('view').innerHTML = '<header class="mast"><h1>' + title + '</h1></header>' + body
      document.body.setAttribute('data-track', opt.track)
      document.body.setAttribute('data-sheet', String(s.sheet && s.tab === 'track'))
      // The bar itself is never rebuilt, so its marker can slide between tabs.
      var nav = document.getElementById('nav')
      nav.setAttribute('data-style', opt.nav)
      nav.style.setProperty('--i', TABS.indexOf(s.tab))
      Array.prototype.forEach.call(nav.querySelectorAll('button'), function (b) {
        if (b.getAttribute('data-arg') === s.tab) b.setAttribute('aria-current', 'page')
        else b.removeAttribute('aria-current')
      })
      Array.prototype.forEach.call(document.querySelectorAll('[data-opt]'), function (b) {
        var kv = b.getAttribute('data-opt').split(':')
        b.setAttribute('aria-pressed', String(opt[kv[0]] === kv[1]))
      })
    },
    tick: function (t) {
      var clock = document.getElementById('r-clock')
      if (!clock || !t) return
      clock.textContent = P.clock(t.active)
      document.getElementById('r-meta').textContent =
        'Begun ' + P.hm(t.start / 60) + ' · ' + P.dur(t.elapsed / 60) + ' elapsed' + (t.pausedFor >= 60 ? ' · ' + P.dur(t.pausedFor / 60) + ' paused' : '')
      // The session so far: ink while working, hatched while paused.
      document.getElementById('r-trace').innerHTML = t.spans.map(function (p) {
        return '<i style="left:' + (p[0] * 100).toFixed(2) + '%;width:' + ((p[1] - p[0]) * 100).toFixed(2) + '%"></i>'
      }).join('')
    },
  })
})()
