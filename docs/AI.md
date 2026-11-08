# Optional local AI and generated study material

Source entry points: [packages/runtime/src/ai/contracts.ts](../packages/runtime/src/ai/contracts.ts), [packages/runtime/src/ai/shared-ai.ts](../packages/runtime/src/ai/shared-ai.ts), [server/src/ollama.ts](../server/src/ollama.ts), [server/tests/ollama.test.ts](../server/tests/ollama.test.ts).

## Provider ownership

AI is optional. Flashcards, quizzes, boards, drawing and games retain manual workflows. The eligible provider is the packaged desktop temporary host, a local desktop personal session, or the persistent server's own configured Ollama. A browser-only or mobile temporary host has no local provider route, and a desktop guest cannot silently become the group's provider.

`packages/runtime/src/ai/shared-ai.ts` coordinates shared requests. `local-ollama.ts` and `ollama-gateway.ts` implement desktop/provider integration; `server/src/ollama.ts` implements the persistent-server provider. `study-ai.ts` contains study-specific generation contracts; `gartic-bots.ts` adapts bot work to the game's jobs. Use the path appropriate to the session model instead of exposing arbitrary localhost fetches in all clients.

## Typed request contract

The supported features are `flashcards`, `quizzes`, `board`, `boardVision`, `sprites` and `gartic`. The shared input schema requires a feature and a prompt of 1–12,000 characters, with at most one bounded Base64 image. The wire has three commands: status, generate and cancel, each with a bounded request ID.

`AiProvider` has `status()`, `generate(person, id, input)` and `cancel(person, id?)`. Status returns advertised features and model. Replies are a result or one of `ai-unavailable`, `ai-busy`, `ai-response`, and `cancelled`. A provider must validate its actual model capability before advertising image-based features; selecting a model name alone does not prove vision support.

## Output validation

`contracts.ts` maps each feature to a Zod response schema. Flashcard and quiz responses contain 1–12 items. Quiz choices must be distinct and the correct-choice index must fall inside the choices array. Drawing output bounds stroke count, colors, widths and coordinates; text-only or drawing bot output must actually contain content. Board and sprite responses have separate typed validators.

These bounds protect downstream models from malformed output. They do not establish educational correctness. Present generated material as a reviewable draft; saving it should use the same validated library/document paths as manual creation. Avoid claiming that a successful request is evidence that generated answers are correct.

## Server configuration and work queue

Set `OLLAMA_ENABLED=true`, an installed `OLLAMA_MODEL`, and an explicit feature list when desired. The default URL is loopback port 11434. The server provider checks model availability, validates input, serializes work through a bounded queue, and tracks requester identity. Cancellation aborts active work and rejects queued matching work. Disposal aborts the active request and clears the queue.

The server generation timeout defaults to 60 seconds. Desktop gateway configuration has its own timeout and rate policy; do not assume every provider uses the same value. Provider failure should leave the manually entered material intact and distinguish unavailable, busy, invalid response and cancelled outcomes.

## Data flow and scope

A request moves from a reviewable UI action to session authorization, the selected provider, response validation and then draft presentation. Only explicit review/save should turn generated content into persistent study data. The host computer receives prompt content required to perform inference; local-first storage does not mean that shared AI requests remain invisible to their host.

For Gartic, bots execute scoped game jobs. They must not submit late results into a new round or bypass the game's action authorization. Losing authority or disabling the provider should cancel pending work rather than leave a hidden generation loop running.

## Testing and limitations

Use `ai.test.ts`, `shared-ai.test.ts`, `server/tests/ollama.test.ts` and the desktop setup browser fixtures. Cover malformed JSON, schema-valid but unusable answers, duplicate choices, missing models, unauthorized guests, timeouts, cancellation and shutdown. Protocol fixtures validate integration without consuming actual model resources. They do not measure real-model quality, hardware throughput or factual reliability.
