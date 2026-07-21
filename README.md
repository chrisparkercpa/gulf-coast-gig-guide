# Gulf Coast Gig Guide

Live music listings from New Orleans, LA to Apalachicola, FL, published with GitHub Pages.

## How it works

The website reads its show list from one Google Sheet ("Gulf Coast Gig Guide - Shows").
Edit the sheet from any phone or computer and the site updates on the next page load —
no GitHub uploads, no code edits.

- **Sheet columns** (first row, any order): Date, Start Time, Artist, Venue, City, State, Genre, Cover, Source Link, Notes, Status
- Shows with a date in the past are hidden automatically.
- Put `Cancelled` or `Hide` in the Status column to hide a row without deleting it.
- Type `Free` (or `$10`, etc.) in the Cover column — "Free" rows appear under the Free-only filter.
- Paste the Facebook post or venue calendar link in Source Link; it becomes the card's Source button.

## One-time setup

1. Open the Google Sheet → **Share → Anyone with the link → Viewer**.
2. That's it. The sheet ID is set at the top of `app.js`.

## Files

- `index.html` — page structure
- `styles.css` — appearance
- `app.js` — loads the Google Sheet and runs the filters
- `.nojekyll` — tells GitHub Pages to serve the files as-is

## Disclaimer

Listings are community-reported. Verify all events with the venue before traveling.
