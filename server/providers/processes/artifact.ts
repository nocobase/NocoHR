import { z } from 'zod';

import { capabilityRecordDigest } from '../upgrade/digest.js';
import type { ProcessDefinition, ProcessHandler } from './engine.js';
import { validateProcessDefinition } from './engine.js';

const identifier = z.string().min(1).max(128);
const node = z.discriminatedUnion('type', [
  z.strictObject({
    key: identifier,
    type: z.literal('run'),
    handler: identifier,
    next: identifier.optional(),
  }),
  z.strictObject({
    key: identifier,
    type: z.literal('condition'),
    handler: identifier,
    yes: identifier,
    no: identifier,
  }),
  z.strictObject({
    key: identifier,
    type: z.literal('terminate'),
    outcome: z.enum(['success', 'failed']),
  }),
]);
const payloadSchema = z.strictObject({
  formatVersion: z.literal(1),
  key: identifier,
  enabled: z.boolean(),
  entry: identifier,
  inputSchema: z.record(z.string(), z.unknown()),
  nodes: z.array(node).min(1).max(10_000),
});
const artifactSchema = payloadSchema.extend({
  hash: z.string().regex(/^[a-f0-9]{64}$/u),
});

export type ProcessArtifact = z.infer<typeof artifactSchema>;

/** Compile serializable contracts; unsupported schema transforms fail before an artifact is published. */
export function compileProcessArtifact(
  definition: Omit<ProcessDefinition, 'hash'>,
  handlers: ReadonlyMap<string, ProcessHandler>,
): ProcessArtifact {
  validateProcessDefinition({ ...definition, hash: 'compiling' }, handlers);
  const payload = payloadSchema.parse({
    formatVersion: 1,
    key: definition.key,
    enabled: definition.enabled,
    entry: definition.entry,
    nodes: definition.nodes,
    inputSchema: z.toJSONSchema(definition.inputSchema),
  });
  // Also prove that source-free validation supports this schema before publishing it.
  z.fromJSONSchema(payload.inputSchema);
  return { ...payload, hash: capabilityRecordDigest(payload) };
}

/** Load only supported and intact definitions. No module path or handler body comes from a database row. */
export function loadProcessArtifact(
  value: unknown,
  handlers: ReadonlyMap<string, ProcessHandler>,
): ProcessDefinition {
  const parsed = artifactSchema.safeParse(value);
  if (!parsed.success) throw new Error('INVALID_PROCESS_ARTIFACT');
  const { hash, ...payload } = parsed.data;
  if (capabilityRecordDigest(payload) !== hash)
    throw new Error('PROCESS_ARTIFACT_DIGEST_MISMATCH');
  const definition: ProcessDefinition = {
    key: payload.key,
    hash,
    enabled: payload.enabled,
    entry: payload.entry,
    nodes: payload.nodes,
    inputSchema: z.fromJSONSchema(payload.inputSchema),
  };
  validateProcessDefinition(definition, handlers);
  return definition;
}
