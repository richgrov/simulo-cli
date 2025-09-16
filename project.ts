import { type Session } from "@supabase/supabase-js";
import path from "path";
import { Glob } from "bun";

import config from "./config.json";
import { GREEN, RED, RESET, GRAY, input } from "./shell.ts";

const legacyProjectFile = Bun.file(".project-id");
const projectFile = Bun.file("simulo.json");

interface ProjectConfig {
  project_id: string;
  build_dir?: string | undefined;
}

export async function createProject(name: string, session: Session) {
  const response = await fetch(config.backend + "/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: session.access_token,
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    console.error("Error creating project: " + (await response.text()));
    process.exit(1);
  }

  const json = (await response.json()) as { id: number };

  await projectFile.write(JSON.stringify({ project_id: json.id.toString() }));
}

export async function listProjects(session: Session) {
  const response = await fetch(config.backend + "/projects", {
    headers: {
      Authorization: session.access_token,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to list projects");
  }

  const json = (await response.json()) as { id: number; name: string }[];
  json.forEach((project) => {
    console.log(`${project.id}: ${project.name}`);
  });
}

export type Asset = {
  hash: string;
  data: ArrayBuffer;
  absolutePath: string;
};

export async function syncAssets(session: Session) {
  const projectConfig = await readSimuloConfig();
  const getResponse = await fetch(
    config.backend + "/projects/" + projectConfig.project_id + "/assets",
    {
      headers: {
        Authorization: session.access_token,
      },
    }
  );

  if (!getResponse.ok) {
    console.error("Error getting assets: " + (await getResponse.text()));
    process.exit(1);
  }

  const remoteAssetHashes = (await getResponse.json()) as Record<
    string,
    string
  >;
  const localAssets = await readLocalAssets(
    "{main.wasm,*.png}",
    projectConfig.build_dir || "."
  );

  const formData = new FormData();
  const hashes: Record<string, string> = {};

  let message = "The following changes will be made:";
  let changed = false;
  for (const [file, asset] of Object.entries(localAssets)) {
    hashes[file] = asset.hash;

    const added =
      !remoteAssetHashes[file] || remoteAssetHashes[file] !== asset.hash;

    if (!added) {
      continue;
    }

    formData.append(file, Bun.file(asset.absolutePath));
    message += `\n${GREEN}+${RESET} ${file} ${GRAY}${asset.hash}${RESET}`;
    changed = true;
  }

  for (const [file, hash] of Object.entries(remoteAssetHashes)) {
    const removed = !localAssets[file] || localAssets[file]!.hash !== hash;

    if (!removed) {
      continue;
    }

    message += `\n${RED}-${RESET} ${file} ${GRAY}${hash}${RESET}`;
    changed = true;
  }

  if (changed) {
    console.log(message);
  } else {
    console.log("Already up to date");
    process.exit(0);
  }

  const confirm = await input("Continue? (y/N): ");
  if (confirm.toLowerCase() !== "y") {
    process.exit(1);
  }

  formData.append("hashes", JSON.stringify(hashes));

  process.stdout.write(`Uploading assets...`);
  const uploadResponse = await fetch(
    config.backend + "/projects/" + projectConfig.project_id + "/assets",
    {
      method: "POST",
      headers: {
        Authorization: session.access_token,
      },
      body: formData,
    }
  );

  if (!uploadResponse.ok) {
    console.error("\nError uploading assets: " + (await uploadResponse.text()));
    process.exit(1);
  }

  process.stdout.write("done\n");
}

async function readSimuloConfig(): Promise<ProjectConfig> {
  if (await projectFile.exists()) {
    const content = await projectFile.text();
    return JSON.parse(content);
  }

  if (await legacyProjectFile.exists()) {
    const legacyId = await legacyProjectFile.text();
    await projectFile.write(JSON.stringify({ project_id: legacyId }));
    await Bun.file(".project-id").delete();
    console.log("Migrated legacy .project-id file to simulo.json");
    return { project_id: legacyId };
  }

  console.error("This command must be run in a simulo project directory");
  process.exit(1);
}

async function readLocalAssets(
  glob: string,
  dir: string
): Promise<Record<string, Asset>> {
  const files: Record<string, Asset> = {};

  const promises = [];
  for await (const file of new Glob(glob).scan(dir)) {
    const absolutePath = path.resolve(dir, file);

    promises.push(
      Bun.file(absolutePath)
        .arrayBuffer()
        .then((arrayBuffer) => {
          const hash = Bun.SHA256.hash(arrayBuffer) as Uint8Array;
          files[file] = {
            hash: Buffer.from(hash).toString("hex"),
            data: arrayBuffer,
            absolutePath,
          };
        })
    );
  }

  await Promise.all(promises);
  return Promise.resolve(files);
}
