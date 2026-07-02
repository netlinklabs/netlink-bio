# Netlink.bio

One link for everything — bio link, CV builder, and community dashboard with **NET Token** integration (Polygon).

## Status
🚧 Early-stage prototype — static HTML + Tailwind CSS (CDN). No framework/build tool yet.

## Structure

```
netlink-bio/
├── index.html       # Main landing page (marketing)
├── dashboard.html    # User dashboard
├── bio.html           # Public bio page (@username)
├── cv.html             # CV builder / viewer
└── README.md
```

## Planned Features
- [ ] Web3 wallet connect integration
- [ ] Display NET, POL (Polygon), and USDC balances
- [ ] NET Token-based features (community support, idea validation, etc — see [`netlink-contracts`](https://github.com/netlinklabs/netlink-contracts) and [`docs`](https://github.com/netlinklabs/docs))

## Tech Stack (Current)
- HTML5
- Tailwind CSS (via CDN)
- [Lucide Icons](https://lucide.dev)
- Fonts: Inter & Poppins (Google Fonts)

## Migration Roadmap
The current structure is a static prototype. The plan is to migrate to React (likely with Vite) once interactive features such as wallet connect and state management are needed.

## Related
Part of the [Netlink Labs](https://github.com/netlinklabs) ecosystem:
- [`netlink-contracts`](https://github.com/netlinklabs/netlink-contracts) — NET Token smart contracts & audits (MIT License)
- [`docs`](https://github.com/netlinklabs/docs) — Official ecosystem documentation
- [`assets`](https://github.com/netlinklabs/assets) — Logos & branding
