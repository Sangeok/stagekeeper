import assert from "node:assert/strict";
import { it } from "node:test";
import { checkpoint, ordered } from "./fixtures/async-control";

it("orders two participants and holds the loser until the winner finishes", { timeout: 1000 }, async () => {
  const race = ordered();
  const pending: Promise<void>[] = [];
  let winnerFinished = false, loserFinished = false;
  try {
    const first = race.winner().then(() => { winnerFinished = true; }); pending.push(first);
    await Promise.resolve();
    assert.equal(winnerFinished, false);
    const second = race.loser().then(() => { loserFinished = true; }); pending.push(second);
    await first;
    assert.equal(loserFinished, false);
    race.finish();
    await second;
    assert.equal(loserFinished, true);
  } finally { race.cancel(); await Promise.allSettled(pending); }
});

for (const phase of ["participants", "commit"] as const) {
  it(`cancels an ordered barrier waiting for ${phase}`, { timeout: 1000 }, async () => {
    const race = ordered();
    const waiting = phase === "participants" ? race.winner() : race.loser();
    const rejected = assert.rejects(waiting, /ordered barrier cancelled/);
    try {
      if (phase === "commit") await race.winner();
      race.cancel();
      await rejected;
    } finally { race.cancel(); await Promise.allSettled([waiting, rejected]); }
  });

  it(`fails an ordered barrier waiting for ${phase} past its deadline`, { timeout: 1000 }, async () => {
    const race = ordered(20);
    const waiting = phase === "participants" ? race.winner() : race.loser();
    const rejected = assert.rejects(waiting, phase === "participants" ? /participants did not arrive/ : /winner did not finish/);
    try {
      if (phase === "commit") await race.winner();
      await rejected;
    } finally { race.cancel(); await Promise.allSettled([waiting, rejected]); }
  });
}

it("reports checkpoint entry and holds the query until release", { timeout: 1000 }, async () => {
  const gate = checkpoint();
  let finished = false;
  const pending = gate.hook().then(() => { finished = true; });
  try {
    await gate.entered();
    assert.equal(finished, false);
    gate.release();
    await pending;
    assert.equal(finished, true);
  } finally { gate.release(); await Promise.allSettled([pending]); }
});

it("accepts release before a query reaches its checkpoint", { timeout: 1000 }, async () => {
  const gate = checkpoint();
  gate.release();
  await gate.hook();
  await gate.entered();
});

it("fails a checkpoint whose query never arrives", { timeout: 1000 }, async () => {
  const gate = checkpoint(20);
  try { await assert.rejects(gate.entered(), /checkpoint did not arrive/); }
  finally { gate.release(); }
});

it("fails a checkpoint whose query is never released", { timeout: 1000 }, async () => {
  const gate = checkpoint(20);
  try { await assert.rejects(gate.hook(), /checkpoint was not released/); }
  finally { gate.release(); }
});
