// Gera modelos 3D na Meshy a partir dos conceitos 2D. Uso: pnpm meshy <comando> (ver README.md).
// Sem dependências: só fetch do Node 22. A chave vem de MESHY_API_KEY e nunca é impressa.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CONCEPTS = join(ROOT, 'docs/assets/conceitos');
const MODELS = join(ROOT, 'apps/game/public/models');
const LOGS = join(ROOT, 'data/meshy');
const PROMPTS_DOC = join(ROOT, 'docs/assets/prompts-personagens.md');
const API = 'https://api.meshy.ai/openapi';
const COST = { image: 30, rig: 5 };

// Especificações por grupo (docs/assets/prompts-personagens.md, "Especificações técnicas").
// rig: 'humanoid' usa o rigging automático da Meshy (só humanoides); null = sem esqueleto por enquanto.
function specFor(id) {
  if (id.startsWith('class-')) return { polycount: 12000, rig: 'humanoid', height: 1.78 };
  if (id.startsWith('vulto-') || id === 'npc-lanceiro') return { polycount: 12000, rig: 'humanoid', height: 1.78 };
  if (id === 'npc-crianca') return { polycount: 6500, rig: 'humanoid', height: 1.25 };
  if (id === 'lenda-negrinho') return { polycount: 8000, rig: 'humanoid', height: 1.35 };
  if (id.startsWith('npc-')) return { polycount: 6500, rig: 'humanoid', height: 1.75 };
  if (id === 'boss-lobisomem') return { polycount: 20000, rig: 'humanoid', height: 2.6 };
  if (id === 'enemy-cria') return { polycount: 4500, rig: 'humanoid', height: 1.3 };
  if (id === 'enemy-cria-grauda') return { polycount: 6000, rig: 'humanoid', height: 2.0 };
  if (id.startsWith('enemy-') || id === 'lenda-negrinho-baio') return { polycount: 6000, rig: null, height: 1.0 };
  throw new Error(`id desconhecido: ${id}`);
}

