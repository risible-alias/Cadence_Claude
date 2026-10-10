# Cadence design prototypes

Three mobile-first directions for a possible redesign of Cadence, built to be opened side by
side on an iPhone. They are design explorations, not production code.

**The real app is untouched.** These are plain HTML, CSS and JavaScript files with no build step
and no dependencies. They share nothing with `src/`, read and write no storage of any kind (no
IndexedDB, no localStorage, no service worker, no network requests), and are not part of the
Vite build or the GitHub Pages deployment. All data is invented and held in memory; a reload
puts everything back.

## Round two: Direction A refined

After reviewing A, B and C, direction A was chosen and developed further. Round two lives
alongside round one in this folder and is still a prototype: nothing here touches the app.

| Page | What it shows |
|---|---|
| `refined.html` | The refined direction: Track, Explore, Settings |
| `refined.html?track=1` / `?track=2` | The two Track variations |
| `refined.html?nav=glass` / `?nav=rule` | The two navigation treatments |
| `palette.html` | Palette specimen, light and dark together |
| `tokens.css` | The proposed design tokens |

A grey strip at the top of `refined.html` switches Track and navigation variations in place, so
they can be compared on the phone without typing addresses. It is a prototype control, not part
of the design; add `&bare` to the address to remove it. `screenshots/round2/` has iPhone-sized
captures of every state.

### Track

The date is now the heading; the "Cadence" line above it is gone.

**While a session runs** (both variations): the activity name, then a timer set at roughly a
third of the screen width per digit pair, then one thin line in the activity's ink showing the
session so far with any pause hatched (borrowed from B). Start, elapsed and paused are written
underneath. Two equal controls follow: Pause or Resume as the filled one, Finish as the open one.
Discard sits behind a quiet "Other options" link and has to be revealed before it can be pressed.

**When nothing is running**, the two variations differ:

- **1. Ledger rows.** The four most recently used activities, one to a line, each about 82px
  high: a margin line in the activity's ink, the name in large type, its group and when it was
  last used, and a small "Begin" cue. "Other activities" opens the rest in place.
  *For:* the largest touch targets, the most legible names, room for useful context (last used),
  and it scales to long names. Everything is reachable in one or two taps without leaving the
  page. *Against:* four rows fill the screen, so the day's summary starts below the fold.
- **2. Catalogue cards.** The same four as a two-by-two set of thinly edged cards, about 88px
  high, each with an ink tab on its top edge; "Another activity" opens a sheet listing everything
  by group. *For:* more compact, so the day's summary is visible sooner; the sheet handles a long
  list of activities well and shows the grouping. *Against:* half-width cards cut long names short
  sooner and have no room for "last used"; a two-column set reads less like a journal and more
  like an app launcher; choosing a less-used activity takes a second screen.

Variation 2 also centres the running timer, to show that alternative; that choice is independent
of rows versus cards.

### Colour

`tokens.css` defines the system and `palette.html` shows it. Four rules:

1. **Colour means category**, and only that. An activity keeps its ink in lists, on the
   timeline and in every chart.
2. **Status is never colour alone.** Running is a filled pip and an unbroken line; paused is a
   hollow pip and hatching; completed is a square mark and a washed block; a session not yet
   saved is an open mark and a dashed edge. Each also says so in words.
3. **Totals are plain ink.** Anything that sums across categories (hours by time of day, weekly
   totals) is drawn neutral, so colour never implies a category that is not there.
4. **Words stay in ink.** A coloured mark sits beside a name; text is never coloured.

Tokens cover: paper (page, raised, sunk), ink (primary, soft, faint), two rules, five category
inks with a wash each, selection and pressed tints, focus, status weights, chart roles, and the
glass navigation. Dark mode has its own ink values rather than an automatic inversion.

| Ink | Light | Dark | Sample use |
|---|---|---|---|
| Lapis | `#2c56ad` | `#5f8ae0` | Academics |
| Oxblood | `#a33a25` | `#dc5f5f` | Music |
| Plum | `#8e3f92` | `#ad6cba` | Reading |
| Forest | `#08775a` | `#2a9d80` | Admin |
| Brass | `#b3811a` | `#b08f24` | Languages (archived), keyboard focus |

