# RUSH UNIVERSE V5

This package extends the V4 feature architecture with reusable modules for:
- PvP matchmaking and ELO
- clans and clan wars
- seasonal progression / battle pass
- lucky wheel
- Rush AI Director event logic
- feature manifest for wiring

All player-facing UI should continue using the project's tiny-caps and TRC helpers.

The modules are intentionally framework-neutral: connect `store` methods to the existing database and handlers rather than replacing the bot's existing data layer.
