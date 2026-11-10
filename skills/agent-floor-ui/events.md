# Event Contract

Publish JSON to `POST http://127.0.0.1:4310/events` with `Content-Type: application/json`, or pass the same object to `store.dispatch`.

```json
{
  "type": "agent.upsert",
  "agent": {
    "id": "builder-1",
    "name": "Builder",
    "role": "Engineer",
    "color": "#53b79b",
    "status": "working",
    "task": "Implementing the requested feature",
    "zone": "desks"
  }
}
```

Valid statuses: `working`, `thinking`, `idle`, `blocked`.
Valid zones: `desks`, `meeting`, `lounge`, `lab`.
Colors must be six-digit hexadecimal strings. Text fields must contain 1-500 characters.

Optional agent fields:

- `floor`: floor ID matching `[A-Za-z0-9][A-Za-z0-9_-]{0,63}`. Default demo floors are `main` and `loft`; unknown floors display on the first floor.
- `progress`: number from 0 to 100. Send it only when the host knows real progress.
- `avatar`: `{ skin?, hair?, hairStyle?, accessory? }` with hex colors, `hairStyle` in `short|long|bun|cap|hood|spiky|bald`, and `accessory` in `none|glasses|beard|glasses-beard|headset`.

```json
{ "type": "agent.move", "id": "builder-1", "zone": "lab", "floor": "loft" }
```

```json
{ "type": "agent.move", "id": "builder-1", "zone": "lab" }
```

```json
{ "type": "activity", "id": "builder-1", "message": "Started the test suite" }
```

```json
{ "type": "agent.remove", "id": "builder-1" }
```

`agent.upsert` replaces the complete record for an existing ID. A move for an unknown ID is a no-op. The relay replays current agents and up to 60 activities on connection; state is in-memory and resets when the relay restarts. The relay accepts at most 100 agents and 64 KiB per event.