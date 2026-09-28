import fs from "node:fs/promises";
import path from "node:path";

export class StateStore {
  constructor(dataDir) {
    this.path = path.join(dataDir, "state.json");
    this.state = { version: 1, pairs: {}, stats: {} };
  }

  async load() {
    await fs.mkdir(path.dirname(this.path), { recursive: true });
    try {
      this.state = JSON.parse(await fs.readFile(this.path, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return this.state;
  }

  async save() {
    const temporary = `${this.path}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(this.state, null, 2)}\n`, {
      mode: 0o600
    });
    await fs.rename(temporary, this.path);
  }
}
