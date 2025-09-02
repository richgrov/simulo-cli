import { type Session } from "@supabase/supabase-js";
import path from "path";
import { Glob } from "bun";

import config from "./config.json";
import { GREEN, RED, RESET, GRAY, input } from "./shell.ts";

const projectFile = Bun.file(".project-id");

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

  await projectFile.write(json.id.toString());
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

export async function syncAssets(session: Session, directory: string) {
  const projectId = await cwdProjectId();
  const getResponse = await fetch(
    config.backend + "/projects/" + projectId + "/assets",
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
  const localAssets = await readLocalAssets("{main.wasm,*.png}", directory);

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
    config.backend + "/projects/" + projectId + "/assets",
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

async function cwdProjectId() {
  if (!(await projectFile.exists())) {
    console.error("This command must be run in a simulo project directory");
    process.exit(1);
  }

  return await projectFile.text();
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