In the prototype a sub-category takes its group's ink (Violin and Piano are both oxblood), so
colour answers "what kind of time was this" and the name answers "which one".

**What was checked.** The five inks were run through a palette validator in both modes:
lightness band, minimum saturation, separation under the three common forms of colour
blindness for neighbouring marks, separation for full colour vision, and contrast against paper.
All pass for marks that sit next to each other in the fixed order, which is how stacked bars and
legends use them. Every ink is at least 3:1 against its paper, and body text is 14:1 (primary)
and 5.3:1 or better (secondary).

**Known limits.**

- Five hues cannot all be told apart from each other by everyone. Lapis and plum are the
  closest pair, more so in dark mode and for red-weak vision. They are never neighbours in a
  stack, and a name always accompanies the mark, but this is why the scatter plot is drawn in
  plain ink rather than by category.
- Five inks means five groups. A sixth group would need either a shared ink or an "other".
  Assigning inks would become a per-category setting.
- The muted "antique" tones in the brief had to be pushed slightly more saturated than a
  purist palette, because very grey inks stop being distinguishable as small marks.
- Destructive actions are deliberately not red, since oxblood already means a category. They
  are kept apart by position, wording and a second step instead.

### Navigation

- **Glass:** a small pane resting above the page's lower edge, the paper showing through it
  softened, with a marker that slides between the three words. It uses one backdrop effect and
  one moving element. Where the user has asked for reduced transparency it becomes a solid pane;
  with reduced motion the marker jumps instead of sliding; without backdrop support it is nearly
  opaque; with increased contrast it gains a firm edge.
- **Rule:** opaque paper, a hairline, and a short stroke of ink over the current word.

*Glass, for:* content runs to the very foot of the screen, which suits long timelines; the
sliding marker gives a clear sense of place; it reads as "a lens laid on the page", which fits
the desk-and-library idea without imitating anything. *Against:* text passing underneath is
visible, if softened, and can be a distraction at the moment of reading the labels; it is the
only element on the page with a curved edge and a drop tone, so it is also the only thing
that does not look printed; backdrop effects cost a little on older phones; the page needs extra
space at the foot so the last line can scroll clear.

*Rule, for:* entirely of a piece with the typography, nothing to render, always legible, and
it gives the largest tap areas. *Against:* it takes a full-width strip of the screen
permanently and is the plainer of the two.

### Explore

- **Day** is now a timeline drawn to scale (from B): hours in the margin, each session a block
  washed in its ink with a margin line, pauses as a hatched notch, a session carried over from
  the previous day listed above the scale, the running session dashed, and a line for "now".
- **Week** stacks each day's bar from its categories, with totals above. The group list beneath
  doubles as the legend (mark, name, time, share), followed by a per-activity breakdown.
- **Patterns** keeps totals in plain ink and states the sample size and the number of unrated
  sessions on the concentration chart (from B).
- **The date control** is three fixed parts (arrow, date, arrow); the date is plain text with
  the native picker laid invisibly over it, so it cannot overflow.

### Preferred combination

**Ledger rows (Track 1), with the timer set left as in Track 1, and the glass navigation.**

- **Rows over cards.** Starting an activity is the main purpose of the screen, and the rows
  make that the most obvious and the most forgiving thing on it. They also carry "last used",
  which helps choose. The cards save space the screen does not need to save, since the summary
  is secondary here.
- **Left-set timer over centred.** It shares a margin with everything else on the page;
  centring makes the timer feel like a separate widget.
- **Glass over rule, narrowly.** The glass pane is the one deliberately "object-like" element,
  and one such element suits the brief (a lens on a journal) where several would not. It also
  frees the foot of long pages. I would choose the rule instead if you find the text moving
  beneath the pane distracting on your phone; that is a matter of feel on a real device and
  worth checking before deciding. Both use the same markup, so switching later is cheap.
- **Keep from this round regardless:** the token system and its four rules, the to-scale day,
  and the status treatments.

Not yet designed: the optional reflection after finishing, adding a title to a session,
the editing sheet for a saved session, category editing with ink selection, and empty states.
Those should be drawn before integration.

## Running them

From the project folder:

