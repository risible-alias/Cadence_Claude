/*
 * Shared sample data and demo behaviour for the three Cadence design
 * prototypes. Everything here is fictional and lives in memory only: nothing
 * is read from or written to IndexedDB, localStorage or the network, and a
 * reload puts it all back.
 */
(function () {
  'use strict'

  // Fictional "now": Thursday 12 March 2026, 15:42:12. The clock then runs in real time.
  var DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  var DAY_DATES = [9, 10, 11, 12, 13, 14, 15]
  var TODAY = 3
  var NOW0 = 15 * 3600 + 42 * 60 + 12
  var T0 = Date.now()

  // Fixed order: a group keeps its colour slot whatever is on screen.
  var GROUPS = ['Academics', 'Music', 'Reading', 'Admin']
  var CATS = [
    { id: 'maths', name: 'Mathematics', group: 'Academics' },
    { id: 'physics', name: 'Physics', group: 'Academics' },
    { id: 'violin', name: 'Violin', group: 'Music' },
    { id: 'piano', name: 'Piano', group: 'Music' },
    { id: 'reading', name: 'Reading', group: null },
    { id: 'admin', name: 'Admin', group: null },
  ]
  var ARCHIVED = [{ id: 'italian', name: 'Italian', group: 'Languages' }]

  // d: day of the sample week (0 = Monday). s/e: minutes from that day's midnight
  // (e may pass 1440 when a session crosses midnight). pauses: [start, end] pairs.
  var SESSIONS = [
    { d: 0, s: 550, e: 640, cat: 'maths', title: 'Problem sheet 6', pauses: [], conc: 7, fat: 4 },
    { d: 0, s: 675, e: 725, cat: 'violin', title: 'Scales, Kreutzer 2', pauses: [], conc: 6, fat: null },
    { d: 0, s: 840, e: 925, cat: 'physics', title: 'Lagrangian mechanics', pauses: [[880, 890]], conc: 8, fat: 5 },
    { d: 0, s: 1270, e: 1315, cat: 'reading', title: '', pauses: [], conc: null, fat: null },
    { d: 1, s: 510, e: 560, cat: 'violin', title: 'Scales, Kreutzer 2', pauses: [], conc: 7, fat: 3 },
    { d: 1, s: 600, e: 730, cat: 'maths', title: 'Analysis: sequences', pauses: [[655, 670]], conc: 8, fat: 6 },
    { d: 1, s: 810, e: 835, cat: 'admin', title: 'Email, forms', pauses: [], conc: null, fat: null },
    { d: 1, s: 1020, e: 1060, cat: 'piano', title: 'Schubert, D 899', pauses: [], conc: 6, fat: 4 },
    { d: 1, s: 1320, e: 1355, cat: 'reading', title: '', pauses: [], conc: null, fat: null },
    { d: 2, s: 570, e: 660, cat: 'physics', title: 'Problem class', pauses: [], conc: 6, fat: 5 },
    { d: 2, s: 680, e: 750, cat: 'maths', title: 'Problem sheet 7', pauses: [], conc: 5, fat: 7 },
    { d: 2, s: 900, e: 980, cat: 'violin', title: 'Bach, Partita 2', pauses: [], conc: 9, fat: 5 },
    { d: 2, s: 1400, e: 1465, cat: 'reading', title: '', pauses: [], conc: null, fat: null },
    { d: 3, s: 545, e: 635, cat: 'maths', title: 'Analysis: series', pauses: [[590, 598]], conc: 7, fat: 3 },
    { d: 3, s: 650, e: 670, cat: 'admin', title: 'Email', pauses: [], conc: null, fat: null },
    { d: 3, s: 690, e: 745, cat: 'violin', title: 'Scales, Kreutzer 2', pauses: [], conc: 8, fat: null },
    { d: 3, s: 820, e: 890, cat: 'physics', title: 'Problem class prep', pauses: [], conc: 6, fat: 6 },
  ]
  // Hours per week for the five weeks before the sample week (oldest first).
  var PAST_WEEKS = [14.5, 17.2, 12.8, 18.9, 16.1]

  var active = {
    cat: 'violin',
    title: 'Bach, Partita 2: Allemande',
    start: 15 * 3600 + 5 * 60,
    pauses: [[15 * 3600 + 20 * 60, 15 * 3600 + 25 * 60]],
    pauseStart: null,
  }

  var state = { tab: 'track', view: 'day', day: TODAY, menu: false, note: '' }

  function now() {
    return NOW0 + (Date.now() - T0) / 1000
  }
  function catOf(id) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]
    return ARCHIVED[0]
  }
  /** The colour/aggregation group: the parent, or the category itself at top level. */
  function groupOf(id) {
    var c = catOf(id)
    return c.group || c.name
  }
  function sum(list, fn) {
    var t = 0
    for (var i = 0; i < list.length; i++) t += fn(list[i])
    return t
  }
  function pad(n) {
    return (n < 10 ? '0' : '') + n
  }
  /** Minutes of [a, b) not covered by the pauses. */
  function activeBetween(sess, a, b) {
    var t = Math.max(0, b - a)
    for (var i = 0; i < sess.pauses.length; i++) {
      t -= Math.max(0, Math.min(b, sess.pauses[i][1]) - Math.max(a, sess.pauses[i][0]))
    }
    return t
  }
  /**
   * The parts of sessions that fall inside one day. A session crossing midnight
   * yields a piece on each day, each with only that day's active minutes.
   */
  function pieces(day) {
    var out = []
    for (var i = 0; i < SESSIONS.length; i++) {
      var x = SESSIONS[i]
      var shift = (x.d - day) * 1440
      var s = x.s + shift
      var e = x.e + shift
      if (e <= 0 || s >= 1440) continue
      var cs = Math.max(0, s)
      var ce = Math.min(1440, e)
      out.push({
        sess: x,
        s: cs,
        e: ce,
        active: activeBetween(x, cs - shift, ce - shift),
        whole: activeBetween(x, x.s, x.e),
        paused: x.e - x.s - activeBetween(x, x.s, x.e),
        fromPrev: s < 0,
        toNext: e > 1440,
      })
    }
    out.sort(function (a, b) {
      return a.s - b.s
    })
    return out
  }
  function dayTotal(day) {
    return sum(pieces(day), function (p) {
      return p.active
    })
  }
  function weekTotal() {
    var t = 0
    for (var d = 0; d < 7; d++) t += dayTotal(d)
    return t
  }
  /** [{ group, min }] in fixed group order for one day, or the whole week when day is null. */
  function groupTotals(day) {
    var out = []
    for (var g = 0; g < GROUPS.length; g++) out.push({ group: GROUPS[g], slot: g + 1, min: 0 })
    for (var d = 0; d < 7; d++) {
      if (day !== null && d !== day) continue
      var ps = pieces(d)
      for (var i = 0; i < ps.length; i++) out[GROUPS.indexOf(groupOf(ps[i].sess.cat))].min += ps[i].active
    }
    return out
  }
  function catTotals() {
    var out = []
    for (var c = 0; c < CATS.length; c++) out.push({ cat: CATS[c], min: 0 })
    for (var d = 0; d < 7; d++) {
      var ps = pieces(d)
      for (var i = 0; i < ps.length; i++) {
        for (var k = 0; k < out.length; k++) if (out[k].cat.id === ps[i].sess.cat) out[k].min += ps[i].active
      }
    }
    out.sort(function (a, b) {
      return b.min - a.min
    })
    return out
  }
  /** Active minutes in each hour of the day, summed over the week. */
  function hourProfile() {
    var hours = []
    for (var h = 0; h < 24; h++) hours.push(0)
    for (var d = 0; d < 7; d++) {
      var ps = pieces(d)
      for (var i = 0; i < ps.length; i++) {
        for (var hh = 0; hh < 24; hh++) {
          hours[hh] += activeBetween(ps[i].sess, Math.max(ps[i].s, hh * 60) + (day0(ps[i], d)), Math.min(ps[i].e, hh * 60 + 60) + day0(ps[i], d))
        }
      }
    }
    return hours
  }
  function day0(piece, day) {
    return (day - piece.sess.d) * 1440
  }

  function timer() {
    if (!active) return null
    var t = now()
    var end = active.pauseStart === null ? t : active.pauseStart
    var done = sum(active.pauses, function (p) {
      return p[1] - p[0]
    })
    return {
      cat: catOf(active.cat),
      title: active.title,
      paused: active.pauseStart !== null,
      start: active.start,
      active: Math.max(0, end - active.start - done),
      pausedFor: done + (active.pauseStart === null ? 0 : t - active.pauseStart),
      elapsed: t - active.start,
      // Run/pause stretches as fractions of the elapsed span, for a session strip.
      spans: active.pauses
        .concat(active.pauseStart === null ? [] : [[active.pauseStart, t]])
        .map(function (p) {
          return [(p[0] - active.start) / (t - active.start), (p[1] - active.start) / (t - active.start)]
        }),
    }
  }

  var actions = {
    tab: function (arg) {
      state.tab = arg
      state.menu = false
      history.replaceState(null, '', '#' + arg)
      window.scrollTo(0, 0)
    },
    view: function (arg) {
      state.view = arg
    },
    day: function (arg) {
      var next = state.day + Number(arg)
      if (next >= 0 && next <= TODAY) state.day = next
    },
    openDay: function (arg) {
      state.day = Number(arg)
      state.view = 'day'
    },
    menu: function () {
      state.menu = !state.menu
    },
    pause: function () {
      if (active && active.pauseStart === null) active.pauseStart = now()
    },
    resume: function () {
      if (active && active.pauseStart !== null) {
        active.pauses.push([active.pauseStart, now()])
        active.pauseStart = null
      }
    },
    finish: function () {
      if (!active) return
      var t = now()
      if (active.pauseStart !== null) active.pauses.push([active.pauseStart, t])
      SESSIONS.push({
        d: TODAY,
        s: active.start / 60,
        e: t / 60,
        cat: active.cat,
        title: active.title,
        pauses: active.pauses.map(function (p) {
          return [p[0] / 60, p[1] / 60]
        }),
        conc: null,
        fat: null,
      })
      state.note = 'Saved ' + P.dur(Math.round(SESSIONS[SESSIONS.length - 1].e - SESSIONS[SESSIONS.length - 1].s - sum(active.pauses, function (p) { return (p[1] - p[0]) / 60 }))) + ' of ' + P.label(active.cat) + '.'
      active = null
      state.menu = false
    },
    cancel: function () {
      active = null
      state.menu = false
      state.note = 'Session discarded.'
    },
    start: function (arg) {
      if (active) return
      active = { cat: arg, title: '', start: now(), pauses: [], pauseStart: null }
      state.note = ''
    },
    demo: function (arg) {
      state.note = arg
    },
  }

  /** "today, 55 m" / "yesterday, 1 h 20 m" / "Monday, 40 m" for the latest saved session of a category. */
  function lastUsed(catId) {
    var best = null
    for (var i = 0; i < SESSIONS.length; i++) {
      var x = SESSIONS[i]
      if (x.cat === catId && (!best || x.d * 1440 + x.s > best.d * 1440 + best.s)) best = x
    }
    if (!best) return 'not yet used'
    var when = best.d === TODAY ? 'today' : best.d === TODAY - 1 ? 'yesterday' : DAY_NAMES[best.d]
    return when + ', ' + P.dur(activeBetween(best, best.s, best.e))
  }
  /** Category ids, most recently used first. */
  function recents() {
    var ids = CATS.map(function (c) { return c.id })
    var stamp = function (id) {
      var t = -1
      for (var i = 0; i < SESSIONS.length; i++) if (SESSIONS[i].cat === id) t = Math.max(t, SESSIONS[i].d * 1440 + SESSIONS[i].s)
      return t
    }
    ids.sort(function (a, b) { return stamp(b) - stamp(a) })
    return ids
  }

  var mounted = null
  function draw() {
    if (!mounted) return
    mounted.render(state)
    if (mounted.tick) mounted.tick(timer())
  }

  var P = (window.Proto = {
    TODAY: TODAY,
    GROUPS: GROUPS,
    CATS: CATS,
    ARCHIVED: ARCHIVED,
    PAST_WEEKS: PAST_WEEKS,
    SESSIONS: SESSIONS,
    state: state,
    actions: actions,
    redraw: function () {
      draw()
    },
    lastUsed: lastUsed,
    recents: recents,
    now: now,
    timer: timer,
    pieces: pieces,
    dayTotal: dayTotal,
    weekTotal: weekTotal,
    groupTotals: groupTotals,
    catTotals: catTotals,
    hourProfile: hourProfile,
    groupOf: groupOf,
    slotOf: function (catId) {
      return GROUPS.indexOf(groupOf(catId)) + 1
    },
    sum: sum,
    pad: pad,
    /** "Violin — Music": the specific name first, then its group. */
    label: function (catId, joiner) {
      var c = catOf(catId)
      return c.group ? c.name + (joiner || ' — ') + c.group : c.name
    },
    name: function (catId) {
      return catOf(catId).name
    },
    parent: function (catId) {
      return catOf(catId).group || ''
    },
    /** 82 -> "1 h 22 m" */
    dur: function (min) {
      min = Math.round(min)
      var h = Math.floor(min / 60)
      var m = min % 60
      return h ? h + ' h ' + pad(m) + ' m' : m + ' m'
    },
    /** 545 -> "09:05" (wraps past midnight) */
    hm: function (min) {
      min = ((Math.round(min) % 1440) + 1440) % 1440
      return pad(Math.floor(min / 60)) + ':' + pad(min % 60)
    },
    /** seconds -> "32:12" or "1:02:12" */
    clock: function (sec, always) {
      sec = Math.floor(sec)
      var h = Math.floor(sec / 3600)
      var rest = pad(Math.floor((sec % 3600) / 60)) + ':' + pad(sec % 60)
      return h || always ? (always ? pad(h) : h) + ':' + rest : rest
    },
    dayName: function (d, short) {
      return short ? DAY_NAMES[d].slice(0, 3) : DAY_NAMES[d]
    },
    dayDate: function (d) {
      return DAY_DATES[d]
    },
    isoDay: function (d) {
      return '2026-03-' + pad(DAY_DATES[d])
    },
    esc: function (s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
    },
    /**
     * A date control that cannot overflow: the visible part is ordinary text,
     * and the native picker sits invisibly on top of it, so its intrinsic
     * width never takes part in layout.
     */
    datePick: function (text) {
      return (
        '<label class="datepick"><span>' + text + '</span>' +
        '<input type="date" aria-label="Choose a day" value="' + P.isoDay(state.day) + '" min="' + P.isoDay(0) + '" max="' + P.isoDay(TODAY) + '"></label>'
      )
    },
    mount: function (design) {
      mounted = design
      var tab = location.hash.slice(1)
      if (tab === 'explore' || tab === 'settings') state.tab = tab
      draw()
      setInterval(function () {
        if (mounted.tick) mounted.tick(timer())
      }, 1000)
    },
  })

  document.addEventListener('click', function (event) {
    var el = event.target.closest ? event.target.closest('[data-act]') : null
    hideTip()
    if (!el) {
      var tipEl = event.target.closest ? event.target.closest('[data-tip]') : null
      if (tipEl) showTip(tipEl)
      return
    }
    var act = actions[el.getAttribute('data-act')]
    if (act) act(el.getAttribute('data-arg'))
    draw()
  })
  document.addEventListener('change', function (event) {
    if (event.target.type !== 'date') return
    for (var d = 0; d <= TODAY; d++) if (P.isoDay(d) === event.target.value) state.day = d
    draw()
  })

  // One small tooltip for chart marks: hover with a mouse, tap on a phone.
  var tip = null
  function showTip(el) {
    if (!tip) {
      tip = document.createElement('div')
      tip.className = 'tip'
      tip.setAttribute('role', 'status')
      document.body.appendChild(tip)
    }
    tip.textContent = el.getAttribute('data-tip')
    tip.style.display = 'block'
    var r = el.getBoundingClientRect()
    var w = tip.offsetWidth
    var x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))
    var y = r.top - tip.offsetHeight - 6
    tip.style.left = x + 'px'
    tip.style.top = (y < 8 ? r.bottom + 6 : y) + 'px'
  }
  function hideTip() {
    if (tip) tip.style.display = 'none'
  }
  document.addEventListener('pointerover', function (event) {
    if (event.pointerType !== 'mouse') return
    var el = event.target.closest ? event.target.closest('[data-tip]') : null
    if (el) showTip(el)
    else hideTip()
  })
  window.addEventListener('scroll', hideTip, true)
})()
