import { runProtoExp01Experiment } from "./server/protoHistory/protoExp01LongshotShrinkage.js";

const res = runProtoExp01Experiment();
console.log("Overall Performance:", res.summary.overallPerformance);
