# NEPSE Stock Market Scraper & Terminal Dashboard

A high-performance, **zero-dependency** Python scraper and premium financial terminal dashboard for the Nepal Stock Exchange (NEPSE). 

This tool pulls today's share prices directly from ShareSansar, parses and clean-normalizes the raw data, exports standard JSON/CSV files, and launches a stunning dark-themed interactive UI in your browser for deep market analysis.

---

## Key Features

- **Zero Third-Party Dependencies:** Built entirely using Python's standard libraries (`urllib` and `html.parser`). No `pip install` required.
- **On-Demand Live Refresh:** Trigger fresh data scrapes directly from the web dashboard using a built-in REST API proxy.
- **Interactive Dashboard:** Premium dark-themed, glassmorphic layout optimized for desktop and mobile viewports.
- **Advanced Searching & Sorting:** Instantly search by stock symbol and sort columns (Open, High, Low, Close, Volume, Turnover, etc.) dynamically.
- **Analytical Filters:** Quick tabs for Top Gainers, Top Losers, Volume leaders, Turnover leaders, and **52-Week High Breakouts** (stocks trading within 1.5% of their year-long highs).
- **Day Trading Pivot Points:** Click on any stock row to open an analysis panel that calculates Central Pivot Points (PP), Resistance levels (R1, R2), and Support levels (S1, S2) automatically.
- **52-Week Range Bar:** Visual range progress indicator showing where the current price sits in relation to its 52-week boundaries.

---

## File Structure

```text
scraper/
├── data/
│   ├── nepse_today.json  # Scraped data in structured JSON
│   └── nepse_today.csv   # Scraped data in flat CSV format
├── scrape.py             # Python scraper core script (standalone)
├── run.py                # Unified runner & local REST server
├── index.html            # Web dashboard structure
├── style.css             # Premium CSS styling system
├── app.js                # Dashboard JavaScript engine
├── .gitignore            # Git exclusion rules
└── README.md             # Project documentation
```

---

## Quick Start

### Prerequisites
- **Python 3.6 or higher** installed on your system.

### How to Run

1. Open your terminal in this directory.
2. Run the unified launcher script:
   ```bash
   python3 run.py
   ```
3. The script will automatically:
   - Run the scraper to pull the latest stock prices.
   - Save the parsed data to the `data/` folder.
   - Start a local lightweight web server on port `8000`.
   - Open the interactive dashboard in your default browser at `http://localhost:8000/index.html`.

*To terminate the server at any time, simply press `Ctrl + C` in your terminal window.*

---

## Under the Hood: Technical Indicators

### 1. Pivot Points (Standard)
Pivots help traders identify potential support and resistance lines based on the day's trading range:
- **Central Pivot Point (PP):** $\text{PP} = \frac{\text{High} + \text{Low} + \text{Close}}{3}$
- **Resistance 1 (R1):** $\text{R1} = (2 \times \text{PP}) - \text{Low}$
- **Support 1 (S1):** $\text{S1} = (2 \times \text{PP}) - \text{High}$
- **Resistance 2 (R2):** $\text{R2} = \text{PP} + (\text{High} - \text{Low})$
- **Support 2 (S2):** $\text{S2} = \text{PP} - (\text{High} - \text{Low})$

### 2. 52-Week Boundary Position
Indicates relative position inside the yearly trading bounds:
- $\text{Position \%} = \frac{\text{Close} - \text{52W Low}}{\text{52W High} - \text{52W Low}} \times 100$
- Values $>85\%$ trigger a **Bullish High Breakout** label.
- Values $<15\%$ trigger a **Bearish Low Boundary** label.
