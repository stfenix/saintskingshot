# Kingshot Min-Max

A single-page alliance strategy tool for [KingShot](https://kingshot.net) — helps alliance members optimize builds, track progress, coordinate KvK, and reference game data.

## Features

### Setup
| Page | Description |
|------|-------------|
| **My Roster** | Add owned heroes and set star levels; drives all personalized recommendations |

### Optimizer
| Page | Description |
|------|-------------|
| **Event Builds** | Optimal hero lineup and troop composition per event, filtered to your roster |
| **Power Up Roadmap** | Prioritized upgrade actions to grow power efficiently |

### Reference
| Page | Description |
|------|-------------|
| **Skill Planner** | Track skill levels across all heroes with progress indicators |
| **Full Tier List** | Hero ranking and tier breakdown |
| **Troop Calculator** | Calculate optimal troop compositions for combat |
| **Game Guide** | Reference tables for Terror Hunt, Beast Hunt, Crazy Joe, Viking Vengeance, and other events |

### Alliance
| Page | Description |
|------|-------------|
| **Kingdom Age Tracker** | Look up kingdom open dates and server age using the KingShot API |
| **Event Calendar** | Upcoming game event schedule |
| **Alliance HQ** | Alliance management hub and member overview |
| **KvK War Planner** | Plan kingdom vs kingdom matchups and track season results |
| **Stockpile Tracker** | Track alliance resource stockpiles |
| **Power Board** | Alliance member power rankings leaderboard |
| **Swordland Setup** | Planning tool for the Swordland Showdown event |
| **Alliance Tech Tree** | Visual tech tree (Growth / Battle / Territory tabs) with node unlock paths |
| **Research Tree** | Academy research tree with node progression tracking |

### Tools
| Page | Description |
|------|-------------|
| **Training Efficiency Calculator** | Compare troop tiers by event points/hour with custom speed bonuses |
| **Daily Checklist** | Persistent daily task list |
| **Hero Compare** | Side-by-side hero stat comparison |
| **Research Tracker** | Track individual research progress |
| **Settings** | Sync preferences and data management |

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS — single file (`index.html`), no build tools or framework
- **Storage**: Firebase Firestore (cloud sync) + `localStorage` (offline-first, instant load)
- **API**: [KingShot API](https://kingshot.net/api) for player info, KvK data, gift codes, and kingdom tracker
  - API calls use a 4-proxy fallback chain (direct → corsproxy.io → allorigins.win → thingproxy) to handle CORS restrictions

## Development

No build step required — edit `index.html` directly and open in a browser.

```bash
# Clone
git clone https://github.com/stfenix/saintskingshot.git
cd saintskingshot

# Open locally
open index.html   # macOS
xdg-open index.html  # Linux
```

### Firebase Setup

The app uses Firebase Firestore for data sync. To use your own Firebase project:

1. Create a project at [Firebase Console](https://console.firebase.google.com)
2. Enable Firestore in Native mode
3. Replace the `firebaseConfig` object near the top of `index.html` with your project credentials

## Data Persistence

- All user data (roster, skill levels, research progress, checklist) is saved to `localStorage` immediately and synced to Firestore in the background
- Data is keyed per-user via a unique ID stored in `localStorage`
- No account/login required

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /player-info?playerId=` | Look up player name, kingdom, and level |
| `GET /kvk/seasons` | List KvK seasons |
| `GET /kvk/matches` | KvK match results |
| `GET /kingdom-tracker` | Kingdom open dates and server metadata |
| `GET /gift-codes` | Active gift codes |
