// Dev tool: print an ASCII map of a seed so we can sanity-check the geography.
import { generateWorld, idx, isAdjacentToWater, heightAt } from '../src/lib/sim/world';
import { MAP_H, MAP_W } from '../src/lib/sim/constants';

const seed = Number(process.argv[2] ?? 1);
const w = generateWorld(seed);

const treeSet = new Set(w.trees.filter((t) => t.state === 'tree').map((t) => idx(t.tx, t.ty)));
const oreSet = new Set(w.ores.map((o) => idx(o.tx, o.ty)));

let out = `seed ${seed}  (T=tree o=ore ~=water .=grass #=rock)  player start ~ (14,27)\n`;
for (let ty = 0; ty < MAP_H; ty++) {
  let row = String(ty).padStart(2, ' ') + ' ';
  for (let tx = 0; tx < MAP_W; tx++) {
    const i = idx(tx, ty);
    const t = w.tiles[i];
    let ch = '.';
    if (t.terrain === 'water') ch = '~';
    else if (t.terrain === 'rock') ch = '#';
    if (treeSet.has(i)) ch = 'T';
    if (oreSet.has(i)) ch = 'o';
    row += ch;
  }
  out += row + '\n';
}

// Candidate flume head: a top-terrace grass tile beside water.
const heads: string[] = [];
for (let ty = 1; ty <= 10; ty++)
  for (let tx = 1; tx < MAP_W - 1; tx++)
    if (w.tiles[idx(tx, ty)].terrain === 'grass' && isAdjacentToWater(w.tiles, tx, ty))
      heads.push(`(${tx},${ty})`);

// Candidate incline sites: tiles bordering a downhill step near the ore.
const inclines: string[] = [];
for (const o of w.ores) {
  for (let ty = o.ty; ty <= o.ty + 3; ty++)
    for (let tx = o.tx - 2; tx <= o.tx + 2; tx++) {
      const h = heightAt(w.tiles, tx, ty);
      if (
        heightAt(w.tiles, tx + 1, ty) < h ||
        heightAt(w.tiles, tx - 1, ty) < h ||
        heightAt(w.tiles, tx, ty + 1) < h ||
        heightAt(w.tiles, tx, ty - 1) < h
      )
        inclines.push(`(${tx},${ty})`);
    }
}

console.log(out);
console.log('flume-head candidates (top terrace, beside water):', heads.slice(0, 8).join(' '));
console.log('ore cluster:', w.ores.map((o) => `(${o.tx},${o.ty})`).join(' '));
console.log('incline candidates near ore:', [...new Set(inclines)].slice(0, 8).join(' '));
