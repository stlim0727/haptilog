export function splitDeploymentEnv(env) {
  const publicEnv = {},
    cloudflareEnv = {};
  for (const [name, value] of Object.entries(env)) {
    (/^(CLOUDFLARE_|CF_)/.test(name) ? cloudflareEnv : publicEnv)[name] = value;
  }
  return { publicEnv, cloudflareEnv };
}

export function deploymentCommands(
  production,
  publicEnv,
  cloudflareEnv,
  includePublish = true,
) {
  const commands = [
    { args: ["node_modules/typescript/bin/tsc", "--noEmit"], env: publicEnv },
    { args: ["node_modules/vite/bin/vite.js", "build"], env: publicEnv },
  ];
  if (includePublish)
    commands.push({
      args: [
        "node_modules/wrangler/bin/wrangler.js",
        "deploy",
        ...(production ? ["--env", "production"] : []),
      ],
      env: { ...publicEnv, ...cloudflareEnv },
    });
  return commands;
}
