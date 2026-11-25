# Riptide Rush

**Wave Race meets Hydro Thunder** — a 100% self-contained photoreal 3D jet-ski racing game built with Three.js and deployed on GitHub Pages.

Play live: https://kprototype.github.io/riptide-rush/

## Features

- **Synchronized 3D Gerstner Ocean Waves**: 6 directional Gerstner wave components evaluated identically on CPU (buoyancy, hull pitch/roll, buoys, jump ramps, crest launches) and GPU.
- **Wave Race + Hydro Thunder Gameplay**:
  - Floating jump ramps & wave-crest launches (`Space` to pop off swells)
  - 4 Mid-Air Stunts (**Superman**, **360 Spin**, **Backflip**, **Grab**) that charge **Hydro Nitro**
  - **Red (Pass Right)** / **Yellow (Pass Left)** buoy slalom combo multiplier (`x1`–`x5`)
  - **7 AI Rival Jet-Ski Racers** with wake-spray bumping & wake turbulence
- **3 Photoreal Venues**:
  1. **Azure Atoll** — turquoise coral lagoon, volcanic peaks, anchored luxury yachts, swaying palms
  2. **Nordic Fjord** — sheer granite glacial cliffs, animated waterfalls, glowing cyan icebergs, pine forests
  3. **Tempest Harbor** — container cargo ships, striped lighthouse with rotating volumetric light beam, stone breakwaters, huge ocean swells
- **4 Jet Skis (All Unlocked in Marina Garage)**: Aqua Viper, Riptide GT, Wave Shark, Apex Kraken — plus persistent podium cash & best time/lap records.
- **Photoreal Marine Rendering & Audio**:
  - Rayleigh/Mie sky with volumetric clouds, HDR PMREM reflections, live mirrored planar water reflections
  - Subsurface turquoise wave-crest scattering, Beer-Lambert depth absorption & sandy seabed caustics
  - AgX tone mapping, UnrealBloomPass, optical sun flare, speed motion blur, refractive water-droplet lens splashes
  - 3D spray, rooster-tail hydro jet, and Gerstner-conforming foaming wake ribbons
  - Procedural Web Audio marine jet-ski synthesizer with airborne impeller cavitation whine
  - Live **Weather** (`O`: Sunny / Golden Sunset / Storm Swell) and **Quality** (`U`: Ultra / High / Balanced) toggles
- **Solo + Mobile Touch**: Full keyboard and landscape mobile touch controls (slideable steering pad, Auto-Gas toggle, Hydro Nitro, Wave Pop, and airborne stunt buttons).

## Controls

| Action | Keyboard |
|---|---|
| Throttle / Carve Brake | `W` / `S` or `↑` / `↓` |
| Steer Left / Right | `A` / `D` or `←` / `→` |
| Hydro Nitro Boost | `Shift` (or `N` / `E`) |
| Wave Launch Pop | `Space` |
| Mid-Air Stunts | `1` Superman · `2` 360 Spin · `3` Backflip · `4` Grab (or `Z`/`X`/`C`/`V`) |
| Cycle Weather | `O` (Sunny / Golden Sunset / Storm Swell) |
| Cycle Quality | `U` (Ultra / High / Balanced) |
| Pause / Mute | `P` / `M` |
