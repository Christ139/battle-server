# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# RULES

1. First think through the problem, read the codebase for relevant files, and write a plan to .claude/tasks/todo.md.
2. The plan should have a list of todo items that you can check off as you complete them
3. Before you begin working, check in with me and I will verify the plan.
4. Then, begin working on the todo items, marking them as complete as you go.
5. Please every step of the way just give me a high level explanation of what changes you made
6. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.
7. Finally, add a review section to the todo.md file with a summary of the changes you made and any other relevant information.
8. DO NOT BE LAZY. NEVER BE LAZY. IF THERE IS A BUG FIND THE ROOT CAUSE AND FIX IT. NO TEMPORARY FIXES. YOU ARE A SENIOR DEVELOPER. NEVER BE LAZY
9. MAKE ALL FIXES AND CODE CHANGES AS SIMPLE AS HUMANLY POSSIBLE. THEY SHOULD ONLY IMPACT NECESSARY CODE RELEVANT TO THE TASK AND NOTHING ELSE. IT SHOULD IMPACT AS LITTLE CODE AS POSSIBLE. YOUR GOAL IS TO NOT INTRODUCE ANY BUGS. IT'S ALL ABOUT SIMPLICITY
10. Anytime you create a .md file, it must be under the ".claude/docs/" file path.
11. **IMPORTANT**: Before implementing any new feature, evaluate it against `.claude/docs/IMPLEMENTATION_PLAN.md`. Use the Feature Evaluation Checklist to ensure the feature aligns with architecture constraints and performance requirements.

## Project Overview

Battle-server is a real-time space battle simulation server using a hybrid Node.js + Rust WebAssembly architecture. Node.js handles I/O and networking while Rust WASM performs high-performance combat calculations.

## Commands

```bash
# Run the server (port 4100)
node Server.js

# Compile Rust WASM (from battle-core directory)
cd battle-core
wasm-pack build --target bundler --release

# Run integration test (requires PostgreSQL database)
node test-battle-server.js
```

## Architecture

### Hybrid Performance Model
- **Node.js (Server.js, BattleManager.js)**: Express + Socket.IO for HTTP API and real-time WebSocket communication
- **Rust WASM (battle-core/)**: CPU-intensive simulation engine compiled to WebAssembly

### Key Components
- `Server.js` - Entry point, Express server with Socket.IO on port 4100
- `BattleManager.js` - Battle lifecycle management, tick loop coordination (50ms/tick = 20 ticks/sec)
- `battle-core/src/lib.rs` - WASM FFI bindings exposing `WasmBattleSimulator`
- `battle-core/src/simulator.rs` - Main simulation logic
- `battle-core/src/spatial_grid.rs` - 3D spatial partitioning for O(k) neighbor queries

### Simulation Pipeline (per tick)
1. Update spatial grid
2. Target acquisition
3. Unit movement
4. Weapon firing & damage calculation
5. Damage processing
6. Shield regeneration
7. Delta collection for client broadcast

### Socket.IO Events
- Rooms organized by system ID (`system:${systemId}`)
- Server emits: `battle:started`, `battle:tick` (deltas only), `battle:ended`, `battle:reinforcements`
- Client emits: `battle:start`, `battle:status`, `battle:stop`, `battle:reinforcements`, `battle:subscribe`

### HTTP API
- `GET /health` - Health check
- `POST /battle/start` - Start battle
- `GET /battle/status/:battleId` - Battle status
- `GET /battles/active` - List active battles
- `POST /battle/stop/:battleId` - Force stop

## External Dependencies

Database is external (game-server project). Integration tests connect to PostgreSQL at localhost:5432, database `game_db`, querying `Units`, `UnitModuleSlots`, and `weapon_modules` tables.

## Deployment

GitHub Actions workflow deploys to VPS via SSH on push to `main`. Uses PM2 for process management. Server path: `/srv/battle-server`.