function key() {
  const k = process.env.MESHY_API_KEY || process.env.MESHY_API_KEYy;
  if (!k) throw new Error('Defina MESHY_API_KEY (variável de ambiente ou arquivo .env na raiz, fora do git).');
  return k;
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitTask(kind, id) {
  let last = -1;
  for (;;) {
    const t = await api('GET', `/v1/${kind}/${id}`);
    if (t.progress !== last) { process.stdout.write(`  ${kind} ${t.status} ${t.progress ?? 0}%\n`); last = t.progress; }
    if (t.status === 'SUCCEEDED') return t;
    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(t.status)) throw new Error(`${kind} ${id} ${t.status}: ${JSON.stringify(t.task_error ?? {})}`);
    await sleep(10000);
  }
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url.split('?')[0]}`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  const { size } = await stat(file);
  console.log(`  salvo ${file.replace(ROOT + '/', '')} (${(size / 1048576).toFixed(1)} MB)`);
}

async function saveLog(id, log) {
  await mkdir(join(LOGS, id), { recursive: true });
  await writeFile(join(LOGS, id, 'log.json'), JSON.stringify(log, null, 2) + '\n');
}

const balance = async () => (await api('GET', '/v1/balance')).balance;

async function generate(id, opts) {
  const spec = specFor(id);
  const img = join(CONCEPTS, `${id}.jpg`);
  if (!existsSync(img)) throw new Error(`conceito não encontrado: ${img}`);
  const before = await balance();
  console.log(`${id}: créditos antes = ${before}`);
  const log = { id, date: new Date().toISOString().slice(0, 10), input: `docs/assets/conceitos/${id}.jpg`, spec, variants: [] };

  const dataUri = 'data:image/jpeg;base64,' + (await readFile(img)).toString('base64');
  const n = Number(opts.variants ?? 1);
  for (let v = 1; v <= n; v++) {
    console.log(` variação ${v}/${n}: Image to 3D (remesh ${spec.polycount} tri, PBR, pose A)`);
    // --from-task=<id> retoma uma geração já paga (ex.: download falhou) sem gastar créditos de novo.
    const taskId = opts['from-task'] && v === 1 ? opts['from-task'] : (await api('POST', '/v1/image-to-3d', {
      image_url: dataUri,
      ai_model: opts.model ?? 'latest',
      topology: 'triangle',
      target_polycount: spec.polycount,
      should_remesh: true,
      should_texture: true,
      enable_pbr: true,
      pose_mode: 'a-pose',
      symmetry_mode: 'auto',
    })).result;
    console.log(`  tarefa ${taskId}`);
    const t = await waitTask('image-to-3d', taskId);
    const variant = { n: v, image_to_3d_task: taskId, thumbnail: `${id}.v${v}.png` };
    log.variants.push(variant);
    await saveLog(id, log);
    await download(t.thumbnail_url, join(LOGS, id, variant.thumbnail));
    await download(t.model_urls.glb, join(LOGS, id, `${id}.v${v}.static.glb`));

    if (spec.rig && !opts['no-rig']) {
      console.log(` variação ${v}: rigging (${spec.height} m)`);
      let r;
      try {
        const rigId = opts['from-rig'] && v === 1 ? opts['from-rig'] : (await api('POST', '/v1/rigging', { input_task_id: taskId, height_meters: spec.height })).result;
        variant.rigging_task = rigId;
        await saveLog(id, log);
        r = await waitTask('rigging', rigId);
      } catch (e) {
        // O rigging automático só aceita humanoides; se falhar, fica o modelo estático.
        console.log(`  rigging falhou, mantendo o modelo sem esqueleto: ${e.message}`);
        variant.rigging_error = String(e.message).slice(0, 300);
        delete variant.rigging_task;
        continue;
      }
      const out = r.result ?? {};
      await download(out.rigged_character_glb_url, join(LOGS, id, `${id}.v${v}.glb`));
      const anims = out.basic_animations ?? {};
      for (const [k, url] of Object.entries(anims)) {
        if (!k.endsWith('_glb_url') || !url) continue;
        await download(url, join(LOGS, id, `${id}.v${v}.${k.replace('_glb_url', '')}.glb`));
      }
    }
  }
  const after = await balance();
  // Custo por tarefa (medido em 2026-11-25): Image to 3D com textura = 30, rigging = 5.
  // Calculado por tarefa porque o saldo muda se várias gerações rodam ao mesmo tempo.
  const spent = log.variants.reduce((sum, x) => sum + (opts['from-task'] && x.n === 1 ? 0 : COST.image) + (x.rigging_task ? COST.rig : 0), 0);
  log.credits = { spent, balance_after: after };
  console.log(`${id}: ~${spent} créditos; saldo agora ${after}`);
  await saveLog(id, log);
  console.log(`Escolha a variação e rode: pnpm meshy pick ${id} <n>`);
}

// Copia a variação escolhida para o jogo e registra a procedência.
async function pick(id, v) {
  const dir = join(LOGS, id);
  const log = JSON.parse(await readFile(join(dir, 'log.json'), 'utf8'));
  const variant = log.variants.find((x) => x.n === Number(v));
  if (!variant) throw new Error(`variação ${v} não existe em ${id}`);
  const { copyFile } = await import('node:fs/promises');
  await mkdir(MODELS, { recursive: true });
  const rigged = join(dir, `${id}.v${v}.glb`);
  const src = existsSync(rigged) ? rigged : join(dir, `${id}.v${v}.static.glb`);
  // Texturas da Meshy vêm em 2048 px PNG/JPEG (~10 MB); reduz para 1024 px WebP (~2 MB), como pede a especificação.
  const out = join(MODELS, `${id}.glb`);
  const tmp = join(dir, `${id}.v${v}.resized.glb`);
  const cli = (...a) => execFileSync('gltf-transform', a, { stdio: 'inherit' });
  if (src === rigged) cli('resize', src, tmp, '--width', '1024', '--height', '1024');
  else {
    // Sem esqueleto a Meshy entrega o modelo centrado na origem: põe os pés em Y = 0.
    cli('center', src, tmp, '--pivot', 'below');
    cli('resize', tmp, tmp, '--width', '1024', '--height', '1024');
  }
  cli('webp', tmp, out);
  const { unlink } = await import('node:fs/promises');
  await unlink(tmp);
  // Animações só com o esqueleto (~0,1 MB): o jogo aplica no modelo acima.
  for (const anim of ['walking', 'running']) {
    const f = join(dir, `${id}.v${v}.${anim}_armature.glb`);
    if (existsSync(f)) await copyFile(f, join(MODELS, `${id}.${anim}.glb`));
  }
  log.picked = Number(v);
  await writeFile(join(dir, 'log.json'), JSON.stringify(log, null, 2) + '\n');

  const doc = await readFile(PROMPTS_DOC, 'utf8');
  const tasks = [variant.image_to_3d_task, variant.rigging_task].filter(Boolean).join(', ');
  const row = `| \`${id}\` | Meshy API (plano pago, privado), Image to 3D + remesh${variant.rigging_task ? ' + rigging' : ''} | ${log.date} | \`${log.input}\` | ${v} de ${log.variants.length} | texturas 1024 px WebP (script) | tarefas ${tasks}; ~${log.credits.spent} créditos |`;
  const lines = doc.split('\n').filter((l) => !l.startsWith(`| \`${id}\` | Meshy`) && l !== '| | | | | | | |');
  const header = lines.findIndex((l) => l.startsWith('| id | ferramenta e plano'));
  lines.splice(header + 2, 0, row);
  await writeFile(PROMPTS_DOC, lines.join('\n'));
  console.log(`${id}: variação ${v} copiada para apps/game/public/models/ e registrada na procedência.`);
}

const [cmd, ...rest] = process.argv.slice(2);
const opts = {};
const args = [];
for (const a of rest) {
  if (a.startsWith('--')) { const [k, val] = a.slice(2).split('='); opts[k] = val ?? true; } else args.push(a);
}
try {
  if (cmd === 'balance') console.log(`créditos: ${await balance()}`);
  else if (cmd === 'gen' && args.length) for (const id of args) await generate(id, opts);
  else if (cmd === 'pick' && args.length === 2) await pick(args[0], args[1]);
  else {
    console.log('uso: pnpm meshy balance | gen <id...> [--variants=N] [--no-rig] [--model=latest] | pick <id> <n>');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(String(e.message ?? e));
  process.exitCode = 1;
}
