import { z } from "zod";
import { readAtlasText } from "./http";

const requestSchema = z.object({
  release: z.enum(["v0", "v2023_02"]),
  selection: z.enum(["full", "highquality_clust30"]),
  artifact: z.enum(["structures", "foldseek", "embeddings"]),
}).strict();
const MANIFESTS = { structures: "tarballs.txt", foldseek: "foldseekdb.txt", embeddings: "esm2_embeddings.txt" };
const REPOSITORY = "https://raw.githubusercontent.com/facebookresearch/esm/main/scripts/atlas";
const DATA = "https://dl.fbaipublicfiles.com/esmatlas";
const MAX_MANIFEST_BYTES = 1_000_000;

/** Discover provider artifact URLs only; never download binaries or run inference. */
export async function getBulkManifest(params: Record<string, unknown> | undefined): Promise<Record<string, unknown>> {
  const selection = requestSchema.parse(params ?? {});
  const { release, artifact } = selection;
  if (selection.selection === "highquality_clust30" && (release !== "v0" || artifact === "embeddings")) {
    throw new Error("highquality_clust30 has documented v0 structures and Foldseek files only");
  }
  const prefix = `${release}/${selection.selection}`;
  const source = `${REPOSITORY}/${prefix}/${MANIFESTS[artifact]}`;
  const response = await readAtlasText(source, MAX_MANIFEST_BYTES);
  const text = response.text;
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Atlas manifest is empty");
  const data = lines.map(line => {
    const url = new URL(line);
    if (!url.href.startsWith(`${DATA}/${prefix}/`) || url.search || url.hash || url.username || url.password) {
      throw new Error("Atlas manifest contains an unexpected artifact URL");
    }
    return { ...selection, url: url.href, filename: url.pathname.split("/").pop() };
  });
  return {
    ...selection, source_manifest: source, manifest_text_sha256: response.body_sha256,
    manifest_text: text, manifest_bytes: response.body_bytes,
    retrieved_at: response.retrieved_at, etag: response.etag,
    total_count: data.length, data,
    interpretation: "Complete URL manifest, not downloaded artifacts. Release labels refer to the selected archive; no new-release or structure-availability claim. Run bulk compute outside Code Mode.",
  };
}
