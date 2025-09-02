import type { Session } from "@supabase/supabase-js";
import config from "./config.json";

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
