# mySqlEditor2

A lightweight, browser-based SQL workspace for MySQL, SQLite, and Postgres. It provides a SQL editor with tabs, schema browser, smart result tables (sorting, searching, pagination), query history, diffing between result snapshots, and optional visual query builder.

## What It Does
- Connects to MySQL, SQLite, or Postgres databases.
- Runs SQL queries and shows results in Table / CSV / JSON / Smart Table views.
- Smart Table supports search, sorting, pagination, and JSON cell inspection.
- Saves query history locally (browser) with a History modal.
- Saves result snapshots to compare diffs (added/changed/deleted rows).
- Optional graphical query builder modal (basic SELECT + JOIN).

## How To Run
1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
node server.js
```

3. Open the app:
- http://localhost:3010

## How To Use
- Click **Connect** to add a database connection.
- Pick a connection from **Active connection**.
- Write SQL in the **Command** pane and press **Run** (or `Ctrl+Enter`).
- Use **Table / CSV / JSON / Smart Table** to view results.
- In Smart Table, type search terms and press **Search**.
- Use **History** to recall previous SQL.
- Use **Save to History** + **Compare with...** to diff results.

## Where Data Is Stored
- **Connections** are stored server-side in `data/connections.yml`.
- **Tabs**, **query history**, and **result snapshots** are stored in browser localStorage.

## Notes
- The visual query builder currently supports basic `SELECT` + `JOIN` with `ON` clauses.
- Diffing uses current sort fields as a unique key; non-unique keys will alert.

## Repository Layout
- `public/` - frontend assets (HTML/CSS/JS)
- `server.js` - backend server and DB adapters
- `data/` - connection storage (server-side)

