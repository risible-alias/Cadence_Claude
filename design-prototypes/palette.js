/* Builds the palette specimen from the live token values. */
(function () {
  'use strict'
  var FOUNDATION = [
    ['--paper', 'Paper', 'The page'],
    ['--paper-raised', 'Paper, raised', 'Panels, sheets, cards'],
    ['--paper-sunk', 'Paper, sunk', 'Wells and empty tracks'],
    ['--ink', 'Ink', 'Text, emphasis, totals'],
    ['--ink-soft', 'Ink, soft', 'Secondary text'],
    ['--ink-faint', 'Ink, faint', 'Unavailable marks only'],
    ['--rule', 'Rule', 'Hairlines'],
    ['--rule-strong', 'Rule, strong', 'Edges of controls'],
  ]
  var INKS = [
    ['lapis', 'Lapis', 'Academics', 'Mathematics'],
    ['oxblood', 'Oxblood', 'Music', 'Violin'],
    ['plum', 'Plum', '', 'Reading'],
    ['forest', 'Forest', '', 'Admin'],
    ['brass', 'Brass', 'Languages', 'Italian'],
  ]
  var STATES = [
    ['--select', 'Selected', 'The chosen row or current view'],
    ['--press', 'Pressed', 'While a finger is down'],
  ]

  var probe = document.createElement('i')
  /** Resolves any CSS colour, including computed mixes, to [r, g, b] in 0–255. */
  function rgb(scope, value) {
    scope.appendChild(probe)
    probe.style.color = value
    var out = getComputedStyle(probe).color
    scope.removeChild(probe)
    var m = /color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/.exec(out)
    if (m) return [m[1] * 255, m[2] * 255, m[3] * 255]
    m = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(out)
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]
  }
  function hex(c) {
    return '#' + c.map(function (v) {
      var h = Math.round(v).toString(16)
      return h.length < 2 ? '0' + h : h
    }).join('')
  }
  function lum(c) {
    var f = function (v) {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
  }
  function ratio(a, b) {
    var la = lum(a), lb = lum(b)
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
  }

  function build(theme, title) {
    var el = document.createElement('section')
    el.className = 'sheet theme-' + theme
    document.getElementById('sheets').appendChild(el)
    var paper = rgb(el, 'var(--paper)')
    var chip = function (token) {
      var c = rgb(el, 'var(' + token + ')')
      return { hex: hex(c), ratio: ratio(c, paper) }
    }
    var grade = function (r, text) {
      // 4.5:1 for text, 3:1 for marks and large type.
      return r >= (text ? 4.5 : 3) ? r.toFixed(1) + ':1' : r.toFixed(1) + ':1 (decorative only)'
    }

    var html = '<h2>' + title + '</h2>'

    html += '<h3>Foundation</h3><ul class="chips">' + FOUNDATION.map(function (f) {
      var c = chip(f[0])
      var isInk = f[0].indexOf('--ink') === 0
      return '<li><span class="chip" style="background:var(' + f[0] + ')"></span><span class="t"><strong>' + f[1] + '</strong><span>' + f[2] + '</span></span><span class="v"><code>' + f[0] + '</code><span>' + c.hex + (isInk ? ' · ' + grade(c.ratio, f[0] !== '--ink-faint') : '') + '</span></span></li>'
    }).join('') + '</ul>'

    html += '<h3>Category inks</h3><p class="cap">Fixed order. Each has a wash for timeline blocks. Contrast is the ink against paper; 3:1 is the bar for a mark.</p><ul class="inks">' + INKS.map(function (k, i) {
      var c = chip('--cat-' + k[0])
      var w = chip('--tint-' + k[0])
      return '<li class="c' + (i + 1) + '"><span class="chip big" style="background:var(--c)"></span><span class="chip big wash" style="background:var(--c-tint)"></span><span class="t"><strong>' + k[1] + '</strong><span><i class="mark"></i><b>' + k[3] + '</b>' + (k[2] ? ' — ' + k[2] : '') + '</span></span><span class="v"><code>--cat-' + k[0] + '</code><span>' + c.hex + ' · ' + grade(c.ratio, false) + '</span><span>wash ' + w.hex + '</span></span></li>'
    }).join('') + '</ul>'

    html += '<h3>Status</h3><p class="cap">The ink shows which activity. The shape shows what state it is in.</p><ul class="status c2">' +
      '<li><span class="pip"></span><span class="t"><strong>Running</strong><span>Filled pip, unbroken line, “in progress”</span></span><span class="trace"></span></li>' +
      '<li><span class="pip hollow"></span><span class="t"><strong>Paused</strong><span>Hollow pip, hatched line, “paused”</span></span><span class="trace hatch"></span></li>' +
      '<li><span class="mark"></span><span class="t"><strong>Completed</strong><span>Square mark, washed block, a duration</span></span><span class="blk">55 m</span></li>' +
      '<li><span class="mark hollow"></span><span class="t"><strong>Not yet saved</strong><span>Open mark, dashed edge, “now”</span></span><span class="blk dashed">now</span></li>' +
      '</ul>'

    html += '<h3>Selection and focus</h3><ul class="chips">' + STATES.map(function (f) {
      var c = chip(f[0])
      return '<li><span class="chip" style="background:var(' + f[0] + ')"></span><span class="t"><strong>' + f[1] + '</strong><span>' + f[2] + '</span></span><span class="v"><code>' + f[0] + '</code><span>' + c.hex + '</span></span></li>'
    }).join('') + '<li><span class="chip focusdemo"></span><span class="t"><strong>Focus</strong><span>Keyboard focus, the one brass detail</span></span><span class="v"><code>--focus</code><span>' + chip('--focus').hex + '</span></span></li></ul>'

    var stack = [[150, 55, 0, 25], [110, 90, 35, 25], [155, 80, 45, 0], [152, 55, 25, 20]]
    var bars = stack.map(function (day, d) {
      var y = 96, out = ''
      day.forEach(function (min, i) {
        if (!min) return
        var h = (min / 300) * 90
        y -= h
        out += '<rect class="c' + (i + 1) + '" x="' + (14 + d * 34) + '" y="' + (y + 1).toFixed(1) + '" width="14" height="' + (h - 2).toFixed(1) + '" rx="1"/>'
      })
      return out
    }).join('')
    var totals = [20, 44, 56, 30, 18, 34].map(function (h, i) {
      return '<rect class="total" x="' + (176 + i * 22) + '" y="' + (96 - h) + '" width="12" height="' + h + '" rx="1"/>'
    }).join('')
    html += '<h3>Charts and timeline</h3><p class="cap">Left: categories stacked, with a 2px paper gap between touching marks. Right: totals across categories, in plain ink.</p>' +
      '<svg class="demo" viewBox="0 0 320 104" role="img" aria-label="Sample stacked category bars beside neutral total bars"><line x1="0" y1="96.5" x2="320" y2="96.5"/>' + bars + totals + '</svg>' +
      '<div class="tl"><p class="blk c1"><b>Mathematics</b> — Academics<span>1 h 22 m</span></p><p class="blk c2"><b>Violin</b> — Music<span>55 m</span></p><p class="blk c3 dashed"><b>Reading</b><span>in progress</span></p></div>'

    html += '<h3>Glass</h3><p class="cap">The navigation pane over text, with its sliding marker.</p><div class="glassdemo"><p>Thursday, 12 March. 4 h 12 m in five sessions, and one under way.</p><div class="pane"><span class="thumb"></span><span>Track</span><span>Explore</span><span>Settings</span></div></div>'

    el.innerHTML = html
  }

  build('light', 'Light')
  build('dark', 'Dark')
})()
