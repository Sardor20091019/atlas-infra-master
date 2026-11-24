# Atlas Infra

An open-source, interactive atlas of real-world infrastructure architectures.

Not a generic drawing tool. A gallery of explained, layered, clickable reference
architectures: what a production Kubernetes cluster looks like, how a network is
split into subnets, why PgBouncer sits in front of PostgreSQL, what the request
path from a browser to a pod actually is.

## Status

Early but usable:

- Gallery of reference architectures with layer toggles and component cards.
- Stage slider: watch one product grow from a single server to a multi-AZ
  Kubernetes platform, with what changed and why at each step.
- Step-by-step request tracing.
- Build your own: drag components from the palette, drop them into boxes,
  connect them, and edit details in the inspector. Everything is also plain
  YAML with live validation, autocomplete and share links.
  Open any gallery entry with "Edit a copy" or start from the template.

Next: AI assistant (text to architecture, questions about a diagram).

## Run

```bash
pnpm install
pnpm dev
pnpm test
```

## Add an architecture

Architectures are plain data in `src/architectures/*.ts` (JSON-compatible, see
`src/dsl/types.ts`). Each node needs a `why`: that is the whole point of the atlas.
Register it in `src/architectures/index.ts`.

## Stack

Vite, React, TypeScript, React Flow (`@xyflow/react`), ELK (`elkjs`) for layout, zustand.

## License

MIT