```bash
python3 -m http.server 4321 --bind 0.0.0.0 --directory design-prototypes
```

- **On this Mac:** <http://localhost:4321/>
- **On an iPhone or iPad on the same Wi-Fi:** `http://<this Mac's IP address>:4321/`
  (find the address with `ipconfig getifaddr en0`). Add each page to a Safari tab group, or use
  "Add to Home Screen" on one to see it without browser chrome.

Stop the server with Ctrl-C. Port 4321 is deliberately different from the app's dev server, so
the prototypes sit on their own origin.

The pages also open directly from Finder (double-click `index.html`).

Round one pages:

| Page | Direction |
|---|---|
| `index.html` | Chooser (both rounds) |
| `a.html` | A. Editorial Minimalism |
| `b.html` | B. Analytical Instrument |
| `c.html` | C. Quiet Native Utility |

Add `#explore` or `#settings` to a URL to open that section directly.
`screenshots/` holds iPhone-sized captures of every screen (light, plus two dark each).

## What to try

- **Track:** the timer runs. Pause, Resume and Finish work; "More" (or `···`) reveals Discard.
  After Finish, the quick-start list appears; choose something to start a new session.
- **Explore:** Day, Week, and a third view of example charts. In Day, use the arrows or tap the
  date itself to open the system date picker. In Week, tap a bar to open that day. Tap or hover a
  chart mark for its value.
- **Settings:** categories, archive, backup and preferences. Rows respond with a note; they do
  not open real editors.
- Switch the device between light and dark appearance.
- On an iPad or Mac, widen the window: the navigation moves off the bottom edge.

The sample week is Monday 9 to Sunday 15 March 2026, with "now" fixed at Thursday 15:42. It
includes a session that crosses midnight (Wednesday 23:20 to Thursday 00:25), paused sessions,
sessions with and without ratings, and one archived category.

## Changes common to all three

- **Three sections with bottom navigation:** Track, Explore, Settings.
- **Specific name first:** "Violin — Music", never "Music → Violin". The group is always the
  quieter part.
- **A date control that cannot overflow.** The current app puts a native date field in the
  layout, and on iPhone its built-in width pushes it out of line. Here the visible control is
  ordinary text between two arrows; the native field lies invisibly on top of the text, so
  tapping the date still opens the system picker but its size never affects the row.
- **Fewer controls on screen.** Track shows two actions (Pause, Finish) plus an overflow that
  holds Discard. Category management, backup and the date range controls have moved out of the
  main screen. Explore has one three-way switch instead of separate toggles, filters and
  navigation buttons all at once.
- **Elapsed versus active stays visible** (start time and paused time under the timer), and the
  running session is always marked apart from saved ones and excluded from totals.
- **Light and dark** follow the device setting.
- **Wider screens:** A becomes a single book-width column with navigation at the top; B and C
  move navigation to a side rail, and B sets panels in two columns.

## A. Editorial Minimalism

*A journal page: warm paper, one ink, serif type, hairlines instead of boxes.*

**Rationale.** Cadence is a private record of how days were spent, closer to a notebook than a
dashboard. This direction leans on that: the date is the masthead, totals are written as
sentences ("4 h 12 m in five sessions"), and sessions read as dated entries. There are no
containers at all; hierarchy comes from type size, weight, italics and thin rules. Charts are
drawn in the same single ink, with one muted red kept for "now" and "today".

**Strengths.** The most distinctive and the calmest of the three. Nothing competes with the
timer. It cannot be mistaken for a generic dashboard. Colour is never needed to read it, which
also makes it the most robust for colour-blind use and for print.

**Trade-offs.** One ink means categories are told apart by words, not colour, so a busy day is
slower to scan at a glance and stacked charts are not available. Text-style buttons are quieter
than filled ones: elegant, but a first-time user has less to aim at. The look depends on a good
serif being present (Iowan Old Style or Palatino on Apple devices; other platforms fall back to
Georgia and lose some of the character). Dense analytics would strain it.

## B. Analytical Instrument

*A measuring device: ruled panels, monospaced readouts, charts drawn to scale.*

