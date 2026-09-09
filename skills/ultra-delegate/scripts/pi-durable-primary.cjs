'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const durable = require('./durable-run.cjs');
const slice = require('./run-slice.cjs');
const { permissionForTool } = require('./pi-native-permissions.cjs');
const { signalOutcome } = require('./agent-execution-driver.cjs');

module.exports = async function register(pi) {
  const config = JSON.parse(process.env.UBP_PI_DURABLE_CONFIG || 'null');
  if (!config || !path.isAbsolute(config.root) || !path.isAbsolute(config.native_tools_module)) throw new Error('durable_config_missing');
  let stopReason = 'fresh_process_exited_without_consumption';
  const verify = (ctx) => {
    if (path.resolve(ctx.cwd) !== config.root) throw new Error('durable_directory_changed');
    const record = durable.status(config.grant_id, { projectRoot: config.root });
    if (JSON.stringify(record.source_hashes) !== JSON.stringify(durable.sourceHashes())) throw new Error('durable_source_changed');
    const claim = slice.json(path.join(durable.paths(config.root, config.grant_id).dir, 'claim.json'));
    if (record.nonce !== config.registration_nonce || claim.nonce !== config.claim_nonce
        || claim.registration_nonce !== record.nonce) throw new Error('durable_claim_changed');
    const context = durable.authority(config.root, record.grant);
    if (!Number.isFinite(Date.parse(claim.claimed_at))
        || Date.now() >= Date.parse(claim.claimed_at) + context.grant.turn_timeout_seconds * 1000) throw new Error('fresh_turn_deadline');
    return context;
  };
  // Register the grant check before restoring tools. A revoked/changed grant
  // blocks each native effect even while a provider response is in flight.
  pi.on('tool_call', (event, ctx) => {
    try {
      const { permission } = verify(ctx);
      const decision = permissionForTool({ cwd: config.root, read_only: permission.writableRoots.length === 0,
        writable_root_paths: permission.writableRootPaths }, event);
      process.stderr.write(`${JSON.stringify({ type: 'ultra_durable_permission', tool_call_id: event.toolCallId,
        tool_name: event.toolName, decision: decision.decision, scope: decision.scope })}\n`);
      if (!decision.allowed) return { block: true, reason: `ultra_permission_denied: ${decision.scope}` };
    } catch (error) {
      process.stderr.write(`${JSON.stringify({ type: 'ultra_durable_permission', tool_call_id: event.toolCallId,
        tool_name: event.toolName, decision: 'reject_once', scope: error.message })}\n`);
      return { block: true, reason: `ultra_durable_denied: ${error.message}` };
    }
    return undefined;
  });
  const { createAllToolDefinitions } = await import(pathToFileURL(config.native_tools_module).href);
  for (const tool of Object.values(createAllToolDefinitions(config.root))) pi.registerTool(tool);
  pi.on('session_start', (_event, ctx) => {
    const { grant } = verify(ctx);
    const claim = slice.json(path.join(durable.paths(config.root, config.grant_id).dir, 'claim.json'));
    const deadline = Math.min(Date.parse(grant.expires_at), Date.parse(claim.claimed_at) + grant.turn_timeout_seconds * 1000);
    process.once('exit', (code) => {
      if (code !== 0 || signalOutcome(claim.pid) !== 'alive') {
        try { durable.reportFailure(config.grant_id, stopReason, { projectRoot: config.root }); }
        catch { /* Missing history cannot authorize another input or notification. */ }
      }
    });
    // The fresh Host retains its own bound if the outer conductor dies.
    setTimeout(() => { stopReason = 'fresh_turn_deadline'; process.exit(2); }, Math.max(1, deadline - Date.now())).unref();
    pi.setActiveTools(pi.getAllTools().map((tool) => tool.name));
    process.stderr.write(`${JSON.stringify({ type: 'ultra_durable_ready', tools: pi.getActiveTools(),
      session_id: ctx.sessionManager.getSessionId(), claim_nonce: config.claim_nonce })}\n`);
  });
  pi.on('before_provider_request', (_event, ctx) => {
    try { verify(ctx); }
    catch (error) {
      stopReason = error.message;
      // Pi reports extension errors without necessarily aborting inference.
      // Exiting this isolated fresh process stops the provider call itself.
      process.stderr.write(`ultra_durable_stop: ${error.message}\n`);
      process.exit(2);
    }
  });
};
