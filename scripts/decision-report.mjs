import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function routeAgreement(trace) {
  if (['error', 'unknown'].includes(trace.legacyKind)) return null;
  const actions = trace.legacyActionTypes || [], cards = trace.legacyCardTypes || [];
  switch (trace.route) {
    case 'countdown': return cards.includes('CountdownCard');
    case 'todo': return cards.includes('TodoCard');
    case 'note': return cards.includes('NoteCard');
    case 'search': return trace.legacyUsedProvider === 'search' || cards.some(c => /Weather/.test(c));
    case 'overview': return actions.includes('canvas.fit');
    case 'restore': return actions.includes('canvas.restore');
    case 'focus': return actions.includes('card.focus');
    case 'highlight': return actions.includes('card.highlight');
    case 'delete': return actions.some(a => ['card.delete', 'cards.delete'].includes(a));
    case 'undo': return actions.some(a => ['history.undo', 'history.redo'].includes(a));
    case 'chat': case 'answer': return !cards.length && (trace.legacyKind === 'locale' ||
      actions.length > 0 && actions.every(a => ['stage.awaken', 'subtitle.show', 'subtitle.hide'].includes(a)));
    default: return null;
  }
}

export function summarizeDecisions(rows) {
  const known = new Set(['chat', 'answer', 'search', 'countdown', 'todo', 'note', 'generate', 'focus',
    'overview', 'restore', 'highlight', 'edit', 'arrange', 'delete', 'undo', 'unsupported']);
  const groups = {}, output = { total: rows.length, pending: 0, failures: 0, undone: 0, byRoute: groups,
    note: 'Agreement is a legacy-output proxy, not labeled model accuracy. Browser proposals are not execution receipts.' };
  for (const row of rows) {
    const trace = row.trace;
    const name = known.has(trace.route) ? trace.route : trace.status === 'pending' ? 'pending'
      : trace.failedCount ? 'unavailable' : 'abstain';
    const group = groups[name] ||= { count: 0, compared: 0, agreed: 0, undone: 0, failures: 0, latencies: [], outcomes: {} };
    group.count++; group.undone += Number(Boolean(row.undone)); output.undone += Number(Boolean(row.undone));
    group.failures += trace.failedCount || 0; output.failures += trace.failedCount || 0;
    if (trace.status === 'pending') output.pending++;
    else {
      const value = trace.routeLatencyMs ?? trace.latencyMs;
      if (Number.isFinite(value)) group.latencies.push(value);
      const agreement = routeAgreement(trace);
      if (agreement !== null) { group.compared++; group.agreed += Number(agreement); }
    }
    const status = ['proposed', 'pending', 'succeeded', 'failed', 'clarify', 'error'].includes(row.outcome) ? row.outcome : 'other';
    group.outcomes[status] = (group.outcomes[status] || 0) + 1;
  }
  for (const group of Object.values(groups)) {
    group.latencies.sort((a, b) => a - b);
    const percentile = p => group.latencies.length ? group.latencies[Math.max(0, Math.ceil(group.latencies.length * p) - 1)] : null;
    group.p50_ms = percentile(.5); group.p95_ms = percentile(.95);
    group.agreement = group.compared ? Math.round(group.agreed / group.compared * 10000) / 10000 : null;
    delete group.latencies;
  }
  return output;
}

function main() {
  const args = process.argv.slice(2);
  const value = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const hours = Number(value('--hours') || 24), accountId = value('--account');
  if (!Number.isFinite(hours) || hours <= 0 || hours > 720 || accountId && !/^[A-Za-z0-9_-]{1,128}$/.test(accountId)) throw Error('Invalid report filter');
  const options = Buffer.from(JSON.stringify({ since: new Date(Date.now() - hours * 3600000).toISOString(), accountId })).toString('base64');
  const program = `import {DatabaseSync} from 'node:sqlite';
const routeAgreement=${routeAgreement.toString()};
const summarizeDecisions=${summarizeDecisions.toString()};
const options=JSON.parse(Buffer.from('${options}','base64').toString());
const db=new DatabaseSync('/data/vivic/space.sqlite',{readOnly:true});
if(!db.prepare("SELECT name FROM sqlite_master WHERE name='decision_log'").get()){console.log(JSON.stringify({available:false,total:0,reason:'not-deployed'}));process.exit(0);}
const rows=db.prepare(\`SELECT outcome,undone,
json_extract(trace_json,'$.route') AS route,json_extract(trace_json,'$.status') AS status,
json_extract(trace_json,'$.legacyKind') AS legacyKind,json_extract(trace_json,'$.legacyUsedProvider') AS legacyUsedProvider,
json_extract(trace_json,'$.legacyActionTypes') AS actions,json_extract(trace_json,'$.legacyCardTypes') AS cards,
json_extract(trace_json,'$.latencyMs') AS latencyMs,json_extract(trace_json,'$.routeLatencyMs') AS routeLatencyMs,
json_extract(trace_json,'$.failedCount') AS failedCount FROM decision_log
WHERE at>=? AND (? IS NULL OR account_id=?) ORDER BY id DESC LIMIT 20000\`).all(options.since,options.accountId||null,options.accountId||null);
const input=rows.map(x=>({outcome:x.outcome,undone:x.undone,trace:{...x,legacyActionTypes:JSON.parse(x.actions||'[]'),legacyCardTypes:JSON.parse(x.cards||'[]')}}));
db.close();console.log(JSON.stringify({available:true,...summarizeDecisions(input)}));`;
  const command = "docker exec -i vivic-preview-20261027 node --no-warnings --input-type=module <<'VIVIC_REPORT'\n" + program + '\nVIVIC_REPORT\n';
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const python = process.env.VIVIC_SSH_PYTHON || (process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA, 'Programs', 'Python', 'Python312', 'python.exe') : 'python3');
  const runner = process.env.VIVIC_SSH_RUNNER || resolve(repo, '..', 'tools', 'vssh.py');
  const result = spawnSync(python, ['-I', runner], { input: command, maxBuffer: 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error('Decision report could not read deployed storage');
  process.stdout.write(result.stdout);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