**Rationale.** Takes the data seriously as data. The timer is a readout with start, elapsed and
paused shown as separate cells, and a trace of the session so far with pauses hatched. The day
is a true-to-scale timeline against the clock. Explore shows what analysis could become: a
stacked week by group, a day-by-hour matrix, a session-length distribution, and concentration
against length with the sample size and missing ratings stated.

**Strengths.** The most information per screen, and the clearest about what the numbers mean
(units, counts and caveats are part of the design). The to-scale timeline shows gaps and overlaps
that a list hides. It has the most room to grow when charts and statistics arrive.

**Trade-offs.** The densest and the least restful; capitalised monospaced labels are precise but
tiring in quantity, and small on a phone. It asks the most of the user and could feel like work
for someone who only wants to press Start. Four group colours are needed, which caps how many
groups can be told apart (more than about six would need folding into "Other"). It also needs
the most care to keep honest: a scatter of twelve points looks more authoritative than it is.

## C. Quiet Native Utility

*Feels like it came with the phone: system type, grouped lists, a standard tab bar.*

**Rationale.** Uses the conventions an iPhone user already knows, so nothing has to be learned:
large titles, inset grouped lists, a segmented control, chevrons, a switch, tinted buttons. The
structure does the work; the design's job is spacing and restraint.

**Strengths.** The easiest to use immediately and the lowest risk. It has the best touch targets
and the most familiar Settings screen. It will sit comfortably beside Apple's own apps on the
Home Screen, and it is the most straightforward to build and to keep consistent.

**Trade-offs.** The least distinctive: it borrows its character from iOS, so it has little of
its own, and it relies on soft-cornered grouped panels more than the other two. On a Mac or in a
non-Apple browser the iOS idiom looks slightly out of place. Because it is not a real native
app, small differences from system behaviour (scroll physics, the blur, the switch) are easier
to notice than in a design that does not imitate anything.

## Recommendation

**A, Editorial Minimalism, as the base, borrowing two things from the others.**

- It fits the product's stated principles best: calm, uncluttered, no value judgements, time
  tracking first and analysis second. A journal is the right metaphor for a private record that
  never scores you.
- It answers the brief most directly: distinctive, elegant, compact, typographic, and free of
  dashboard clichés.
- Its main weakness, scanning categories without colour, matters less than it seems for one
  person's dozen-odd categories, where the names are already familiar.

What to take from the others:

- **From B:** the to-scale day timeline and the explicit readout of start, elapsed and paused.
  Both can be redrawn in A's single ink. B's honesty about sample sizes and missing ratings
  should carry over to any future chart whatever the style.
- **From C:** the Settings structure and the touch-target sizes. A's text buttons should keep
  C's 44-point hit areas even though they look lighter.

If the priority is zero learning curve over character, choose C. Choose B only if the charts
are the main reason to open the app; today they are not, and they are not built yet.

## What these prototypes are not

- Not accessible to production standard. Roles, labels and focus styles are present, but they
  have not been through a screen-reader pass.
- Not tested on a physical iPhone. Screenshots come from Playwright's WebKit build at iPhone 15
  size; the date picker and safe-area spacing in particular should be checked on a real device.
- Not wired to anything. Editing, adding categories, export and restore are represented by a
  row and a note.
- The chart examples under Explore are illustrations with invented data. None of that analysis
  exists in the app.

## Files

```
index.html, index.css     chooser
shared.js, shared.css     sample data, demo behaviour, the date control, tooltip
tokens.css                round two: design tokens
refined.html, .css, .js   round two: the refined editorial direction
palette.html, .css, .js   round two: palette specimen
a.html, a.css, a.js       Editorial Minimalism
b.html, b.css, b.js       Analytical Instrument
c.html, c.css, c.js       Quiet Native Utility
screenshots/              iPhone-sized captures
```

One caution if you edit these files: the app's Tailwind build scans every text file in the
project for class names, this folder included. A stray word in a `.html`, `.js` or `.md` file
here that happens to be a Tailwind class name would add an unused rule to the app's stylesheet.
As delivered, the app's built CSS is byte-for-byte identical with and without this folder
(compared by checksum). `.css` files are not scanned.

Chart colours in B and C were checked for colour-blind separation and contrast in both light
and dark; A uses a single ink and needs none.
