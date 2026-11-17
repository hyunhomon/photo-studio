// Retired entrypoint: no credentials are read and no settings are changed.
console.info(
  "Shutterstock integration has been retired. Use uploaded references and optional Nano Banana refinement.",
);
if (!process.argv.includes("--help")) process.exitCode = 1;
