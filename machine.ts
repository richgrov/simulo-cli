import type { Session } from "@supabase/supabase-js";
import config from "./config.json";
import { GRAY, RESET } from "./shell.ts";

export async function setMachineProject(
  session: Session,
  machineId: string,
  projectId: string
) {
  const getResponse = await fetch(
    config.backend + "/machines/" + machineId + "/project",
    {
      headers: {
        Authorization: session.access_token,
      },
      method: "POST",
      body: JSON.stringify({ project_id: projectId }),
    }
  );

  if (!getResponse.ok) {
    console.error(
      "Error setting machine project: " + (await getResponse.text())
    );
    process.exit(1);
  }
}

export async function listMachines(session: Session) {
  const response = await fetch(config.backend + "/machines", {
    headers: {
      Authorization: session.access_token,
    },
  });

  if (!response.ok) {
    console.error("Error listing machines: " + (await response.text()));
    process.exit(1);
  }

  const json = (await response.json()) as { id: number; name: string }[];
  const longestName = json.reduce(
    (max, machine) => Math.max(max, machine.name.length),
    0
  );
  json.forEach((machine) => {
    const padding = " ".repeat(longestName - machine.name.length);
    console.log(`${machine.name}${padding} ${GRAY}${machine.id}${RESET}`);
  });
}
