#!/usr/bin/env node
/**
 * Automatically applies core patches to acp-kernel in node_modules
 * - A1/A2: Segment on user messages & exclude user messages from compressible ranges (prevents deadlock)
 * - D: Disallow merging across reference gaps in mergeRangesToThreshold
 * - B: Graceful fallback injection under pressure when tiers calculation is below floor
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetFile = path.resolve(__dirname, '../node_modules/acp-kernel/dist/index.js');

if (!fs.existsSync(targetFile)) {
  console.log(`[patch-kernel] acp-kernel dist not found at ${targetFile}, skipping.`);
  process.exit(0);
}

let code = fs.readFileSync(targetFile, 'utf8');
let modified = false;

// Patch A1: if (cur && (info.isUser && cur.count >= 3 || info.gapBefore)) -> if (cur && (info.isUser || info.gapBefore))
const a1Old = 'if (cur && (info.isUser && cur.count >= 3 || info.gapBefore)) {';
const a1New = 'if (cur && (info.isUser || info.gapBefore)) {';
if (code.includes(a1Old)) {
  code = code.replace(a1Old, a1New);
  console.log('[patch-kernel] Applied A1: segment on user messages');
  modified = true;
}

// Patch A2: user messages do not enter compressible ranges
const a2Old = `    if (cur && (info.isUser || info.gapBefore)) {
      compressible.push(cur);
      cur = null;
    }
    if (!cur) {`;
const a2New = `    if (cur && (info.isUser || info.gapBefore)) {
      compressible.push(cur);
      cur = null;
    }
    if (info.isUser) continue;
    if (!cur) {`;
if (code.includes(a2Old)) {
  code = code.replace(a2Old, a2New);
  console.log('[patch-kernel] Applied A2: exclude user messages from ranges');
  modified = true;
}

// Patch D: prevent merging across ref gaps
const dOld = `  for (const r of ranges) {
    batch.push(r);
    batchChars += rangeChars(r);`;
const dNew = `  for (const r of ranges) {
    if (batch.length > 0 && (refToIndex(r.startRef) ?? 0) > (refToIndex(batch[batch.length - 1].endRef) ?? 0) + 1) {
      result.push(mergeBatch(batch));
      batch = [];
      batchChars = 0;
    }
    batch.push(r);
    batchChars += rangeChars(r);`;
if (code.includes(dOld)) {
  code = code.replace(dOld, dNew);
  console.log('[patch-kernel] Applied D: prevent merging across gaps');
  modified = true;
}

// Patch B: pressure fallback
const bOld = `    if (best !== null && bestPending >= minPressureBenefit) {
      injectedTier = best;
      const label = emergencyOverride ? "EMERGENCY" : "OVER-LIMIT";
      injectedReason = best === 1 ? \`\${label} T1: max effective pending \${bestPending}, usage \${Math.round(usage * 100)}%\` : \`\${label} T\${best} distill: max pending \${bestPending} (T1 effective \${t1Eff}, T2 \${t2Pen}, T3 \${t3Pen}), usage \${Math.round(usage * 100)}%\`;
    }`;
const bNew = `    if (best !== null && bestPending >= minPressureBenefit) {
      injectedTier = best;
      const label = emergencyOverride ? "EMERGENCY" : "OVER-LIMIT";
      injectedReason = best === 1 ? \`\${label} T1: max effective pending \${bestPending}, usage \${Math.round(usage * 100)}%\` : \`\${label} T\${best} distill: max pending \${bestPending} (T1 effective \${t1Eff}, T2 \${t2Pen}, T3 \${t3Pen}), usage \${Math.round(usage * 100)}%\`;
    } else {
      const fallbackRanges = rec?.recommendedRanges ?? [];
      if (fallbackRanges.length > 0) {
        injectedTier = 1;
        const label = emergencyOverride ? "EMERGENCY" : "OVER-LIMIT";
        injectedReason = \`\${label} T1 fallback: \${fallbackRanges.length} ranges available, usage \${Math.round(usage * 100)}%\`;
      }
    }`;
if (!code.includes('fallbackRanges') && code.includes(bOld)) {
  code = code.replace(bOld, bNew);
  console.log('[patch-kernel] Applied B: pressure fallback injection');
  modified = true;
}

if (modified) {
  fs.writeFileSync(targetFile, code, 'utf8');
  console.log('[patch-kernel] acp-kernel patched successfully.');
} else {
  console.log('[patch-kernel] acp-kernel already up to date.');
}
