import fs from "fs";
const data = JSON.parse(fs.readFileSync("data/protoExp01LongshotShrinkage.json", "utf-8"));
const settled = data.records.filter((r: any) => r.isSettled);

let retV1 = 0;
let retExp = 0;
let retNv = 0;

for (const r of settled) {
  if (r.isHitV1) {
    const o = r.v1Pick === "win" ? r.odds.win : (r.v1Pick === "draw" ? r.odds.draw : r.odds.lose);
    retV1 += o;
  }
  if (r.isHitExp01) {
    const o = r.exp01Pick === "win" ? r.odds.win : (r.exp01Pick === "draw" ? r.odds.draw : r.odds.lose);
    retExp += o;
  }
  if (r.isHitNoVig) {
    const o = r.noVigPick === "win" ? r.odds.win : (r.noVigPick === "draw" ? r.odds.draw : r.odds.lose);
    retNv += o;
  }
}

console.log("N:", settled.length);
console.log("retV1:", retV1, "ROI V1:", ((retV1 - settled.length) / settled.length) * 100);
console.log("retExp:", retExp, "ROI Exp:", ((retExp - settled.length) / settled.length) * 100);
console.log("retNv:", retNv, "ROI Nv:", ((retNv - settled.length) / settled.length) * 100);
